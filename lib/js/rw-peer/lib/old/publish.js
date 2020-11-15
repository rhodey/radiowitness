var inherits     = require('util').inherits
var EventEmitter = require('events')
var url          = require('url')
var http         = require('http')
var websocket    = require('websocket-stream')
var hyperkeys    = require('dat-encoding')

module.exports = Publisher

function isLocal(req) {
  return req.socket.localAddress === req.socket.remoteAddress
}

function defaults(override) {
  var opts = override === undefined ? { } : Object.assign({ }, override)
  opts.timeout = !isNaN(opts.timeout) ? parseInt(opts.timeout) : 12500
  return opts
}

function Publisher(archive, storage, opts) {
  EventEmitter.call(this)
  this.opts = defaults(opts)
  this.closed = false
  this.wss = undefined

  var self = this
  archive.on('error', function (err) { self.emit('error', err) })
  archive.once('close', function () { self.close(new Error('archive closed unexpectedly')) })

  this.replicate = function (read, write, upload) {
    var self = this
    var sopts = { live: true, upload, download: true }

    function cberr (err) {
      console.error(Date.now(), 'repl error', read.readable, write.writable, upload, repl)
      console.error(Date.now(), 'repl error', err)

      read.unpipe(repl)
      repl.destroy()
      self.emit('error', err)
    }

    console.error(Date.now(), 'repl begin', upload)
    var repl = archive.core.replicate(/*false, */sopts)

    repl.once('error', cberr)
    read.once('error', cberr)
    write.once('error', cberr)
    repl.once('close', function () {
      read.destroy()
      write.destroy()
      if (!self.closed) {
        self.emit('error', new Error('replication closed early'))
      }
    })
    read.pipe(repl).pipe(write)
  }

  this.replicateWss = function () {
    var self = this
    if (self.wss) { throw new Error('wss already listening') }
    self.wss = http.createServer(function (req, res) {
      var path = url.parse(req.url).path.substr(1)
      if (isLocal(req) && path === 'backup') {
        storage.backup(function (err) {
          if (err) {
            console.error(Date.now(), 'backup error', err)
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end("backup error: " + err + "\n")
            self.emit('error', err)
          } else {
            console.error(Date.now(), 'backup ok')
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end("backup ok\n")
          }
        })
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end("hi\n")
      }
    })

    websocket.createServer({ server : self.wss }, function (peer, req) {
      var pubkey = hyperkeys.encode(archive.core.key)
      var path = url.parse(req.url).path.substr(1)
      if (pubkey !== path) {
        console.error(Date.now(), 'repl 404', pubkey, path)
        return peer.end("repl 404\n")
      }

      console.error(Date.now(), 'repl.wss begin', path, req.socket.remoteAddress)
      var sopts = { live: true, upload: true, download: false }
      var repl = archive.core.replicate(/*false, */sopts)

      function cberr (err) {
        console.error(Date.now(), 'repl.wss error', path, req.socket.remoteAddress)
        console.error(Date.now(), 'repl.wss error', repl.readable, peer.writable, upload)
        console.error(Date.now(), 'repl.wss error', err)

        repl.unpipe(peer)
        repl.destroy()
      }

      repl.once('error', cberr)
      peer.once('error', cberr)
      repl.once('close', function () { peer.destroy() })
      repl.pipe(peer).pipe(repl)
    })

    console.error(Date.now(), 'wss listen', self.opts.wss)
    self.wss.listen(self.opts.wss)
    return self.wss
  }

  this.close = function (err) {
    var self = this
    return self.closed ? Promise.resolve(1337) : new Promise(function (res, rej) {
      self.closed = true
      archive.close().then(function () {
        if (self.wss) {
          self.wss.close(function (err2) {
            self.wss = undefined
            self.emit('close', err || err2)
            if (err2) { rej(err2) }
            else { res() }
          })
        } else {
          self.emit('close', err)
          res()
        }
      }).catch(function (err2) {
        self.emit('close', err || err2)
        rej(err2)
      })
    })
  }
}

inherits(Publisher, EventEmitter)
