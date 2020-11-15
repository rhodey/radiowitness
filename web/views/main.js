const html = require('choo/html')
const D3Force = require('./d3-force.js')
const DateTimeSelect = require('./date-time.js')
const conf = require('../dat.json')

module.exports = view

function view (state, emit) {
  const TITLE = 'd3 thing'
  if (state.title !== TITLE) {
    emit(state.events.DOMTITLECHANGE, TITLE)
  }

  let status = ''
  if (state.db.msg !== 'ready') {
    status = html`<p>database: ${state.db.msg}...</p>`
  } else if (state.callcount !== -1) {
    status = html`<p>database: loading ${state.callcount} calls...</p>`
  }

  return html`<body>
    <div class="app">
      <h2>${conf.title}</h2>
      ${status}
      ${state.cache(DateTimeSelect, 'time').render(state.timeui)}
      ${state.cache(D3Force, 'd3force').render(state.d3, state.active)}
    </div>
  </body>`
}
