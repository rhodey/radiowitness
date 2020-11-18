const codec     = require('codecs')('json')
const hypercore = require('hypercore')
const hyperdb   = require('hyperdb')
const ram       = require('random-access-memory')
const websocket = require('websocket-stream')
const howler    = require('howler')
const conf      = require('../config.json')

function get(archive, idx) {
  return new Promise(function (res, rej) {
    archive.get(idx, function (err, data) {
      if (err) {
        rej(err)
      } else if (archive.authorize !== undefined) {
        res(codec.decode(data[0].value))
      } else {
        res(data)
      }
    })
  })
}

function ws(archive, path) {
  return new Promise(function (res, rej) {
    const ws = websocket(`${conf.host}/ws/${path}`)
    ws.on('error', rej)
    ws.once('connect', function () {
      const repl = path === 'db' ? archive.replicate({ live: true }) : archive.replicate(true, { live: true })
      console.log('!!! ws.conn')
      repl.pipe(ws).pipe(repl)
      repl.on('error', function (err) {
        console.error('!!! repl.err', err)
      })
      res()
    })
  })
}

function dataUri(buf) {
  const b64 = btoa(buf.reduce((data, byte) => data + String.fromCharCode(byte), ''))
  return `data:audio/wav;base64,${b64}`
}

const howlLoadError = (id, err) => { console.log('QQQ on load error ->', id, err) }
const howlPlayError = (id, err) => { console.log('QQQ on play error ->', id, err) }

function howlFor(buf, autoplay) {
  return new howler.Howl({
    src         : [dataUri(buf)],
    format      : ["wav"],
    html5       : true,
    onloaderror : howlLoadError,
    onplayerror : howlPlayError,
    autoplay
  })
}

function store(state, emitter) {
  emitter.on('DOMContentLoaded', function () {
    const db = hyperdb(() => ram(), conf.db, { sparse: true })
    const audio = hypercore(() => ram(), conf.audio, { sparse: true })

    db.once('error', console.error)
    audio.once('error', console.error)
    audio.once('ready', function () {
      db.once('ready', function () {
        emitter.emit('dat:open', [db, audio])
      })
    })
  })

  emitter.on('dat:open', function (dats) {
    state.db = dats[0]
    state.audio = dats[1]
    return Promise.all([ws(state.db, 'db'), ws(state.audio, 'audio')])
      .then(() => get(state.audio, 0))
      .then(() => get(state.db, '/about'))
      .then(() => emitter.emit('dat:ready'))
      .catch(console.error)
  })

  state.delay = 0
  state.available = 0

  emitter.on('radio:listen', function () {
    const opts = { start: state.audio.remoteLength - 1, tail: true, live: true }
    const read = state.audio.createReadStream(opts)

    console.log('streaming...')
    read.on('data', function (buf) {
      state.available = state.audio.remoteLength
      emitter.emit(state.events.RENDER)
      const lengthms = Math.floor((buf.length - 44) / 16)

      if (state.delay === 0) {
        howlFor(buf, true)
        state.delay = Date.now() + lengthms
      } else {
        const howl = howlFor(buf, false)
        state.delay = Math.max(0, state.delay - Date.now())
        setTimeout(() => howl.play(), state.delay)
        state.delay = Date.now() + state.delay + lengthms
      }
    })
  })

  emitter.on('dat:ready', function () {
    state.available = state.audio.remoteLength
    emitter.emit(state.events.RENDER)
  })
}

module.exports = store
