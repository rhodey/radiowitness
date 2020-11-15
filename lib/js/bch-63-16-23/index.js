var bitwise = require('bitwise');
var bm63 = require('../berlekamp-massey-63');
var bch631623 = bm63(23);


function decode(buf) {
  var input  = bitwise.buffer.read(buf, 0, 63).reverse();
  var output = new Array(63).fill(0);

  if (!bch631623(input, output)) {
    return null;
  } else {
    return bitwise.buffer.create(output.reverse());
  }
}


module.exports = decode;
