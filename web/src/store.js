const codec     = require('codecs')('json')
const hypercore = require('hypercore')
const hyperdb   = require('hyperdb')
const ram       = require('random-access-memory')
const websocket = require('websocket-stream')
const howler    = require('howler')
const conf      = require('../config.json')

function isDb(archive) {
  return archive.authorize !== undefined
}

function get(archive, idx) {
  return new Promise(function (res, rej) {
    archive.get(idx, function (err, data) {
      if (err) {
        rej(err)
      } else if (isDb(archive)) {
        res(codec.decode(data[0].value))
      } else {
        res(data)
      }
    })
  })
}

function ws(archive) {
  return new Promise(function (res, rej) {
    const path = isDb(archive) ? 'ws/db' : 'ws/audio'
    const ws = websocket(`${conf.host}/${path}`)
    ws.on('error', rej)
    ws.once('connect', function () {
      const repl = isDb(archive) ? archive.replicate({ live: true }) : archive.replicate(true, { live: true })
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

const howlLoadError = (id, err) => { console.error(`on load error ${id}`, err) }
const howlPlayError = (id, err) => { console.error(`on play error ${id}`, err) }

function howlFor(idx, buf, autoplay) {
  const duration = Math.floor((buf.length - 44) / 16)
  const howl = new howler.Howl({
    src         : [dataUri(buf)],
    format      : ["wav"],
    html5       : true,
    onloaderror : howlLoadError,
    onplayerror : howlPlayError,
    autoplay
  })
  return { idx, duration, howl }
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
    return Promise.all([ws(state.db), ws(state.audio)])
      .then(() => get(state.audio, 0))
      .then(() => get(state.db, '/about'))
      .then(() => emitter.emit('dat:ready'))
      .catch(console.error)
  })

  state.first = null
  emitter.on('dat:ready', function () {
    const start = state.audio.remoteLength - 1
    get(state.audio, start).then(function (buf) {
      state.first = howlFor(start, buf, false)
      emitter.emit(state.events.RENDER)
    }).catch(console.error)
  })

  state.listening = false
  emitter.on('radio:listen', function () {
    const first = state.first
    state.first = null
    state.listening = true

    first.howl.play()
    setTimeout(() => emitter.emit('audio:next', first.idx + 1), first.duration)
    emitter.emit(state.events.RENDER)
  })

  state.waiting = false
  emitter.on('audio:next', function (idx) {
    state.waiting = true
    emitter.emit(state.events.RENDER)
    state.audio.update(idx + 1, function () {
      get(state.audio, idx).then(function (buf) {
        state.waiting = false
        const next = howlFor(idx, buf, true)
        setTimeout(() => emitter.emit('audio:next', next.idx + 1), next.duration)
        emitter.emit(state.events.RENDER)
      }).catch(console.error)
    })
  })
}

module.exports = store
