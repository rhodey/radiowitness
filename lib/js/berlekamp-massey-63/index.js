/*
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Lovingly derived from:
 *   SDRTrunk - BerlekempMassey_63.java (Copyright GPLv3 2014 Dennis Sheirer)
 *   DSD      - ReedSolomon.hpp (Copyright 2014 Ed Fuentetaja)
 *   Simon    - http://www.eccpage.com/rs.c (Copyright 1991 Simon Rockliff)
 */


function berlekampMassey63(distance) {
  // golay field
  var alpha_to = [1, 2, 4, 8, 16, 32, 3, 6, 12, 24, 48, 35, 5, 10, 20, 40, 19, 38, 15, 30, 60, 59, 53, 41, 17, 34, 7, 14, 28, 56, 51, 37, 9, 18, 36, 11, 22, 44, 27, 54, 47, 29, 58, 55, 45, 25, 50, 39, 13, 26, 52, 43, 21, 42, 23, 46, 31, 62, 63, 61, 57, 49, 33, 0];
  var index_of = [-1, 0, 1, 6, 2, 12, 7, 26, 3, 32, 13, 35, 8, 48, 27, 18, 4, 24, 33, 16, 14, 52, 36, 54, 9, 45, 49, 38, 28, 41, 19, 56, 5, 62, 25, 11, 34, 31, 17, 47, 15, 23, 53, 51, 37, 44, 55, 40, 10, 61, 46, 30, 50, 22, 39, 43, 29, 60, 42, 21, 20, 59, 57, 58];

  // block length
  var NN = 63;

  // hamming distance
  var DD = distance;

  // max correctable errors
  var TT = (distance - 1) / 2;

  return function(input, output) {
    var elp  = new Array(DD + 1);
    var d    = new Array(DD + 1).fill(0);
    var l    = new Array(DD + 1).fill(0);
    var u_lu = new Array(DD + 1).fill(0);
    var s    = new Array(DD).fill(0);

    for (var i = 0; i < (DD + 1); i++) { elp[i] = new Array(DD - 1).fill(0); }

    var root = new Array(TT).fill(0);
    var loc  = new Array(TT).fill(0);
    var z    = new Array(TT + 1).fill(0);
    var err  = new Array(NN).fill(0);
    var reg  = new Array(TT + 1).fill(0);

    var u, q;
    var count = 0;
    var syn_error = false;
    var irrecoverable_error = false;


    /* put recd[i] into index form (ie as powers of alpha) */
    for (var i = 0; i < NN; i++) {
      output[i] = index_of[input[i]];
    }

    /* first form the syndromes */
    for (var i = 1; i <= (DD - 1); i++) {
      s[i] = 0;

      for (var j = 0; j < NN; j++) {
        if (output[j] != -1) {
          /* recd[j] in index form */
          s[i] ^= alpha_to[(output[j] + i * j) % NN];
        }
      }

      /* convert syndrome from polynomial form to index form  */
      if (s[i] != 0) {
        /* set flag if non-zero syndrome => error */
        syn_error = true;
      }

      s[i] = index_of[s[i]];
    }

    /* if errors, try and correct...
       compute the error location polynomial via the Berlekamp iterative algorithm,
       following the terminology of Lin and Costello :   d[u] is the 'mu'th
       discrepancy, where u='mu'+1 and 'mu' (the Greek letter!) is the step number
       ranging from -1 to 2*tt (see L&C),  l[u] is the
       degree of the elp at that step, and u_l[u] is the difference between the
       step number and the degree of the elp.
   */
    if (syn_error) {
      /* initialise table entries */
      d[0] = 0; /* index form */
      d[1] = s[1]; /* index form */
      elp[0][0] = 0; /* index form */
      elp[1][0] = 1; /* polynomial form */

      for (var i = 1; i < (DD - 1); i++) {
        elp[0][i] = -1; /* index form */
        elp[1][i] = 0; /* polynomial form */
      }

      l[0] = 0;
      l[1] = 0;
      u_lu[0] = -1;
      u_lu[1] = 0;
      u = 0;

      do {
        u++;

        if (d[u] == -1) {
          l[u + 1] = l[u];

          for (var i = 0; i <= l[u]; i++) {
            elp[u + 1][i] = elp[u][i];
            elp[u][i] = index_of[elp[u][i]];
          }
        } else {
          /* search for words with greatest u_lu[q] for which d[q]!=0 */
          q = u - 1;

          while ((d[q] == -1) && (q > 0)) {
            q--;
          }

          /* have found first non-zero d[q]  */
          if (q > 0) {
            var j = q;

            do {
              j--;

              if ((d[j] != -1) && (u_lu[q] < u_lu[j])) {
                q = j;
              }
            }
            while (j > 0);
          }

          /* have now found q such that d[u]!=0 and u_lu[q] is maximum */
          /* store degree of new elp polynomial */
          if (l[u] > l[q] + u - q) {
            l[u + 1] = l[u];
          } else {
            l[u + 1] = l[q] + u - q;
          }

          /* form new elp(x) */
          for (var i = 0; i < (DD - 1); i++) {
            elp[u + 1][i] = 0;
          }

          for (var i = 0; i <= l[q]; i++) {
            if (elp[q][i] != -1) {
              elp[u + 1][i + u - q] = alpha_to[(d[u] + NN - d[q] + elp[q][i]) % NN];
            }
          }
          for (var i = 0; i <= l[u]; i++) {
            elp[u + 1][i] ^= elp[u][i];
            elp[u][i] = index_of[elp[u][i]]; /*convert old elp value to index*/
          }
        }

        u_lu[u + 1] = u - l[u + 1];

        /* form (u+1)th discrepancy */
        if (u < (DD - 1)) {
          /* no discrepancy computed on last iteration */
          if (s[u + 1] != -1) {
            d[u + 1] = alpha_to[s[u + 1]];
          } else {
            d[u + 1] = 0;
          }
          for (var i = 1; i <= l[u + 1]; i++) {
            if ((s[u + 1 - i] != -1) && (elp[u + 1][i] != 0)) {
              d[u + 1] ^= alpha_to[(s[u + 1 - i] + index_of[elp[u + 1][i]]) % NN];
            }
          }

          d[u + 1] = index_of[d[u + 1]]; /* put d[u+1] into index form */
        }
      }
      while ((u < (DD - 1)) && (l[u + 1] <= TT));

      u++;

      if (l[u] <= TT) {
        /* can correct error */
        /* put elp into index form */
        for (var i = 0; i <= l[u]; i++) {
          elp[u][i] = index_of[elp[u][i]];
        }

        /* find roots of the error location polynomial */
        for (var i = 1; i <= l[u]; i++) {
          reg[i] = elp[u][i];
        }

        count = 0;
        for (var i = 1; i <= NN; i++) {
          q = 1;

          for (var j = 1; j <= l[u]; j++) {
            if (reg[j] != -1) {
              reg[j] = (reg[j] + j) % NN;
              q ^= alpha_to[reg[j]];
            }
          }

          if (q == 0) {
            /* store root and error location number indices */
            root[count] = i;
            loc[count] = NN - i;
            count++;
          }
        }

        /* no. roots = degree of elp hence <= tt errors */
        if (count == l[u]) {
          /* form polynomial z(x) */
          for (var i = 1; i <= l[u]; i++) {
            /* Z[0] = 1 always - do not need */
            if ((s[i] != -1) && (elp[u][i] != -1)) {
              z[i] = alpha_to[s[i]] ^ alpha_to[elp[u][i]];
            } else if ((s[i] != -1) && (elp[u][i] == -1)) {
              z[i] = alpha_to[s[i]];
            } else if ((s[i] == -1) && (elp[u][i] != -1)) {
              z[i] = alpha_to[elp[u][i]];
            } else {
              z[i] = 0;
            }

            for (var j = 1; j < i; j++) {
              if ((s[j] != -1) && (elp[u][i - j] != -1)) {
                z[i] ^= alpha_to[(elp[u][i - j] + s[j]) % NN];
              }
            }

            z[i] = index_of[z[i]]; /* put into index form */
          }

          /* evaluate errors at locations given by error location numbers loc[i] */
          for (var i = 0; i < NN; i++) {
            err[i] = 0;

            if (output[i] != -1) {
              /* convert recd[] to polynomial form */
              output[i] = alpha_to[output[i]];
            } else {
              output[i] = 0;
            }
          }

          /* compute numerator of error term first */
          for (var i = 0; i < l[u]; i++) {
            err[loc[i]] = 1; /* accounts for z[0] */

            for (var j = 1; j <= l[u]; j++) {
              if (z[j] != -1) {
                err[loc[i]] ^= alpha_to[(z[j] + j * root[i]) % NN];
              }
            }

            if (err[loc[i]] != 0) {
              err[loc[i]] = index_of[err[loc[i]]];

              q = 0; /* form denominator of error term */

              for (var j = 0; j < l[u]; j++) {
                if (j != i) {
                  q += index_of[1 ^ alpha_to[(loc[j] + root[i]) % NN]];
                }
              }

              q = q % NN;
              err[loc[i]] = alpha_to[(err[loc[i]] - q + NN) % NN];
              output[loc[i]] ^= err[loc[i]]; /*recd[i] must be in polynomial form */
            }
          }
        } else {
          /* no. roots != degree of elp => >tt errors and cannot solve */
          irrecoverable_error = true;
        }
      } else {
        /* elp has degree >tt hence cannot solve */
        irrecoverable_error = true;
      }
    } else {
      /* no non-zero syndromes => no errors: output received codeword */
      for (var i = 0; i < NN; i++) {
        if (output[i] != -1) {
          /* convert recd[] to polynomial form */
          output[i] = alpha_to[output[i]];
        } else {
          output[i] = 0;
        }
      }
    }

    if (irrecoverable_error) {
      /* could return error flag if desired */
      for (var i = 0; i < NN; i++) {
        if (output[i] != -1) {
          /* convert recd[] to polynomial form */
          output[i] = alpha_to[output[i]];
        } else {
          output[i] = 0; /* just output received codeword as is */
        }
      }
    }

    return !irrecoverable_error;
  }
}


module.exports = function(distance) {
  return berlekampMassey63(distance);
}
