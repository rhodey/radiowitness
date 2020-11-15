const hyperkeys = require('dat-encoding')
const hypercore = require('hypercore')
const hyperdb   = require('hyperdb')
const ram       = require('random-access-memory')
const swarms    = require('@geut/discovery-swarm-webrtc')
const websocket = require('websocket-stream')
const signalhub = require('signalhub')
const howler    = require('howler')
const dat       = require('../dat.json')

function isDb(archive) {
  return !!(archive.get && archive.put && archive.replicate && archive.authorize)
}

function about(archive) {
  return new Promise((res, rej) => {
    if (isDb(archive)) {
      archive.get('/rw-about', (err) => {
        if (err) { rej(err) }
        else { res(archive) }
      })
    } else {
      archive.get(0, (err) => {
        if (err) { rej(err) }
        else { res(archive) }
      })
    }
  })
}

function wrtc(archive) {
  return new Promise((res, rej) => {
    let channel = hyperkeys.encode(archive.key)
    let hub = signalhub(channel, ['https://rhodey.org:9001'])
    let swarm = swarms({
      stream : () => archive.replicate({ live : isDb(archive) })
    })

    swarm.join(hub, { maxPeers : 4 })
    swarm.on('connection', (conn, info) => {
      console.log('!!! wrtc.conn', info)
      res()
    })
  })
}

function wss(archive) {
  return new Promise((res, rej) => {
    let path = hyperkeys.encode(archive.key)
    let ws = websocket(`wss://rhodey.org:8443/${path}`)
    ws.on('error', rej)
    ws.once('connect', () => {
      let repl = archive.replicate({ live : isDb(archive) })
      console.log('!!! wss.conn')
      repl.pipe(ws).pipe(repl)
      repl.on('error', (err) => {
        console.error('!!! repl.err', err)
      })
      res()
    })
  })
}

function store (state, emitter) {
  state.db = { msg : 'creating' }
  state.studio = { msg : 'creating' }

  emitter.on('DOMContentLoaded', () => {
    let dkey = dat.links.publisher[2].href.split('dat://')[1]
    let db = hyperdb(() => ram(), dkey, { sparse : true })

    db.once('error', console.error)
    db.once('ready', () => emitter.emit('dat:open-db', db))

    let skey = dat.links.publisher[1].href.split('dat://')[1]
    let studio = hypercore(() => ram(), skey, { sparse : true })

    studio.once('error', console.error)
    studio.once('ready', () => emitter.emit('dat:open-studio', studio))
  })

  const replWrtc = (archive, timer) => {
    archive.msg = 'attempting WebRTC connection'
    emitter.emit(state.events.RENDER)
    return wrtc(archive)
      .then(() => {
        archive.msg = 'reading configuration'
        emitter.emit(state.events.RENDER)
        return about(archive)
      }).then(() => {
        clearTimeout(timer)
        archive.msg = 'ready'
        emitter.emit(state.events.RENDER)
      })
  }

  const replWss = (archive) => {
    archive.msg = 'falling back to HTTP connection'
    emitter.emit(state.events.RENDER)
    return wss(archive)
      .then(() => {
        archive.msg = 'reading configuration'
        emitter.emit(state.events.RENDER)
        return about(archive)
      }).then(() => {
        archive.msg = 'ready'
        emitter.emit(state.events.RENDER)
      })
  }

  emitter.on('dat:open-studio', (studio) => {
    studio.msg = state.studio.msg
    state.studio = studio

    let timer = setTimeout(() => {
      replWss(studio)
        .then(() => emitter.emit('dat:ready-studio'))
        .catch(console.error)
    }, 5000)

    replWrtc(studio, timer)
      .then(() => emitter.emit('dat:ready-studio'))
      .catch(console.error)
  })

  emitter.on('dat:open-db', (db) => {
    db.msg = state.db.msg
    state.db = db

    let timer = setTimeout(() => {
      replWss(db)
        .then(() => emitter.emit('dat:ready-db'))
        .catch(console.error)
    }, 5000)

    replWrtc(db, timer)
      .then(() => emitter.emit('dat:ready-db'))
      .catch(console.error)
  })
}

module.exports = store
