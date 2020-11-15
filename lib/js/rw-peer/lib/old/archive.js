var inherits     = require('util').inherits
var EventEmitter = require('events')
var codec        = require('codecs')('json')
var ram          = require('random-access-memory')
var hyperkeys    = require('dat-encoding')
var hypercore    = require('hypercore')
var hyperdb      = require('hyperdb')
var websocket    = require('websocket-stream')
var hyperMinio   = require('../../hyper-storage-minio')

function Archive(core, opts) {
  EventEmitter.call(this)
  this.closed = false
  this.clearing = undefined

  var self = this
  core.on('error', function (err) { self.emit('error', err) })
  core.once('close', function () { self.close(new Error('core closed unexpectedly')) })

  this.isDb = function () {
    return !!(core.get && core.put && core.replicate && core.authorize)
  }

  this.encode = function (type, data) {
    data = Object.assign({ }, data)
    switch (type) {
      case 'about':
        if (!data.type) { throw new Error('archive about.type is missing') }
        data.version = 1 // todo: review
        data.links = data.links || { }
        data.tags = data.tags || { }
        return codec.encode(data)

      case 'batch':
        return codec.encode(data)

      case 'call':
        return codec.encode(Object.assign({ }, data, { type }))

      default:
        return null
    }
  }

  this.read = function (local, index) {
    if (local && core.length <= index) {
      return Promise.resolve(null)
    } else {
      return new Promise(function (res, rej) {
        var timeout = local ? 500 : 5000 // todo: opt
        core.get(index, { timeout }, function (err, data) {
          if (err) { rej(err) }
          else { res(data) }
        })
      })
    }
  }

  this.append = function (data) {
    return new Promise(function (res, rej) {
      core.append(data, function (err, seq) {
        if (err) { rej(err) }
        else { res(seq) }
      })
    })
  }

  this.put = function (path, data) {
    return new Promise(function (res, rej) {
      core.put(path, data, function (err) {
        if (err) { rej(err) }
        else { res() }
      })
    })
  }

  this.clear = function () {
    var self = this
    var clearing = self.clearing || new Promise(function (res, rej) {
      var end = core.length - opts.capacity
      if (opts.capacity <= 0 || end <= 1 || core.length % 100 !== 0) {
        res(0)
      } else {
        core.clear(1, end, function (err) {
          if (err) { rej(err) }
          else { res(end) }
        })
      }
    }).finally(function () {
      self.clearing = undefined
    })

    return self.clearing = clearing
  }

  this.about = function (local, meta) {
    var self = this
    if (self.isDb()) {
      return new Promise(function (res, rej) {
        // todo: get if present
        core.put('/rw-about', self.encode('about', meta), function (err) {
          if (err) { rej(err) }
          else { res(meta) }
        })
      })
    }
    return self.read(local, 0).then(function (data) {
      if (!data && meta) {
        return self.append(self.encode('about', meta)).then(function (seq) { return meta })
      } else if (data) {
        return codec.decode(data)
      } else if (!meta) {
        throw new Error('archive about is missing.')
      }
    })
  }

  this.replicateStream = function (read, write, upload) {
    var self = this
    var sopts = { live: true, upload, download: true }
    var repl = core.replicate(/*true, */sopts)

    function cberr (err) {
      if (self.closed) { return }
      console.error(Date.now(), 'repl error', read.readable, write.writable, upload, repl)
      console.error(Date.now(), 'repl error', err)

      read.unpipe(repl)
      repl.destroy()
      self.emit('error', err)
    }

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
    return read.pipe(repl).pipe(write)
  }

  this.replicateWss = function (pub, upload) {
    var sopts = { live: true, upload, download: true }
    var repl = core.replicate(/*true, */sopts)
    var wss = websocket('wss://' + pub + '/' + hyperkeys.encode(core.key))

    function cberr (err) {
      if (self.closed) { return }
      console.error(Date.now(), 'repl.wss error', wss.readable, wss.writable, upload)
      console.error(Date.now(), 'repl.wss error', err)

      wss.unpipe(repl)
      repl.destroy()
      self.emit('error', err)
    }

    repl.once('error', cberr)
    wss.once('error', cberr)
    repl.once('close', function () {
      wss.destroy()
      if (!self.closed) {
        self.emit('error', new Error('wss replication closed early'))
      }
    })
    return repl.pipe(wss).pipe(repl)
  }

  this.close = function (err) {
    var self = this
    return self.closed ? Promise.resolve(1337) : new Promise(function (res, rej) {
      self.closed = true
      if (self.isDb()) { return res() }
      core.close(function (err2) {
        self.emit('close', err || err2)
        if (err2) { rej(err2) }
        else { res() }
      })
    })
  }
}

inherits(Archive, EventEmitter)

function defaults(override) {
  var opts = override === undefined ? { } : Object.assign({ }, override)
  opts.dir = '/archive'
  opts.sparse = true
  opts.valueEncoding = 'utf-8'
  opts.capacity = !isNaN(opts.capacity) ? parseInt(opts.capacity) : 0
  return opts
}

function ready(core, archive) {
  return new Promise(function (res, rej) {
    core.once('error', rej)
    core.once('ready', function () {
      archive.core = core
      res(archive)
    })
  })
}

function create(about, opts) {
  opts = defaults(opts)
  var core = hypercore(opts.dir, opts)
  var archive = new Archive(core, opts)
  return ready(core, archive)
    .then(function (archive) {
      return archive.about(true, about)
    }).then(function (about) {
      archive.about = about
      return archive
    }).catch(function (err) {
      archive.close()
      throw err
    })
}

function author(opts) {
  opts = defaults(opts)
  var core = hypercore(opts.dir, opts)
  var archive = new Archive(core, opts)
  return ready(core, archive)
}

function publish(key, opts) {
  opts = defaults(opts)
  opts.sparse = false
  var store = hyperMinio(opts.minio, opts.bucket, opts)
  var core = hypercore(function (fname) { return store.storage(fname) }, key, opts)
  var archive = new Archive(core, opts)
  return ready(core, archive).then(function () {
    return [archive, store]
  })
}

function studioin(key, opts) {
  opts = defaults(opts)
  opts.dir = ''
  var core = hypercore(function (fname) { return ram() }, key, opts)
  var archive = new Archive(core, opts)
  return ready(core, archive)
}

function studiout(opts) {
  opts = defaults(opts)
  var core = hypercore(opts.dir, opts)
  var archive = new Archive(core, opts)
  return ready(core, archive)
}

function play(key, opts) {
  opts = defaults(opts)
  opts.dir = ''
  var core = hypercore(function (fname) { return ram() }, key, opts)
  var archive = new Archive(core, opts)
  return ready(core, archive)
}

function index(opts) {
  opts = defaults(opts)
  var db = hyperdb(opts.dir) // todo: opts?
  var archive = new Archive(db, opts)
  return ready(db, archive)
}

module.exports = {
  create,
  author,
  publish,
  studioin,
  studiout,
  play,
  index
}
