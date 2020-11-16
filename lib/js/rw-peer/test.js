const hypercore   = require('hypercore')
const hyperdb     = require('hyperdb')
const multiRandom = require('../multi-random-access')
const file        = require('random-access-file')

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
    console.log(333, filename, opts)
    if (filename === 'data') {
      const length = file(`#{opts.dirAudio}/multi-length`)
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

let opts = {
  dirAudio: '/tmp/audio',
  partition: 22
}

let core = hypercore(storageAudio(opts), { valueEncoding: 'utf-8' })

Promise.all([ready(core)/*, ready(db)*/]).then(function () {
  core.append(Buffer.from('hello world'), closeIfErr) // part-0
  core.append(Buffer.from('hello world'), closeIfErr) // part-0
  core.append(Buffer.from('hello world'), closeIfErr) // part-1
  core.append(Buffer.from('hello world'), closeIfErr) // part-1
  core.append(Buffer.from('hello world'), closeIfErr) // part-2
  setTimeout(function () {
    core.clear(1, 3, closeIfErr)
  }, 1000)
  setTimeout(function () {
    core.clear(1, 4, closeIfErr)
  }, 2000)
})
