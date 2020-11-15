# berlekamp-massey-63
[Berlekemp Massey decoder](https://en.wikipedia.org/wiki/Berlekamp%E2%80%93Massey_algorithm) for 63-bit primitive RS/BCH block codes. I have a single, very specific need for this module where I need to decode a BCH(63,16,23) codeword. If you're looking for a generic FEC library or you want to decode as well as *encode* then you should search elsewhere. If your search fails and you end up back here like me, I recommend starting with the Wikipedia page on [Block Codes](https://en.wikipedia.org/wiki/Block_code) so you can choose the correct `distance` parameter.

## example
```js
var bm63 = require('berlekamp-massey-63')
var distance = 23
var bch631623 = bm63(distance)

function decode(bitstr) {
  var chars  = bitstr.split('')
  var input  = chars.reverse().map((i) => parseInt(i))
  var output = new Array(63).fill(0)

  if (!bch631623(input, output)) {
    return null
  } else {
    return output.reverse().reduce((acc, bit) => {
      return acc + bit
    }, "")
  }
}

var sent      = '001001100000001101001010000000011000011111001110101000101011000'
var received  = '110110011000001101001010000000011000011111001110101000101011011'
var recovered = decode(received)

console.log('SENT      ->', sent)
console.log('RECEIVED  ->', received)
console.log('RECOVERED ->', recovered)
console.log('SUCCESSS  ->', (recovered != null && recovered == sent))
```

## license
Under GPLv3 this module was lovingly derived from:
  + SDRTrunk - BerlekempMassey_63.java (Copyright GPLv3 2014 Dennis Sheirer)
  + DSD      - ReedSolomon.hpp (Copyright 2014 Ed Fuentetaja)
  + Simon    - http://www.eccpage.com/rs.c (Copyright 1991 Simon Rockliff)
