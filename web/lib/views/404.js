const html = require('choo/html')
const TITLE = 'RadioWitness - 404'
module.exports = view

function view (state, emit) {
  if (state.title !== TITLE) {
    emit(state.events.DOMTITLECHANGE, TITLE)
  }

  return html`
    <body class="sans-serif pa3">
      <h1>404</h1>
      <a class="pt2" href="/">home</a>
    </body>
  `
}
