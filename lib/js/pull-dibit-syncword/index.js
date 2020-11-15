var bigint = require('big-integer');
var through = require('pull-through');


function hammdist(a, b) {
  var bits = a.xor(b).toJSNumber().toString(2).match(/1/g);
  return bits ? bits.length : 0;
}

function dibitsync(syncs, len, hdist) {
  hdist = typeof hdist !== 'undefined' ? hdist : 0;
  syncs = Array.isArray(syncs) ? syncs : Array.of(syncs);
  syncs = syncs.map((sync) => bigint(sync));
  var bits = bigint(0);
  var mask = bigint(2).pow(len).subtract(1);

  return through(function (dbit) {
    this.queue(dbit);
    bits = bits.shiftLeft(2).and(mask).add(dbit);
    syncs.forEach((sync) => {
      if (bits.compare(sync) === 0 || hammdist(bits, sync) <= hdist) {
        this.queue({ sync : bits.toJSNumber() });
        bits = bigint(0);
      }
    });
  });
}


module.exports = dibitsync;
