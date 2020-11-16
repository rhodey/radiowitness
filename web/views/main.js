const html = require('choo/html')
const conf = require('../config.json')

const TITLE = 'RadioWitness'
module.exports = view

function view (state, emit) {
  if (state.title !== TITLE) {
    emit(state.events.DOMTITLECHANGE, TITLE)
  }

  function listen() {
    if (state.available > 0) {
      emit('radio:listen')
    }
  }

  const listenText = state.available > 0 ? 'LISTEN!' : 'LOADING...'

  return html`<body>
    <h2>${conf.title}</h2>
    <p>${conf.description}</p>
    <p>Radio calls available: ${state.available}</p>
    <button onclick=${listen}>${listenText}</button>
  </body>`
}
