# reed-solomon-uint6
Foundation for constructing Reed-Solomon decoders that operate on `6bit` words. Below is an example of how to use this module as a `RS(216,120,97)` decoder where:
  + block length `n = 216`
  + message length `k = 120`
  + distance `d = 97`

## example
```js
var reedsolomon = require('reed-solomon-uint6')

var n = 216
var k = 120
var uint6arr = new Array(n / 6).fill(0)

/* ... fill uint6arr with your stuff ... */

var result = reedsolomon(n, k, uint6arr)

if (result >= 0) {
  console.log('corrected', result, 'errors')
} else {
  console.log('data is unrecoverable')
}
```

## license
Under GPLv3 this module was lovingly derived from:
  + OP25 - rs.cc (Copyright 2013 KA1RBI)
