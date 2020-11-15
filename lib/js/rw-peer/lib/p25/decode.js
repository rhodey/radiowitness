const fs         = require('fs')
const net        = require('net')
const spawn      = require('child_process').spawn
const codec      = require('codecs')('json')
const Readable   = require('stream').Readable
const split      = require('split')
const pull       = require('pull-stream')
const toPull     = require('stream-to-pull-stream')
const fmap       = require('pull-flatmap')
const timeout    = require('pull-timeout2')
const Abortable  = require('pull-abortable')
const sync       = require('../../../pull-dibit-syncword')
const framing    = require('../../../p25-framing')
const frames     = require('../../../p25-frames')
const trunking   = require('./trunking.js')
const trafficing = require('./traffic.js')

const SYNC_LEN = 48
const SYNC_0   = 0x5575F5FF77FF
const SYNC_90  = 0x001050551155
const SYNC_180 = 0xAA8A0A008800
const SYNC__90 = 0xFFEFAFAAEEAA
const TUNE_OFFSET = 20000

function bytes() {
  return fmap(buf => Array.from(buf))
}

function dibits() {
  return pull.map(byt => byt & 0x03)
}

function minmax(channel) {
  return { min : channel.freq - (channel.rate / 2), max : channel.freq + (channel.rate / 2) }
}

function within(aaa, bbb) {
  return minmax(aaa).min >= minmax(bbb).min && minmax(aaa).max <= minmax(bbb).max
}

function wrap(child) {
  return new Promise(function (res, rej) {
    child.once('error', rej)
    if (child.pid) { res(child) }
  })
}

function len3(buf) {
  if (buf.length >= 1000) {
    throw new Error('call header too large')
  } else if (buf.length >= 100) {
    return Buffer.from("" + buf.length)
  } else if (buf.length >= 10) {
    return Buffer.from("0" + buf.length)
  } else {
    return Buffer.from("00" + buf.length)
  }
}

function radio(idx, opts) {
  const bin = 'rtl_p25'
  const args = ['-x', opts.mux, '-d', idx, '-s', opts.s, '-g', opts.g]
  const stdio = ['pipe', 'pipe', 'inherit']
  const child = spawn(bin, args, { stdio })

  return wrap(child).then(function (radio) {
    radio.idx = idx
    radio.state = { rate: opts.s, freq: 800000000, tuning: false, mux: new Array(opts.mux).fill(-1) }
    radio.split = radio.stdout.pipe(split())
    radio.stdout.setEncoding('utf8')
    return radio
  })
}

function mkfifo(path) {
  return new Promise(function (res, rej) {
    spawn('mkfifo', [path]).once('exit', function (code) {
      if (code === 0) {
        res(path)
      } else {
        rej(new Error(`mkfifo exited with code: ${code}`))
      }
    })
  })
}

function readfifo(path) {
  return new Promise(function (res, rej) {
    fs.open(path, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK, function (err, fd) {
      if (err) {
        rej(err)
      } else {
        res(new net.Socket({ fd }))
      }
    })
  })
}

function P25Decoder(radios, opts) {
  if (!(this instanceof P25Decoder)) return new P25Decoder(radios, opts)
  this.radios = radios
  this.opts = opts

  this.dedupe = []
  this.counter = 0
  this.waiting = new Map()

  radios.forEach(radio => radio.split.on('data', this.onRadioRead.bind(this)))
}

P25Decoder.prototype.onRadioRead = function (line) {
  const ack = line.split(',')
  const txn = parseInt(ack[ack.length - 1])
  const cb = this.waiting.get(txn)

  if (!cb) {
    throw new Error(`bad radio txn ${txn}`)
  } else if (ack[0] !== 'ok') {
    cb(new Error(`bad ack [${ack}] for radio txn ${txn}`))
  } else {
    cb(null, ack)
  }
}

P25Decoder.prototype.awaitOk = function (radio, cmd) {
  const self = this
  const txn = self.counter++
  const await = new Promise(function (res, rej) {
    const timer = setTimeout(() => rej(new Error(`radio txn ${txn} timed out`)), 5000)
    self.waiting.set(txn, function (err, ack) {
      clearTimeout(timer)
      self.waiting.delete(txn)
      console.error(`cmd: ${cmd}, ack: [${ack}]`)
      if (err) {
        rej(err)
      } else if (cmd.startsWith('tune') && !isNaN(ack[1])) {
        res(parseInt(ack[1]))
      } else if (cmd.startsWith('demod')) {
        res()
      } else {
        rej(new Error(`bad ack [${ack}] for radio command ${cmd}`))
      }
    })
  })

  try {

    if (radio.stdin.write(cmd.concat(`,${txn}\n`))) {
      return await
    } else {
      throw new Error(`radio ${radio.idx} stdin write failed.`)
    }

  } catch (err) {
    return Promise.reject(err)
  }
}

P25Decoder.prototype.tune = function (radio, channel) {
  const request = channel.freq + TUNE_OFFSET
  return this.awaitOk(radio, `tune,${request}`).then(function (result) {
    radio.state.freq = result
    if (!within(channel, radio.state)) {
      throw new Error(`radio tune ${request}Hz failed, got ${result}Hz`)
    } else {
      return result
    }
  })
}

P25Decoder.prototype.demod = function (radio, channel) {
  const self = this
  const mux = radio.state.mux.findIndex((f) => f < 0)
  const offset = channel.freq - radio.state.freq
  const path = `/tmp/rw-demod-${channel.freq}.u8`

  return mkfifo(path)
    .then(readfifo)
    .then(function (fifo) {
      return self.awaitOk(radio, `demod,${mux},${offset},${path}`).then(() => fifo)
    }).then(function (fifo) {
      radio.state.mux[mux] = radio.state.freq + offset
      return { idx: radio.idx, mux, path, fifo }
    })
}

P25Decoder.prototype.tuneAndDemod = function (channel) {
  const self = this
  let tuned = self.radios.filter(function (radio) {
    return !radio.state.tuning &&
      within(channel, radio.state) &&
      radio.state.mux.some((f) => f < 0)
  })

  let tuneables = self.radios.filter(function (radio) {
    return !radio.state.tuning &&
      radio.state.mux.every((f) => f < 0)
  })

  if (tuned.length > 0) {
    tuned[0].state.tuning = true
    return self.demod(tuned[0], channel).then(function (ok) {
      tuned[0].state.tuning = false
      return ok
    })
  } else if (tuneables.length > 0) {
    tuneables[0].state.tuning = true
    return self.tune(tuneables[0], channel)
      .then((freq) => self.demod(tuneables[0], channel))
      .then(function (ok) {
        tuneables[0].state.tuning = false
        return ok
      })
  } else {
    return Promise.resolve(null)
  }
}

P25Decoder.prototype.reset = function (radio, mux, path) {
  return this.awaitOk(radio, `demod,${mux},777,null`).then(() => new Promise(function (res, rej) {
    radio.state.mux[mux] = -1
    fs.unlink(path, function (err) {
      if (!err || err.errno === -2) { res() } 
      else { rej(err) }
    })
  }))
}

P25Decoder.prototype.search = function (controlhz, cb) {
  const self = this
  const abort = Abortable()
  const work = self.tuneAndDemod({ rate: 48000, freq: controlhz }).then(ok => new Promise(function (res, rej) {
    if (!ok) { return rej(new Error(`failed to tune control channel ${controlhz}Hz`)) }

    pull(
      toPull.source(ok.fifo),
      abort,
      bytes(),
      dibits(),
      sync(Array.of(SYNC_0, SYNC_90, SYNC_180, SYNC__90), SYNC_LEN, 0),
      framing(),
      trunking(),
      pull.filter(frame => !frame.err && frame.duid === 0x07),
      pull.drain(cb, function (err) {
        self.reset(self.radios[ok.idx], ok.mux, ok.path).then(function () {
          if (err) { rej(err) }
          else { res() }
        }).catch(rej)
      })
    )
  }))

  return [work, abort.abort]
}

P25Decoder.prototype.decode = function (traffichz, block) {
  const self = this
  const duplicate = (radio) => { return radio.state.mux.some((f) => f === traffichz) }
  if (self.dedupe.indexOf(traffichz) >= 0 || self.radios.some(duplicate)) {
    return Promise.resolve()
  } else {
    self.dedupe.push(traffichz)
  }

  return self.tuneAndDemod({ rate: 48000, freq: traffichz }).then(ok => new Promise(function (res, rej) {
    self.dedupe.splice(self.dedupe.indexOf(traffichz), 1)
    if (!ok) { console.error(`failed to tune traffic channel ${traffichz}Hz`); return res() }
    const traffic = trafficing(block.sourceId, block.groupId)
    console.error(`decoding traffic channel ${traffichz}Hz`)

    pull(
      toPull.source(ok.fifo),
      bytes(),
      dibits(),
      sync(Array.of(SYNC_0, SYNC_90, SYNC_180, SYNC__90), SYNC_LEN, 0),
      framing(),
      traffic,
      timeout(2250),
      pull.filter(frame => !frame.err),
      pull.drain(function (frame) {
        delete frame.buf
        const meta = traffic.query()
        frame.frequency = traffichz
        frame.sourceId = meta.source
        frame.groupId = meta.group
        process.stdout.write(Buffer.concat([codec.encode(frame), Buffer.from("\n")]))
      }, function (err) {
        self.reset(self.radios[ok.idx], ok.mux, ok.path).then(function () {
          if (err) { rej(err) }
          else { res() }
        }).catch(rej)
      })
    )
  }))
}

P25Decoder.prototype.follow = function (controlhz) {
  const self = this
  return self.tuneAndDemod({ rate: 48000, freq: controlhz }).then(ok => new Promise(function (res, rej) {
    if (!ok) { return rej(new Error(`failed to tune control channel ${controlhz}Hz`)) }
    const trunk = trunking()

    pull(
      toPull.source(ok.fifo),
      bytes(),
      dibits(),
      sync(Array.of(SYNC_0, SYNC_90, SYNC_180, SYNC__90), SYNC_LEN, 0),
      framing(),
      trunk,
      timeout(6250),
      pull.drain(function (frame) {
        if (!frame.err && frame.duid === 0x07) {
          frame.blocks.filter((block) => block.opcode === 0x00 || block.opcode === 0x03).forEach(function (block) {
            const traffichz = trunk.query(block)
            if (traffichz > 0) {
              self.decode(traffichz, block)
                .catch(rej)
            }
          })
        }
      }, function (err) {
        self.reset(self.radios[ok.idx], ok.mux, ok.path).then(function () {
          if (err) { rej(err) }
          else { res() }
        }).catch(rej)
      })
    )
  }))
}

P25Decoder.prototype.close = function (err) {
  this.radios.forEach(radio => radio.kill('SIGINT'))
  if (err) { return Promise.reject(err) }
  else { return Promise.resolve() }
}

module.exports = function (opts) {
  if (opts.radios === 1) {
    return radio(opts.d, opts)
      .then((radio) => new P25Decoder([radio], opts))
  } else {
    let radios = []
    for (let idx = 0; idx < opts.radios; idx++) {
      radios[idx] = radio(idx, opts)
    }
    return Promise.all(radios)
      .then((radios) => new P25Decoder(radios, opts))
  }
}
