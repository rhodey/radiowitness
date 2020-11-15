var fmap = require('pull-flatmap');

function dibits() {
  return fmap(function (byt) {
    var dbits = new Array(4);
    dbits[0] = (byt >> 6) & 0x03;
    dbits[1] = (byt >> 4) & 0x03;
    dbits[2] = (byt >> 2) & 0x03;
    dbits[3] = byt & 0x03;
    return dbits;
  })
}

module.exports = dibits;
