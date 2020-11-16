const fs        = require('fs')
const https     = require('https')
const http      = require('http')
const websocket = require('websocket-stream')

function date() {
  const now = new Date()
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toTimeString().substr(0, 8)}`
}

function fetchConfig(host) {
  return new Promise(function (res, rej) {
    const getOpts = {
      host: host.split(':')[0],
      port: parseInt(host.split(':')[1]),
      path: '/dat.json'
    }
    http.get(getOpts, function (resp) {
      var json = ''
      resp.on('data', chunk => json += chunk)
      resp.on('end', function () {
        if (resp.statusCode !== 200) {
          return rej(new Error(`GET /dat.json returned HTTP ${resp.statusCode}`))
        }

        try {

          const config = JSON.parse(json)
          if (!config.audio || !config.db || config.audio.length !== 64 || config.db.length !== 64) {
            throw new Error()
          } else {
            res(config)
          }

        } catch (err) {
          rej(new Error('GET /dat.json returned invalid JSON'))
        }
      })
    }).on('error', rej)
  })
}

function readCheckpoint() {
  return new Promise(function (res, rej) {
    fs.readFile('/archive/.mirror', { flag: 'a+' }, function (err, data) {
      if (err) {
        rej(err)
      } else if (isNaN(parseInt(data))) { // lol isNaN('') === false
        res(0)
      } else {
        res(parseInt(data))
      }
    })
  })
}

function writeCheckpoint(idx) {
  return new Promise(function (res, rej) {
    fs.writeFile('/archive/.mirror', '' + idx, function (err) {
      if (err) {
        rej(err)
      } else {
        res(idx)
      }
    })
  })
}

function limit(audio, limitLocal, prev) {
  return new Promise(function (res, rej) {
    if (limitLocal <= 0 || audio.remoteLength - 1 <= limitLocal) {
      res(prev)
    } else {
      const start = audio.remoteLength - limitLocal
      console.error('audio.clear', 1, start)
      audio.clear(1, start, function (err) {
        if (err && err.message === 'No node found') { // todo: hypercore bug!
          console.error('audio.clear.404', 1, start)
          res(Math.max(prev, start))
        } else if (err) {
          rej(err)
        } else {
          res(Math.max(prev, start))
        }
      })
    }
  })
}

const sopts = { wait: true, timeout: 10000 }

function batch(rej, audio, limitLocal, limitRemote) {
  if (audio.remoteLength <= 0) {
    return setTimeout(() => batch(rej, audio, limitLocal, limitRemote), 2250)
  }

  readCheckpoint()
    .then(prev => limit(audio, limitLocal, prev))
    .then(function (start) {
      if (limitRemote > 0) {
        start = Math.max(start, audio.remoteLength - limitRemote)
      }

      const end = start + Math.min(50, audio.remoteLength - start)
      if (start >= end) {
        return setTimeout(() => batch(rej, audio, limitLocal, limitRemote), 2250)
      }

      console.error(`${date()} fetching ${start} thru ${end} of ${audio.remoteLength}...`)
      audio.getBatch(start, end, sopts, function (err, res) {
        if (err) {
          return rej(err)
        } else {
          console.error(`${date()} fetched  ${start} thru ${end}.`)
        }

        writeCheckpoint(end)
          .then(() => setTimeout(() => batch(rej, audio, limitLocal, limitRemote), 1250))
          .catch(rej)
      })
  }).catch(rej)
}

function replicate(host, audio, db, limitLocal, limitRemote) {
  // todo: reconnect
  return new Promise(function (res, rej) {
    const audioWs = websocket(`${host}/audio`)
    audioWs.on('error', rej)
    const audioRpl = audio.replicate(true, { live: true })
    audioRpl.pipe(audioWs).pipe(audioRpl)
    audio.get(0, sopts, function (err, data) {
      if (err) {
        rej(err)
      } else {
        batch(rej, audio, limitLocal, limitRemote)
      }
    })

    const dbWs = websocket(`${host}/db`)
    dbWs.on('error', rej)
    const dbRpl = db.replicate({ live: true })
    dbRpl.pipe(dbWs).pipe(dbRpl)
  })
}

module.exports = { fetchConfig, replicate }
