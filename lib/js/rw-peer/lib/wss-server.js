const url       = require('url')
const fs        = require('fs')
const https     = require('https')
const http      = require('http')
const hyperkeys = require('dat-encoding')
const websocket = require('websocket-stream')

module.exports = function (port, audio, db, limit) {
  const map = JSON.stringify({
    audio: hyperkeys.encode(audio.key),
    db: hyperkeys.encode(db.key),
    limit
  })

  const server = http.createServer(function (req, res) {
    const path = url.parse(req.url).path.substr(1)
    if (path === 'dat.json') {
      res.end(map)
    } else {
      res.end(`http.404 ${path}\n`)
    }
  })

  websocket.createServer({ server }, function (peer, req) {
    var repl = null
    const path = url.parse(req.url).path.substr(1)

    if (path === 'audio') {
      repl = audio.replicate(false, { live: true })
    } else if (path === 'db') {
      repl = db.replicate({ live: true })
    } else {
      return peer.end(`wss.404 ${path}\n`)
    }

    console.log(`repl ${path}`)
    repl.pipe(peer).pipe(repl)
    repl.on('error', function (err) {
      console.error('wss.repl.err', err)
      peer.end()
    })
  })

  server.listen(port)
}
