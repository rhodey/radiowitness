# pull-byte-to-dibits
Transform a stream of bytes into a stream of dibits.

## example
```js
var pull = require('pull-stream')
var once = require('pull-stream/sources/once')
var fmap = require('pull-flatmap')
var dibits = require('pull-byte-to-dibits')

function bytes() {
  return fmap((buf) => Array.from(buf))
}

pull(once(Buffer.from([0xAA, 0x55])), bytes(), dibits(), pull.drain((dibit) => {
  console.log(dibit) // 2 2 2 2 1 1 1 1
}))
```
