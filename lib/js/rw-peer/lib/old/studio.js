var inherits     = require('util').inherits
var EventEmitter = require('events')
var promisify    = require('util').promisify
var fs           = require('fs')
var codec        = require('codecs')('json')
var Stream       = require('stream')
var pull         = require('pull-stream')
var toPull       = require('stream-to-pull-stream')
var pulltime     = require('pull-timeout2')
var frames       = require('../../../p25-frames')
var slicing      = require('./slicing.js')
var synthesis    = require('./synthesis.js')

module.exports = Studio

function readCheckpoint() {
  return new Promise(function (res, rej) {
    fs.readFile('/app/.studio', { flag: 'a+' }, function (err, data) {
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
  return new Promise(function (res, rej) {
    fs.writeFile('/app/.studio', '' + idx, function (err) {
      if (err) { rej(err) }
      else { res(idx) }
    })
  })
}

function defaults(override) {
  var opts = override === undefined ? { } : Object.assign({ }, override)
  opts.timeout = !isNaN(opts.timeout) ? parseInt(opts.timeout) : 60000
  opts.calltime = !isNan(opts.calltime) ? parseInt(opts.calltime) : 1252
  opts.calldir = opts.calldir ? opts.calldir : '/tmp/rw-studio'
  return opts
}

function Studio(input, output, opts) {
  EventEmitter.call(this)
  this.opts = defaults(opts)
  this.work = new Stream()
  this.work.readable = true
  this.closed = false

  var self = this
  input.on('error', function (err) { self.emit('error', err) })
  output.on('error', function (err) { self.emit('error', err) })
  input.once('close', function () { self.close(new Error('input archive closed unexpectedly')) })
  output.once('close', function () { self.close(new Error('output archive closed unexpectedly')) })

  this._author = function (call) {
    if (!call.wav) { return Promise.resolve(12) }
    return output.clear()
      .then((end) => promisify(fs.stat)(call.wav)) // todo: use always or not at all
      .then(function (stat) {
        var meta = Object.assign({ }, call, { size: stat.size })
        delete meta.wav
        return meta
      }).then(function (meta) {
        return Promise.all([
          output.append(output.encode('call', meta)),
          output.append(fs.readFileSync(call.wav))
        ])
      })
  }

  this._stream = function (about, rej) {
    var self = this
    pull(
      toPull.source(self.work),
      pulltime(self.opts.timeout),
      pull.flatten(),
      pull.map(codec.decode),
      pull.flatten(),
      pull.filter((tagged) => tagged.frame !== undefined),
      pull.map(function (tagged) {
        tagged.frame = frames(Buffer.from(tagged.frame))
        return tagged
      }),
      pull.filter((tagged) => !tagged.frame.err),
      slicing(about.tags.network, self.opts.calltime),
      synthesis(self.opts.calldir),
      pull.drain(function (call) {
        self._author(call).then(function () {
          console.error(Date.now(), 'archive length', output.core.length, ', call', call)
        }).catch(rej)
      }, rej)
    )
  }

  this._next = function (rej) {
    var self = this
    return readCheckpoint().then(function (start) {
      var end = start + Math.min(100, input.core.remoteLength - start) // todo: opt
      return start >= end ? 1089 : new Promise(function (res, rej) {
        var sopts = { wait: true, timeout: 0 }
        input.core.getBatch(start, end, sopts, function (err, batch) {
          if (err) { return rej(err) }
          self.work.emit('data', batch)
          // todo: only checkpoint after work completed
          writeCheckpoint(end)
            .then(input.clear)
            .then(res).catch(rej)
        })
      })
    }).then(function () {
      setTimeout(function () { self._next(rej) }, 1252)
    }).catch(rej)
  }

  this.synthesize = function () {
    return readCheckpoint().then(function (start) {
      console.error(Date.now(), 'restarting from', start)
      return new Promise(function (res, rej) {
        self._next(rej)
        output.about(true).then(function (about) {
          self._stream(about, function (err) {
            if (err === true) { res() }
            else { rej(err) }
          })
        })
      })
    })
  }

  this.close = function (err) {
    var self = this
    if (self.closed) { return Promise.resolve(337) }
    self.closed = true
    return input.close()
      .then(output.close)
      .then(function () {
        self.emit('close', err)
      }).catch(function (err2) {
        self.emit('close', err || err2)
      })
  }
}

inherits(Studio, EventEmitter)
