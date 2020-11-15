# bch-63-16-23
BCH(63,16,23) decoder.

## example
```js
var bitwise = require('bitwise')
var decode = require('bch-63-16-23')

function strToBuf(bitstr) {
  return bitwise.buffer.create(bitwise.string.toBits(bitstr))
}

function bufToStr(buf) {
  return bitwise.bits.toString(bitwise.buffer.read(buf, 0, 63))
}

var sent      = strToBuf('001001100000001101001010000000011000011111001110101000101011000')
var received  = strToBuf('110110011000001101001010000000011000011111001110101000101011011')
var recovered = decode(received)

console.log('SENT      ->', bufToStr(sent))
console.log('RECEIVED  ->', bufToStr(received))
console.log('RECOVERED ->', bufToStr(recovered))
console.log('SUCCESSS  ->', (recovered != null && recovered.compare(sent) == 0)) // true
```
