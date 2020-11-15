const html = require('choo/html')
const comp = require('choo/component')
const p5   = require('p5')

const TITLE = 'animation thing'
module.exports = view

class Idk extends comp {
  constructor (id, state) {
    super(id)
    this.processing = this.processing.bind(this)
    this.local = state.components[id] = {
      x : 0,
      y : 120
    }
  }

  processing (p) {
    function setup() {
      p.createCanvas(700, 410)
    }

    function draw() {
      p.background(0)
      p.fill(255)
      p.rect(this.x, this.y, 50, 50)
    }

    p.setup = setup.bind(this.local)
    p.draw = draw.bind(this.local)
  }

  createElement (posx) {
    this.local.x = posx
    return html`<div id="hiii"></div>`
  }

  load (elem) {
    console.log('!!! load()')
    this.local.p5 = new p5(this.processing, elem)
  }

  update (posx) {
    if (posx !== this.local.x) {
      this.local.x = posx
    }
    return false
  }

  unload (elem) {
    console.log('!!! unload()', elem)
  }
}

function view (state, emit) {
  if (state.title !== TITLE) {
    emit(state.events.DOMTITLECHANGE, TITLE)
    setInterval(() => {
      emit('anime:idk', state.idk + 10)
    }, 500)
  }

  return html`<body>
    <h2>anime</h2>
    ${state.cache(Idk, 'idk00').render(state.idk)}
  </body>`
}
