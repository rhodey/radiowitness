var bigint = require('big-integer');


var deinterleave_tb = [
  0,  1,  2,  3,  52, 53, 54, 55, 100,101,102,103, 148,149,150,151,
  4,  5,  6,  7,  56, 57, 58, 59, 104,105,106,107, 152,153,154,155,
  8,  9, 10, 11,  60, 61, 62, 63, 108,109,110,111, 156,157,158,159,
  12, 13, 14, 15,  64, 65, 66, 67, 112,113,114,115, 160,161,162,163,
  16, 17, 18, 19,  68, 69, 70, 71, 116,117,118,119, 164,165,166,167,
  20, 21, 22, 23,  72, 73, 74, 75, 120,121,122,123, 168,169,170,171,
  24, 25, 26, 27,  76, 77, 78, 79, 124,125,126,127, 172,173,174,175,
  28, 29, 30, 31,  80, 81, 82, 83, 128,129,130,131, 176,177,178,179,
  32, 33, 34, 35,  84, 85, 86, 87, 132,133,134,135, 180,181,182,183,
  36, 37, 38, 39,  88, 89, 90, 91, 136,137,138,139, 184,185,186,187,
  40, 41, 42, 43,  92, 93, 94, 95, 140,141,142,143, 188,189,190,191,
  44, 45, 46, 47,  96, 97, 98, 99, 144,145,146,147, 192,193,194,195,
  48, 49, 50, 51
];

var next_words = [
  [0x02, 0x0C, 0x01, 0x0F],
  [0x0E, 0x00, 0x0D, 0x03],
  [0x09, 0x07, 0x0A, 0x04],
  [0x05, 0x0B, 0x06, 0x08]
];

function hammdist(a, b) {
  var bits = a.xor(b).toJSNumber().toString(2).match(/1/g);
  return bits ? bits.length : 0;
}

function find_min(list, len) {
  var min    = list[0];
  var index  = 0;
  var unique = 1;

  for (var i = 1; i < len; i++) {
    if (list[i] < min) {
      min    = list[i];
      index  = i;
      unique = 1;
    } else if (list[i] == min) {
      unique = 0;
    }
  }

  return (unique == 1) ? index : -1;
}

function crc16(buf, len) {
  var poly = (1<<12) + (1<<5) + 1;
  var crc  = bigint(0);

  for(var i = 0; i < len; i++) {
    var bits = buf[i];

    for (var j = 0; j < 8; j++) {
      var bit = (bits >> (7-j)) & 1;
          crc = crc.shiftLeft(1).or(bit).and(0x1ffff);

      if (!crc.and(0x10000).eq(0x00)) {
        crc = crc.and(0xffff).xor(poly);
      }
    }
  }

  return crc.xor(0xffff).and(0xffff).toJSNumber();
}

function crc32(buf, len) {
  var g = 0x04c11db7;
  var crc = bigint(0);

  for (var i = 0; i < len; i++) {
    crc = crc.shiftLeft(1);
    var b = (buf[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
    if (!crc.shiftRight(32).xor(b).and(0x01).eq(0x00)) {
      crc = crc.xor(g);
    }
  }

  return crc.and(0xffffffff).xor(0xffffffff).toJSNumber();
}

function magic(bits196, bytes12) {
  var hd = new Array(4).fill(0);
  var b = d = j = 0;
  var state = codeword = 0;

  for (b = 0; b < (98 * 2); b += 4) {
    codeword = (bits196[deinterleave_tb[b]]     << 3) +
               (bits196[deinterleave_tb[b + 1]] << 2) +
               (bits196[deinterleave_tb[b + 2]] << 1) +
                bits196[deinterleave_tb[b + 3]];

    for (j = 0; j < 4; j++) {
      hd[j] = hammdist(bigint(codeword), bigint(next_words[state][j]));
    }

    state = find_min(hd, 4);
    if (state == -1) { return -1; } // trellis error

    d = b >> 2;
    if (d < 48) {
      bytes12[d >> 2] |= state << (6 - ((d % 4) * 2));
    }
  }

  if (crc16(bytes12, 12) == 0) { return 16; } // success w/ 16

  var crc1 = crc32(bytes12, 8 * 8);
  var crc2 = bigint(bytes12[8]).shiftLeft(24)
               .add(bigint(bytes12[9]).shiftLeft(16))
                 .add(bigint(bytes12[10]).shiftLeft(8))
                   .add(bytes12[11]).toJSNumber();

  if (crc1 == crc2) {
    return 32; // success w/ 32
  } else {
    return -2; // crc error
  }
}


module.exports = magic;
