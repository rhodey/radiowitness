const through = require('pull-through')
const frames  = require('../../../p25-frames')

function Oracle() {
  if (!(this instanceof Oracle)) return new Oracle()
  this.source = 0
  this.group = 0
}

function isUpdate(past, present) {
  const wasKnown = past !== 0
  const isKnown  = typeof present !== 'undefined' && present !== 0
  const changed  = past !== present

  return (!wasKnown && isKnown) || (wasKnown && isKnown && changed)
}

Oracle.prototype.update = function (src, grp) {
  if (isUpdate(this.source, src)) { this.source = src }
  if (isUpdate(this.group, grp)) { this.group = grp }
}

Oracle.prototype.query = function () {
  return {
    source: this.source,
    group: this.group
  }
}

module.exports = function (source, group) {
  const oracle = new Oracle()
  const traffic = through(function (buf) {
    let frame = frames(buf)
    frame.ms = Date.now()
    if (!frame.err && frame.duid === 0x00) {
      oracle.update(0, frame.groupId)
    } else if (!frame.err && frame.duid === 0x05 && frame.lco === 0x00) {
      oracle.update(frame.sourceId, frame.groupId)
    }
    this.queue(frame)
  })

  oracle.update(source, group)
  traffic.query = oracle.query.bind(oracle)
  return traffic
}
