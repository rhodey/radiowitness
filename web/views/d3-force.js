const html = require('choo/html')
const Comp = require('choo/component')
const d3   = require('d3')

class Graph extends Comp {
  constructor (id, state, emit) {
    super(id)
    this.local = state.components[id] = {
      nodes : [],
      links : [],
      active : -1
    }
  }

  sizeof (node) {
    if (node.group) {
      return Math.max(10, Math.floor(node.count * 25))
    } else if (!node.target) {
      return Math.max(5, Math.floor(node.count * 15))
    } else {
      return Math.max(0.5, Math.floor(node.count * 4))
    }
  }

  afterupdate (elem) {
    var margin = {top: 10, right: 30, bottom: 30, left: 40},
      width = 800 - margin.left - margin.right,
      height = 800 - margin.top - margin.bottom;

    let svg = d3.select(".chart")
      .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    this.local.svg = svg

    let node = svg
      .selectAll("circle")
      .data(this.local.nodes)
      .enter()
      .append("circle")
        .attr("id", (d) => d.id)
        .attr("r", this.sizeof)

    let link = svg
      .selectAll("line")
      .data(this.local.links)
      .enter()
      .append("line")
        .attr("stroke", "#000")
        .attr("stroke-width", this.sizeof)

    this.local.simulation = d3.forceSimulation(this.local.nodes)
      .force("link", d3.forceLink().links(this.local.links).id((d) => d.id))
      .force("charge", d3.forceManyBody())
      .force("x", d3.forceX())
      .force("y", d3.forceY())
      .force("center", d3.forceCenter(width / 2, height / 2))
      .on("tick", () => {
        link
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y)

        node
          .attr("cx", (d) => d.x)
          .attr("cy", (d) => d.y)
      })
    this.colorize()
  }

  colorize () {
    this.local.svg.selectAll("circle")
      .attr("fill", (d) => d.group ? "orange" : "blue")
      .filter((d) => d.id === this.local.active)
      .attr("fill", "red")
  }

  update (data, active) {
    if (this.local.nodes.length !== data.nodes.length ||
        this.local.links.length !== data.links.length) {
      return true
    } else if (this.local.active != active) {
      this.local.active = active
      this.colorize()
    }
    return false
  }

  createElement (data, active) {
    if (this.local.simulation) { this.local.simulation.stop() }
    this.local.nodes = data.nodes.map(Object.create)
    this.local.links = data.links.map(Object.create)
    this.local.active = active
    return html`<div class="chart"></div>`
  }

  unload (elem) {
    console.log('!!! unload()', elem)
  }
}

module.exports = Graph
