const through = require('pull-through')
const fs      = require('fs')
const mkdirp  = require('mkdirp')
const spawn   = require('child_process').spawn

function filename(call) {
  return `call-${call.time}-${call.group}-${call.source}.vcw`
}

function write(dirname, call) {
  return new Promise(function (res, rej) {
    if (call.speech.length === 0) { return res(null) }
    const mbefile = `${dirname}/${filename(call)}`
    const data = call.speech.reduce(function (acc, vcw) {
      return Buffer.concat([acc, Buffer.from(vcw.data)])
    }, Buffer.from('.vcw'))
    fs.writeFile(mbefile, data, function (err) {
      if (err) { rej(err) }
      else { res(mbefile) }
    })
  })
}

function synthesize(mbefile) {
  return new Promise(function (res, rej) {
    if (!mbefile) { return res(null) }
    const wavfile = mbefile.replace('vcw', 'wav')
    spawn('dsd', ['-w', wavfile, '-r', mbefile]).once('exit', function (code) {
      if (code === 0) {
        res(wavfile)
      } else {
        rej(new Error(`dsd exited with code: ${code}`))
      }
    })
  })
}

function cleanup(wavfile) {
  return new Promise(function (res, rej) {
    if (!wavfile) { return res(null) }
    const mbefile = wavfile.replace('wav', 'vcw')
    fs.unlink(mbefile, function (err) {
      if (err) { rej(err) }
      else { res(wavfile) }
    })
  })
}

module.exports = function (dirname) {
  return through(function (call) {
    mkdirp(dirname)
    .then(() => write(dirname, call))
    .then(synthesize)
    .then(cleanup)
    .then(wavfile => {
      call.wav = wavfile
      delete call.speech
      this.queue(call)
    }).catch(err => this.emit('error', err))
  })
}
