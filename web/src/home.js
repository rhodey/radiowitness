const html = require('choo/html')
const conf = require('../config.json')

const TITLE = 'RadioWitness'
module.exports = view

function view (state, emit) {
  if (state.title !== TITLE) {
    emit(state.events.DOMTITLECHANGE, TITLE)
  }

  function listen() {
    emit('radio:listen')
  }

  var button
  if (!state.listening && state.first === null) {
    button = html`<button>loading...</button>`
  } else if (!state.listening && state.first !== null) {
    button = html`<button onclick=${listen}>listen!</button>`
  } else if (state.listening && state.waiting) {
    button = html`<button>silence...</button>`
  } else {
    button = html`<button>blah blah blah</button>`
  }

  return html`<body>
    <h2>${conf.title}</h2>
    <p>${conf.description}</p>
    ${button}
  </body>`
}
