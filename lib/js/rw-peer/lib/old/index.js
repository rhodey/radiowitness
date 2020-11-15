const codec      = require('codecs')('json')
const fs         = require('fs')
const Stream     = require('stream')
const pull       = require('pull-stream')
const through    = require('pull-through')
const toPull     = require('stream-to-pull-stream')
const pulltime  = require('pull-timeout2')
const hyperkeys  = require('dat-encoding')
const archives   = require('./archive.js')

function readCheckpoint() {
  return new Promise((res, rej) => {
    fs.readFile('/app/.db', { flag : 'a+' }, (err, data) => {
      if (err) {
        rej(err)
      } else if (isNaN(parseInt(data))) {
        res(1)
      } else {
        res(parseInt(data))
      }
    })
  })
}

function writeCheckpoint(idx) {
  return new Promise((res, rej) => {
    fs.writeFile('/app/.db', '' + idx, (err) => {
      if (err) {
        rej(err)
      } else {
        res(idx)
      }
    })
  })
}

function Index(input, output, opts) {
  const work = new Stream()
  work.readable = true

  function pathFor(call) {
    let hour = Math.floor(call.start / 1000.0 / 60 / 60)
    return `/calls/${hour}/${call.index}`
  }

  function stream(rej, about) {
    pull(
      toPull.source(work),
      pulltime(opts.timeout),
      pull.filter((wrk) => wrk.block.length <= 256),
      pull.filter((wrk) => {
        try {
          return codec.decode(wrk.block) != null
        } catch (err) {
          return false
        }
      }),
      pull.drain((wrk) => {
        let call = Object.assign({ index : wrk.index }, codec.decode(wrk.block))
        let path = pathFor(call)
        output.put(path, codec.encode(call)).then(() => {
          console.error(path, call)
        }).catch(rej)
      }, rej)
    )
  }

  function next(rej) {
    readCheckpoint().then((start) => {
      let end = start + Math.min(64, input.core.remoteLength - start)
      let sopts = { wait : true, timeout : 0 }

      if (start >= end) {
        setTimeout(() => next(rej), 1250)
        return
      }

      input.core.getBatch(start, end, sopts, (err, batch) => {
        if (err) {
          rej(err)
        } else {
          batch.forEach((block, idx) => {
            work.emit('data', { block, index : (start + idx) })
          })
          // todo: read checkpoints from 2nd queue
          writeCheckpoint(end)
            .then(input.clear)
            .then(() => setTimeout(() => next(rej), 1250))
            .catch(rej)
        }
      })
    }).catch(rej)
  }

  function ing() {
    return input.about(false).then((src) => {
      let about = { type : 'rw-index', links : {}, tags : { geo : null, network : null } }
      if (src.tags && src.tags.geo) { about.tags.geo = src.tags.geo }
      if (src.tags && src.tags.network) { about.tags.network = src.tags.network }

      let href = `dat://${hyperkeys.encode(input.core.key)}`
      about.links.author = [{ type : 'rw-studio', href }]

      if (!src.links || !Array.isArray(src.links.author)) {
        throw new Error('input rw-studio hypercore does not link any authors')
      } else if (!src.links.author.find((link) => link.type === 'rw-author')) {
        throw new Error('input rw-studio hypercore does not link rw-author')
      }

      about.links.author.push(src.links.author.filter((link) => link.type === 'rw-author'))
      return output.about(true, about)
    }).then((about) => readCheckpoint().then((start) => {
      console.error(`index ready, restarting from ${start}.`)
      return about
    })).then((about) => new Promise((res, rej) => {
      next(rej)
      stream(rej, about)
    }))
  }

  function close(err) {
    if (err) { console.error(err) }
    return input.close()
      .then(output.close)
      .then(() => { if (err) { throw err }})
  }

  input.core.once('error', close)
  output.core.once('error', close)

  return {
    ing,
    close
  }
}

function defaults(opts) {
  if (!opts) { opts = { } }
  opts.timeout = opts.timeout ? parseInt(opts.timeout) : 60000
  return opts
}

module.exports = function (key, opts) {
  let input = undefined
  opts = defaults(opts)
  return archives.play(key, Object.assign({}, opts))
    .then((ready) => input = ready)
    .then(() => archives.index(opts))
    .then((output) => {
      let index = Index(input, output, opts)
      index.io = [input, output]
      return index
    }).catch((err) => {
      if (input) { input.close() }
      throw err
    })
}
