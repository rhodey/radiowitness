const d3    = require('d3')
const codec = require('codecs')('json')

function store (state, emitter) {
  state.active = state.activeidx = state.callcount = -1
  state.reading = undefined
  state.calls = []
  state.d3 = {
    nodes : [],
    links : []
  }

  emitter.on('graph:next', () => {
    state.activeidx += 1
    state.active = state.calls[state.activeidx].source
    setTimeout(() => emitter.emit('graph:next'), 1250)
  })

  const mapCounts = (counts) => Object.keys(counts).map((key) => { return { id: parseInt(key), count: counts[key]}})
  const mapGroupCounts = (groups) => mapCounts(groups).map((g) => { g.group = true; return g })

  function relative (counts) {
    let max = Math.max.apply(null, counts.map((c) => c.count))
    return counts.map((c) => { c.count = c.count/max; return c })
  }

  emitter.on('time:select', (time) => {
    if (state.reading) { state.reading.destroy() }

    let groups = {}
    let radios = {}
    let links = {}
    let count = 0
    let hour = Math.floor(time.valueOf() / 1000.0 / 60 / 60)
    state.reading = state.db.createReadStream(`/calls/${hour - 1}/`, { gt : true })
    state.callcount = state.active = state.activeidx = -1
    state.calls = []

    state.reading.on('data', (data) => {
      let call = codec.decode(data[0].value)
      groups[call.group] = groups[call.group] ? groups[call.group] + 1 : 1
      radios[call.source] = radios[call.source] ? radios[call.source] + 1 : 1

      let key = call.source + '-' + call.group
      if (!links[key]) {
        links[key] = { source: call.source, target: call.group, count: 1 }
      } else {
        links[key].count += 1
      }

      if (state.callcount++ % 50 === 0) {
        let nodes = relative(mapGroupCounts(groups)).concat(relative(mapCounts(radios)))
        state.d3.nodes = nodes.map(Object.create)
        state.d3.links = relative(Object.keys(links).map((k) => links[k]))
        emitter.emit(state.events.RENDER)
      }

      state.calls.push(call)
      emitter.emit(state.events.RENDER)
    })

    state.reading.on('end', () => {
      let nodes = relative(mapGroupCounts(groups)).concat(relative(mapCounts(radios)))
      state.d3.nodes = nodes
      state.d3.links = relative(Object.keys(links).map((k) => links[k]))
      state.callcount = -1
      state.reading = undefined
      emitter.emit(state.events.RENDER)
      emitter.emit('graph:next')
    })
  })
}

module.exports = store
