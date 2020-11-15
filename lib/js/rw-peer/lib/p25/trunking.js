const through = require('pull-through')
const frames  = require('../../../p25-frames')

function Oracle() {
  if (!(this instanceof Oracle)) return new Oracle()
  this.blocks = new Map()
}

Oracle.prototype.update = function (block) {
  if (block.opcode === 0x3D || block.opcode === 0x34) {
    this.blocks.set(block.channelId, block)
  }
  return block
}

Oracle.prototype.query = function (grant) {
  const implicit = typeof grant.channelId !== 'undefined'
  const channelNum = implicit ? grant.channelNumber : grant.txChannelNumber
  const iden = this.blocks.get(implicit ? grant.channelId : grant.txChannelId)

  if (!iden) {
    return -1
  } else {
    return iden.baseFrequency + (channelNum * iden.channelSpacing)
  }
}

module.exports = function () {
  const oracle = new Oracle()
  const trunking = through(function (buf) {
    let frame = frames(buf)
    frame.ms = Date.now()
    if (frame.duid === 0x07) {
      frame.blocks.forEach(block => oracle.update(block))
    }
    this.queue(frame)
  })

  trunking.query = oracle.query.bind(oracle)
  return trunking
}
