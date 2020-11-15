const howler = require('howler')

function store (state, emitter) {
  const dataUri = (buf) => {
    let b64 = btoa(buf.reduce((data, byte) => data + String.fromCharCode(byte), ''))
    return `data:audio/wav;base64,${b64}`
  }

  const howlLoadError = (id, err) => { console.log('QQQ on load error ->', err) }
  const howlPlayError = (id, err) => { console.log('QQQ on play error ->', err) }

  const howlFor = (buf) => {
    //if (!state.audio) { return null }
    return new howler.Howl({
      src         : [dataUri(buf)],
      format      : ["wav"],
      html5       : true,
      autoplay    : true,
      onloaderror : howlLoadError,
      onplayerror : howlPlayError
    })
  }

  emitter.on('dat:ready-studio', () => {
    if (state.streaming) { return }
    state.tail = 0
    state.streaming = true
    emitter.emit(state.events.RENDER)

    let studio = state.studio
    let tail = (studio.remoteLength - 1) % 2 == 0 ? studio.remoteLength - 1 : studio.remoteLength - 2
    let opts = { start : tail, live : true }
    let read = studio.createReadStream(opts)

    console.log('streaming...')
    read.on('data', (buf) => {
      if (tail % 2 === 0) {
        let howl = howlFor(buf)
        console.log(tail, howl)
      }
      state.tail = tail++
      emitter.emit(state.events.RENDER)
    })
  })
}

module.exports = store
