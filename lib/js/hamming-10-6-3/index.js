var hmg1063DecTbl = [0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 8, 1, 16, 32, 0];
var hmg1063EncTbl = [
  0, 12, 3, 15, 7, 11, 4, 8, 11, 7, 8, 4, 12, 0, 15, 3,
  13, 1, 14, 2, 10, 6, 9, 5, 6, 10, 5, 9, 1, 13, 2, 14,
  14, 2, 13, 1, 9, 5, 10, 6, 5, 9, 6, 10, 2, 14, 1, 13,
  3, 15, 0, 12, 4, 8, 7, 11, 8, 4, 11, 7, 15, 3, 12, 0
];

function decode(uint6, parity4) {
  return uint6 ^ hmg1063DecTbl[hmg1063EncTbl[uint6] ^ parity4];
}

module.exports = decode;
