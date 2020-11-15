const bitwise   = require('bitwise')
const through   = require('pull-through')
const bch631623 = require('../bch-63-16-23')

function duidOf(frame) {
  return bitwise.buffer.readUInt(frame, 12, 4)
}

function lengthOf(nid) {
  switch (duidOf(nid)) {
    case 0x00: return  658 // header
    case 0x03: return   28 // terminator w/o word
    case 0x05: return 1568 // lldu1
    case 0x07: return  588 // trunking
    case 0x0A: return 1568 // lldu2
    case 0x0C: return   -1 // packet / trunking multi-block
    case 0x0F: return  308 // terminator w/ word
      default: return   -1 // idk
  }
}

module.exports = function() {
  const fnstatus = () => {
    var bits = 48
    return (dbit) => {
      if (bits < 70) {
        bits += 2
        return dbit
      } else if (bits === 70) {
        bits = 0
      }
    }
  }

  const fnnid = () => {
    var bits = 0
    const buf = Buffer.alloc(8)
    return (dbit) => {
      var idx = Math.floor(bits / 8)
      buf[idx] = ((buf[idx] << 2) & 0xFF) + dbit
      bits += 2

      if (bits === 64) {
        return buf
      }
    }
  }

  const fnframe = (nid, len) => {
    var bits = 0
    const buf = Buffer.alloc(Math.ceil(len / 8))
    const padding = (len % 8) === 0 ? 0 : (8 - (len % 8))
    return (dbit) => {
      var idx = Math.floor(bits / 8)
      buf[idx] = ((buf[idx] << 2) & 0xFF) + dbit
      bits += 2

      if (bits === len) {
        for (var bit = 0; bit < padding; bit++) {
          buf[buf.length - 1] = (buf[buf.length - 1] << 1) & 0xFF
        }
        return Buffer.concat([nid, buf])
      }
    }
  }

  const push = (dbit, pipe) => {
    dbit = pipe[0](dbit)
    return isNaN(dbit) ? null : pipe[1](dbit)
  }

  var pipes = []
  var framing = null

  const fnframing = through(function (dbit) {
    if (!framing && dbit.sync) {
      pipes.push([fnstatus(), fnnid()])
    } else if (!framing) {
      var active = []
      var pipe = pipes.shift()
      while (pipe) {
        var nid = push(dbit, pipe)
        var dnid = nid ? bch631623(nid) : null
        var flen = dnid ? lengthOf(dnid) : -1
        if (!nid) {
          active.push(pipe)
        } else if (flen > 0) {
          framing = [pipe[0], fnframe(dnid, flen)]
          active = []
          break
        }
        pipe = pipes.shift()
      }
      pipes = active
    } else if (framing && !dbit.sync) {
      var frame = push(dbit, framing)
      if (frame) {
        framing = null
        this.queue(frame)
      }
    }
  })

  fnframing.duidOf = duidOf
  fnframing.lengthOf = lengthOf
  return fnframing
}
