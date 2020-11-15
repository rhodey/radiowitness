const Parser      = require('binary-parser').Parser
const bitwise     = require('bitwise')
const hamming     = require('../hamming-10-6-3')
const reedsolomon = require('../reed-solomon-uint6')
const trellis     = require('../trellis-196-96')

function uint6buf(uint6arr) {
  var bits = []
  for (var i = 0; i < uint6arr.length; i++) {
    var bits8 = bitwise.byte.read(uint6arr[i])
    bits = bits.concat(bits8.splice(2))
  }
  return bitwise.buffer.create(bits)
}

const FRAME_HEADER = new Parser().endianess('big')
  .buffer('ecc', { length : 81 })
  .bit10('null')

const HEADER_CODE_WORD = new Parser().endianess('big')
  .buffer('mi', { length : 9 })
  .uint8('mfid')
  .uint8('algid')
  .uint16('kid')
  .uint16('groupId')

function decodeHeader(frame) {
  var uint6_36 = []
  var ecc = frame.ecc

  for (var i = 0; i < 18 * 36; i += 18) {
    var uint6 = bitwise.buffer.readUInt(ecc, i, 6)
    var parity12 = bitwise.buffer.readUInt(ecc, i + 6, 12)
    // todo: golay(18,6,8)
    uint6_36.push(uint6)
  }

  if (reedsolomon(216, 120, uint6_36) >= 0) {
    return Object.assign({}, frame, HEADER_CODE_WORD.parse(uint6buf(uint6_36.splice(0, 20))))
  } else {
    frame.err = true
    return frame
  }
}

const FRAME_TERMINATOR = new Parser().endianess('big')
  .bit28('null')

const FRAME_LLDU1 = new Parser().endianess('big')
  .buffer('vc1',  { length : 18 })
  .buffer('vc2',  { length : 18 })
  .buffer('ecc1', { length :  5 })
  .buffer('vc3',  { length : 18 })
  .buffer('ecc2', { length :  5 })
  .buffer('vc4',  { length : 18 })
  .buffer('ecc3', { length :  5 })
  .buffer('vc5',  { length : 18 })
  .buffer('ecc4', { length :  5 })
  .buffer('vc6',  { length : 18 })
  .buffer('ecc5', { length :  5 })
  .buffer('vc7',  { length : 18 })
  .buffer('ecc6', { length :  5 })
  .buffer('vc8',  { length : 18 })
  .buffer('lsd',  { length :  4 })
  .buffer('vc9',  { length : 18 })

const LINK_CONTROL_WORD_GROUP = new Parser().endianess('big')
  .bit7('reserved')
  .bit1('s')
  .uint16('groupId')
  .bit24('sourceId')

const LINK_CONTROL_WORD_DIRECT = new Parser().endianess('big')
  .uint8('destination8')
  .uint16('destination16')
  .bit24('sourceId')

const LINK_CONTROL_WORD_UNKNOWN = new Parser().endianess('big')
  .skip(6)

const LINK_CONTROL_WORD = new Parser().endianess('big')
  .bit1('p')
  .bit1('sf')
  .bit6('lco')
  .uint8('mfid')
  .uint8('sopts')
  .choice({
    tag: 'lco',
    choices: {
      0x00: LINK_CONTROL_WORD_GROUP,
      0x03: LINK_CONTROL_WORD_DIRECT
    },
    defaultChoice: LINK_CONTROL_WORD_UNKNOWN
  })

function parseLlduEcc(lldu) {
  var ecc = Buffer.alloc(0)
  for (var i = 1; i <= 6; i++) {
    var key = 'ecc' + i
    ecc = Buffer.concat([ecc, lldu[key]])
    delete lldu[key]
  }
  return ecc
}

function parseLlduSpeech(lldu) {
  var speech = []
  for (var i = 1; i <= 9; i++) {
    var key = 'vc' + i
    speech.push(lldu[key])
    delete lldu[key]
  }
  return speech
}

function parseLlduHex(ecc) {
  var uint6_24 = []
  for (var i = 0; i < 240; i += 10) {
    var codeword10 = bitwise.buffer.readUInt(ecc, i, 10)
    var uint6 = codeword10 >> 4
    var parity4 = codeword10 & 0x0F
    uint6_24.push(hamming(uint6, parity4))
  }
  return uint6_24
}

function decodeLldu1(frame) {
  frame.ecc = parseLlduEcc(frame)
  frame.speech = parseLlduSpeech(frame)
  var uint6_24 = parseLlduHex(frame.ecc)

  if (reedsolomon(144, 72, uint6_24) >= 0) {
    var lcw = LINK_CONTROL_WORD.parse(uint6buf(uint6_24.splice(0, 12)))
    if (lcw.lco === 0x03) {
      lcw.destinationId = (lcw.destination8 << 16) + lcw.destination16
      delete lcw.destination8; delete lcw.destination16 /* binary-parser bug */
    }
    return Object.assign({}, frame, lcw)
  } else {
    frame.err = true
    return frame
  }
}

const FRAME_LLDU2 = new Parser().endianess('big')
  .buffer('vc1',  { length : 18 })
  .buffer('vc2',  { length : 18 })
  .buffer('ecc1', { length :  5 })
  .buffer('vc3',  { length : 18 })
  .buffer('ecc2', { length :  5 })
  .buffer('vc4',  { length : 18 })
  .buffer('ecc3', { length :  5 })
  .buffer('vc5',  { length : 18 })
  .buffer('ecc4', { length :  5 })
  .buffer('vc6',  { length : 18 })
  .buffer('ecc5', { length :  5 })
  .buffer('vc7',  { length : 18 })
  .buffer('ecc6', { length :  5 })
  .buffer('vc8',  { length : 18 })
  .buffer('lsd',  { length :  4 })
  .buffer('vc9',  { length : 18 })

const ENCRYPTION_SINK_WORD = new Parser().endianess('big')
  .buffer('mi', { length : 9 })
  .uint8('algid')
  .uint16('kid')

function decodeLldu2(frame) {
  frame.ecc = parseLlduEcc(frame)
  frame.speech = parseLlduSpeech(frame)
  var uint6_24 = parseLlduHex(frame.ecc)

  if (reedsolomon(144, 96, uint6_24) >= 0) {
    return Object.assign({}, frame, ENCRYPTION_SINK_WORD.parse(uint6buf(uint6_24.splice(0, 16))))
  } else {
    frame.err = true
    return frame
  }
}

const FRAME_PACKET = new Parser().endianess('big')
  .buffer('unknown', { readUntil : 'eof' })

const FRAME_TERMINATOR_LCW = new Parser().endianess('big')
  .buffer('ecc', { length : 36 })
  .bit20('null')

function decodeTerminator(frame) {
  // todo
  return frame
}

const FRAME_TRUNKING = new Parser().endianess('big')
  .buffer('blocks', { length : 73 })
  .bit4('carryover')

const BLOCK_TRUNKING_GRP_V_CH_GRANT = new Parser().endianess('big')
  .uint8('serviceOpts')
  .bit4('channelId')
  .bit12('channelNumber')
  .uint16('groupId')
  .bit24('sourceId')

// todo: S102.aabc 4.2.2 Group Voice Channel Grant **Update**
const BLOCK_TRUNKING_GRP_V_CH_GRANT_UPDT_EXP = new Parser().endianess('big')
  .skip(2) // todo
  .bit4('txChannelId')
  .bit12('txChannelNumber')
  .bit4('rxChannelId')
  .bit12('rxChannelNumber')
  .uint16('groupId')

const BLOCK_TRUNKING_IDEN_UP = new Parser().endianess('big')
  .bit4('channelId')
  .bit9('bandwidth')
  .bit1('txSign')
  .bit8('txOffset')
  .bit10('channelSpacing')
  .uint32('baseFrequency')

const BLOCK_TRUNKING_IDEN_UP_VU = new Parser().endianess('big')
  .bit4('channelId')
  .bit4('bandwidth')
  .bit1('txSign')
  .bit13('txOffset')
  .bit10('channelSpacing')
  .uint32('baseFrequency')

const BLOCK_TRUNKING_UNKNOWN = new Parser().endianess('big').skip(8)

const BLOCK_TRUNKING = new Parser().endianess('big')
  .bit1('lb')
  .bit1('p')
  .bit6('opcode')
  .uint8('mfid')
  .choice({
    tag: 'opcode',
    choices: {
      0x00: BLOCK_TRUNKING_GRP_V_CH_GRANT,
      0x03: BLOCK_TRUNKING_GRP_V_CH_GRANT_UPDT_EXP,
      0x3D: BLOCK_TRUNKING_IDEN_UP,
      0x34: BLOCK_TRUNKING_IDEN_UP_VU
    },
    defaultChoice: BLOCK_TRUNKING_UNKNOWN
  })
  .uint16('crc') // forreal, after all that fec?!?

function txOffsetOf(block) {
  return block.txSign === 1 ? block.txOffset : (-1 * block.txOffset)
}

function toBlock(bits96) {
  var block = BLOCK_TRUNKING.parse(bits96)
  switch (block.opcode) {
    case 0x3D:
      block.bandwidth *= 125
      block.txOffset = txOffsetOf(block)
      block.channelSpacing *= 125
      block.baseFrequency *= 5
      break

    case 0x34:
      if (block.bandwidth === 0x04) {
        block.bandwidth = 6250
      } else if (block.bandwidth === 0x05) {
        block.bandwidth = 12500
      } else {
        block.bandwidth = -1
      }
      block.txOffset = txOffsetOf(block)
      block.channelSpacing *= 125
      block.baseFrequency *= 5
      break
  }
  return block
}

/* todo:
 *   when decode >= 0 things look great and make sense ...
 *     ... but decode < 0 more often than anticipated. why? */
function trellisDecode(bits196) {
  var bytes12 = new Array(12).fill(0)
  var ret = trellis(bits196, bytes12)
  return ret >= 0 ? Buffer.from(bytes12) : null
}

function decodeTrunking(frame) {
  var blocks = []
  var carryover = Buffer.from([(frame.carryover << 4) & 0xFF])
  var bytes = Buffer.concat([frame.blocks, carryover])

  for (var bit = 0; (bit + 196) <= (bytes.length * 8); bit += 196) {
    var bits196 = bitwise.buffer.read(bytes, bit, 196)
    var bits96 = trellisDecode(bits196)
    var block = bits96 ? toBlock(bits96) : null

    if (block && block.lb === 1) {
      blocks.push(block)
      break
    } else if (block) {
      blocks.push(block)
    } else {
      frame.err = true
      break
    }
  }

  frame.blocks = blocks
  delete frame.carryover
  return frame
}

const FRAME_UNKNOWN = new Parser().endianess('big')
  .buffer('unknown', { readUntil : 'eof' })

const FRAME = new Parser().endianess('big')
  .bit12('nac')
  .bit4('duid')
  .skip(6)
  .choice({
    tag: 'duid',
    choices: {
      0x00: FRAME_HEADER,
      0x03: FRAME_TERMINATOR,
      0x05: FRAME_LLDU1,
      0x07: FRAME_TRUNKING,
      0x0A: FRAME_LLDU2,
      0x0C: FRAME_PACKET,
      0x0F: FRAME_TERMINATOR_LCW
    },
    defaultChoice: FRAME_UNKNOWN
  })

module.exports = function (buf) {
  var frame = FRAME.parse(buf)
  frame.buf = buf
  switch (frame.duid) {
    case 0x00:
      return decodeHeader(frame)
    case 0x05:
      return decodeLldu1(frame)
    case 0x07:
      return decodeTrunking(frame)
    case 0x0A:
      return decodeLldu2(frame)
    case 0x0F:
      return decodeTerminator(frame)
    default:
      return frame
  }
}
