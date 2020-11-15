const moment = require('moment')
const conf = require('../dat.json')


function store (state, emitter) {
  let offset = parseInt(conf.utcOffset)
  state.time = moment().utcOffset(offset).subtract(1, 'hours')
  state.timeui = state.time

  emitter.on('time:ui', (time) => {
    state.timeui = time
    emitter.emit(state.events.RENDER)
  })

  emitter.on('time:select', (time) => {
    state.time = time
    emitter.emit(state.events.RENDER)
  })

  // kick off first graph render
  emitter.on('dat:ready-db', () => {
    emitter.emit('time:select', state.time)
  })
}

module.exports = store
