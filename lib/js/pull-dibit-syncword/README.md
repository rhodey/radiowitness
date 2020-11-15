# pull-dibit-syncword
Insert a sync event into a stream of dibits every time a [syncword](https://en.wikipedia.org/wiki/Syncword) is read completely. Uses [big-integer](https://www.npmjs.com/package/big-integer) under-the-hood for bitwise operations.

## example
```js
var pull = require('pull-stream')
var once = require('pull-stream/sources/once')
var fmap = require('pull-flatmap')
var dibits = require('pull-byte-to-dibits')
var sync = require('pull-dibit-syncword')

function bytes() {
  return fmap((buf) => Array.from(buf))
}

var syncword = 0b110011
var len = 6

pull(
  once(Buffer.from([0b10110011, 0b00010001])),
  bytes(), dibits(),
  sync(syncword, len),
  pull.drain((dibit) => {
    console.log(dibit) // 2 3 0 3 { sync: 51 } 0 1 0 1
}))
