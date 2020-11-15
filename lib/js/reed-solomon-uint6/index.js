var rsGFexp = [
  1, 2, 4, 8, 16, 32, 3, 6, 12, 24, 48, 35, 5, 10, 20, 40,
  19, 38, 15, 30, 60, 59, 53, 41, 17, 34, 7, 14, 28, 56, 51, 37,
  9, 18, 36, 11, 22, 44, 27, 54, 47, 29, 58, 55, 45, 25, 50, 39,
  13, 26, 52, 43, 21, 42, 23, 46, 31, 62, 63, 61, 57, 49, 33, 0
];

var rsGFlog = [
  63, 0, 1, 6, 2, 12, 7, 26, 3, 32, 13, 35, 8, 48, 27, 18,
  4, 24, 33, 16, 14, 52, 36, 54, 9, 45, 49, 38, 28, 41, 19, 56,
  5, 62, 25, 11, 34, 31, 17, 47, 15, 23, 53, 51, 37, 44, 55, 40,
  10, 61, 46, 30, 50, 22, 39, 43, 29, 60, 42, 21, 20, 59, 57, 58
];

/*
 * RS(63, (63 - nroots), (nroots + 1)) where nroots = bitlen(parity).
 * called w/ decode(8, 39, hb), decode(16, 27, hb), decode(12, 39, hb).
 * where hb is an array of uint_6 aka "hex bits".
 */
function decode(nroots, FirstInfo, HB) {
  var lambda = new Array(18).fill(0); // Err+Eras locator poly
  var S      = new Array(17).fill(0); // syndrome poly
  var b      = new Array(18).fill(0);
  var t      = new Array(18).fill(0);
  var omega  = new Array(18).fill(0);
  var root   = new Array(17).fill(0);
  var reg    = new Array(18).fill(0);
  var locn   = new Array(17).fill(0);

  var i = j = r = q = el = 0;
  var SynError = DiscrR = DegOmega = DegLambda = 0;
  var count = tmp = num1 = num2 = den = 0;

  // form the syndromes aka evaluate HB(x) at roots of g(x)
  for (i = 0; i <= nroots - 1; i++) {
    S[i] = HB[0];
  }
  for (j = 1; j <= 62; j++) {
    for (i = 0; i <= nroots - 1; i++) {
      if (S[i] === 0) {
        S[i] = HB[j];
      } else {
        S[i] = HB[j] ^ rsGFexp[(rsGFlog[S[i]] + i + 1) % 63];
      }
    }
  }

  // convert syndromes to index form, checking for nonzero condition
  SynError = 0;
  for (i = 0; i <= nroots - 1; i++) {
    SynError = SynError | S[i];
    S[i] = rsGFlog[S[i]];
  }

  // if syndrome is zero then data is a codeword, so no errors to correct ^.^
  if (SynError === 0) {
    count = 0;
    return 0;
  }

  lambda[0] = 1;
  for (i = 1; i <= nroots; i++) {
    lambda[i] = 0;
  }

  for (i = 0; i <= nroots; i++) {
    b[i] = rsGFlog[lambda[i]];
  }

  // begin Berlekamp-Massey algorithm to determine error & erasure locator polynomial
  r = el = 0;
  while (r < nroots) {
    r += 1;
    // compute discrepancy at the r-th step in poly-form
    DiscrR = 0;
    for (i = 0; i <= r - 1; i++) {
      if (lambda[i] !== 0 && S[r - i - 1] !== 63) {
        DiscrR = DiscrR ^ rsGFexp[(rsGFlog[lambda[i]] + S[r - i - 1]) % 63];
      }
    }
    DiscrR = rsGFlog[DiscrR]; // index form

    if (DiscrR === 63) {
      // shift elements upward one step
      for (i = nroots; i >= 1; i += -1) {
        b[i] = b[i - 1];
      }
      b[0] = 63;
    } else {
      // t(x) <-- lambda(x) - DiscrR*x*b(x)
      t[0] = lambda[0];
      for (i = 0; i <= nroots - 1; i++) {
        if (b[i] !== 63) {
          t[i + 1] = lambda[i + 1] ^ rsGFexp[(DiscrR + b[i]) % 63];
        } else {
          t[i + 1] = lambda[i + 1];
        }
      }
      if (2 * el <= r - 1) {
        el = r - el;
        // b(x) <-- inv(DiscrR) * lambda(x)
        for (i = 0; i <= nroots; i++) {
          if (lambda[i] !== 0) {
            b[i] = (rsGFlog[lambda[i]] - DiscrR + 63) % 63;
          } else {
            b[i] = 63;
          }
        }
      } else {
        // shift elements upward one step
        for (i = nroots; i >= 1; i += -1) {
          b[i] = b[i - 1];
        }
        b[0] = 63;
      }
      for (i = 0; i <= nroots; i++) {
        lambda[i] = t[i];
      }
    }
  } // end while()

  // convert lambda to index form and compute deg(lambda(x))
  DegLambda = 0;
  for (i = 0; i <= nroots; i++) {
    lambda[i] = rsGFlog[lambda[i]];
    if (lambda[i] !== 63) {
      DegLambda = i;
    }
  }

  // find roots of the error & erasure locator polynomial by Chien search
  for (i = 1; i <= nroots; i++) {
    reg[i] = lambda[i];
  }
  count = 0; // number of roots of lambda(x)
  for (i = 1; i <= 63; i++) {
    q = 1; // lambda[0] is always 0
    for (j = DegLambda; j >= 1; j += -1) {
      if (reg[j] !== 63) {
        reg[j] = (reg[j] + j) % 63;
        q = q ^ rsGFexp[reg[j]];
      }
    }

    // it is a root
    if (q === 0) {
      // store root (index-form) and error location number
      root[count] = i;
      locn[count] = i - 1;
      count = count + 1;
      // if we have max possible roots then abort search to save time
      if (count === DegLambda) { break; }
    }
  }

  // deg(lambda) unequal to number of roots, so uncorrectable error :[
  if (DegLambda !== count) {
    return -1;
  }

  /* compute err & eras evaluator poly omega(x) = s(x)*lambda(x) (modulo x**nroots),
   * in index form, also find deg(omega) */
  DegOmega = 0;
  for (i = 0; i <= nroots - 1; i++) {
    tmp = 0;
    if (DegLambda < i) {
      j = DegLambda;
    } else {
      j = i;
    }
    for (/* j = j */; j >= 0; j += -1) {
      if (S[i - j] !== 63 && lambda[j] !== 63) {
        tmp = tmp ^ rsGFexp[(S[i - j] + lambda[j]) % 63];
      }
    }
    if (tmp !== 0) {
      DegOmega = i;
    }
    omega[i] = rsGFlog[tmp];
  }
  omega[nroots] = 63;

  /* compute error values in poly-form:
   *   num1 = omega(inv(X(l)))
   *   num2 = inv(X(l))**(FCR - 1)
   *   den  = lambda_pr(inv(X(l))) */
  for (j = count - 1; j >= 0; j += -1) {
    num1 = 0;
    for (i = DegOmega; i >= 0; i += -1) {
      if (omega[i] !== 63) {
        num1 = num1 ^ rsGFexp[(omega[i] + i * root[j]) % 63];
      }
    }
    num2 = rsGFexp[0];
    den = 0;

    // lambda[i+1] for i even is the formal derivative lambda_pr of lambda[i]
    if (DegLambda < nroots) {
      i = DegLambda;
    } else {
      i = nroots;
    }

    for (i = i & ~1; i >= 0; i += -2) {
      if (lambda[i + 1] !== 63) {
        den = den ^ rsGFexp[(lambda[i + 1] + i * root[j]) % 63];
      }
    }

    if (den === 0) {
      return -1;
    }

    // apply error to data
    if (num1 !== 0) {
      if (locn[j] < FirstInfo) {
        return -1;
      } else {
        HB[locn[j]] = HB[locn[j]] ^ (rsGFexp[(rsGFlog[num1] + rsGFlog[num2] + 63 - rsGFlog[den]) % 63]);
      }
    }

    return count
  }
}

module.exports = function(n, k, uint6arr) {
  var uint6_63 = new Array(63).fill(0);
  var nroots = (n - k) / 6;
  var start = 63 - (n / 6);

  for (var i = 0; i < n / 6; i++) {
    uint6_63[start + i] = uint6arr[i];
  }

  var result = decode(nroots, start, uint6_63);

  for (var i = 0; i < n / 6; i++) {
    uint6arr[i] = uint6_63[start + i];
  }

  return result;
}
