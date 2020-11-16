const mini        = require('minimist')
const fs          = require('fs')
const mkdirp      = require('mkdirp')
const codec       = require('codecs')('json')
const split       = require('split')
const pull        = require('pull-stream')
const toPull      = require('stream-to-pull-stream')
const hypercore   = require('hypercore')
const hyperdb     = require('hyperdb')
const file        = require('random-access-file')
const multiRandom = require('../multi-random-access')
const p25decode   = require('./lib/p25/decode.js')
const p25buffer   = require('./lib/p25/callbuffer.js')
const p25synth    = require('./lib/p25/synthesis.js')
const wsServer    = require('./lib/ws-server.js')
const wsMirror    = require('./lib/ws-mirror.js')

function date() {
  const now = new Date()
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toTimeString().substr(0, 8)}`
}

function onClose(err) {
  if (err) {
    console.error(date(), err)
    process.exit(1)
  } else {
    process.exit(0)
  }
}

function closeIfErr(err) {
  if (err) onClose(err)
}

function ready(hyper) {
  return new Promise(function (res, rej) {
    hyper.once('error', rej)
    hyper.once('ready', function () { res(hyper) })
  })
}

function storageAudio(opts) {
  return function (filename) {
    if (filename === 'data') {
      const length = file(`${opts.dirAudio}/multi-length`)
      return multiRandom(length, function (offset, cb) {
        const index = Math.floor(offset / opts.partition)
        cb(null, {
          start: index * opts.partition,
          end: index * opts.partition + opts.partition,
          storage: file(`${opts.dirAudio}/multi-part-${index}`)
        })
      })
    } else if (filename === 'bitfield') {
      const lock = require('fd-lock')
      return file(filename, { directory: opts.dirAudio, lock })
    } else {
      return file(filename, { directory: opts.dirAudio })
    }
  }
}

function dbPathFor(call) {
  const hour = Math.floor(call.time / 1000.0 / 60 / 60)
  return `/calls/${hour}/${call.seq}`
}

function limitAppend(core, limit, data) {
  return new Promise(function (res, rej) {
    if (limit <= 0 || core.length - 1 <= limit) {
      res()
    } else {
      core.clear(1, core.length - limit, function (err) {
        if (err) { rej(err) }
        else {
          console.error(date(), 'clear()', 1, core.length - limit)
          res()
        }
      })
    }
  }).then(() => new Promise(function (res, rej) {
    core.append(data, function (err, seq) {
      if (err) { rej(err) }
      else { res(seq) }
    })
  }))
}

const defaults = {
  lat: 0, lon: 0, wacn: 0, sys: 0, rfss: 0, site: 0,
  radios: 1, s: 1200000, mux: 1, f: '', g: 0, d: 0,
  searchms: 5000, callms: 1252,
  dirAudio: '/archive/pcm16bit8kHz', dirDb: '/archive/db', partition: 1000000, limit: 0,
  ws: 8081
}

const argv = mini(process.argv.slice(2))
const cmderr = new Error('expecting command: search, decode, play, create, archive or mirror.')
if (argv._.length <= 0) { onClose(cmderr) }
process.on('SIGINT', onClose)

const cmd0 = argv._[0]
const cmd1 = argv._[1]
const cmd2 = argv._[2]
var opts = Object.assign({ }, defaults, argv)
var audio, db = undefined

switch (cmd0) {
  case 'search':
    if (cmd1 !== 'p25') { onClose(new Error('unsupported protocol')) }
    opts.f += ''
    var freqs = opts.f.split(',')
    var freq = -1
    var count = -1
    var abort = function() { return 1337 }
    var work = Promise.resolve(1337)

    function cbframe (frame) { count++ }

    function next (p25) {
      abort()
      if (count >= 0) { console.log(freq, 'counted', count, 'frames.') }
      if (freqs.length === 0) { return }
      count = 0

      freq = freqs[0]
      freqs = freqs.slice(1)
      if (isNaN(parseInt(freq))) { return }

      return work.then(function() {
        const res = p25.search(parseInt(freq), cbframe)
        work = res[0]
        abort = res[1]
        setTimeout(function () { next(p25) }, opts.searchms)
      }).catch(onClose)
    }

    p25decode(opts)
      .then(next)
      .catch(onClose)
    break;

  case 'decode':
    if (cmd1 !== 'p25') { onClose(new Error('unsupported protocol')) }
    process.stdout.once('end', onClose)
    p25decode(opts)
      .then(p25 => p25.follow(parseInt(opts.f)))
      .then(() => onClose(new Error(`timed out control channel ${opts.f}`)))
      .catch(onClose)
    break;

  case 'play':
    if (cmd1 !== 'p25') { onClose(new Error('unsupported protocol')) }
    process.stdin.once('end', onClose)
    var delay = 0
    pull(
      toPull.source(process.stdin.pipe(split())),
      pull.map(codec.decode),
      p25buffer(opts.callms),
      p25synth('/tmp/pcm16bit8kHz'),
      pull.drain(function (call) {
        if (!call.wav) {
          console.error(date(), call)
          return
        }

        const wav = fs.readFileSync(call.wav).slice(44)
        const lengthms = Math.floor(wav.length / 16)

        if (delay === 0) {
          console.error(date(), call)
          process.stdout.write(wav)
          delay = Date.now() + lengthms
        } else {
          delay = Math.max(0, delay - Date.now())
          setTimeout(function () {
            console.error(date(), call)
            process.stdout.write(wav)
          }, delay)
          delay = Date.now() + delay + lengthms
        }
      }, onClose)
    )
    break;

  case 'create':
    if (cmd1 !== 'p25') { onClose(new Error('unsupported protocol')) }
    const geo = { lat: parseFloat(opts.lat), lon: parseFloat(opts.lon) }
    const network = {
      wacn: parseInt(opts.wacn), sys: parseInt(opts.sys),
      rfss: parseInt(opts.rfss), site: parseInt(opts.site)
    }
    const tags = codec.encode({ name: opts.name, geo, network })
    mkdirp(opts.dirAudio)
      .then(() => mkdirp(opts.dirDb))
      .then(function () {
        audio = hypercore(opts.dirAudio)
        db = hyperdb(opts.dirDb)
        return Promise.all([ready(audio), ready(db)]).then(function () {
          if (audio.length < 1) { audio.append(tags, closeIfErr) }
          db.put('/about', tags, closeIfErr)
        })
      }).catch(onClose)
    break;

  case 'archive':
    if (cmd1 !== 'p25') { onClose(new Error('unsupported protocol')) }
    process.stdin.once('end', onClose)
    let append = Promise.resolve()
    audio = hypercore(opts.dirAudio, { sparse: true })
    db = hyperdb(opts.dirDb)
    Promise.all([ready(audio), ready(db)]).then(function () {
      if (audio.length < 1) { onClose(new Error("run 'create' before 'archive'.")) }
      wsServer(opts.ws, audio, db, opts.limit)
      pull(
        toPull.source(process.stdin.pipe(split())),
        pull.map(codec.decode),
        p25buffer(opts.callms),
        p25synth('/tmp/pcm16bit8kHz'),
        pull.drain(function (call) {
          if (!call.wav) { console.error(date(), -1, call); return }
          const wav = fs.readFileSync(call.wav)
          append = append.then(() => limitAppend(audio, opts.limit, wav)).then(function (seq) {
            call.seq = seq
            console.error(date(), seq, call)
            delete call.wav
            db.put(dbPathFor(call), codec.encode(call), closeIfErr)
          }).catch(onClose)
        }, onClose)
      )
    })
    break;

  case 'mirror':
    process.stdin.once('end', onClose)
    wsMirror.fetchConfig(cmd1).then(function (remote) {
      audio = hypercore(opts.dirAudio, remote.audio, { sparse: true })
      db = hyperdb(opts.dirDb, remote.db, { sparse: false })
      return Promise.all([ready(audio), ready(db)]).then(function () {
        wsServer(opts.ws, audio, db, opts.limit)
        return wsMirror.replicate(cmd1, audio, db, opts.limit, remote.limit)
      })
    }).catch(onClose)
    break;

  case 'config':
    let json = ''
    process.stdin.on('data', chunk => json += chunk)
    process.stdin.once('end', function () {
      try {

        const config = JSON.parse(json)
        config.title = opts.title
        config.description = opts.description
        config.host = opts.host
        process.stdout.write(JSON.stringify(config))

      } catch (err) {
        onClose(err)
      }
    })
    break;

  default:
    onClose(cmderr)
}
