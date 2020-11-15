const html = require('choo/html')
const Comp = require('choo/component')
const moment = require('moment')
const conf = require('../dat.json')

const months = {
  january: 31,
  february: 28,
  march: 31,
  april: 30,
  may: 31,
  june: 30,
  july: 31,
  august: 31,
  september: 30,
  october: 31,
  november: 30,
  december: 31
}

const offset = parseInt(conf.utcOffset)

class DateTimeSelect extends Comp {
  constructor (id, state, emit) {
    super(id)
    this.emit = emit
    this.select = this.select.bind(this)
    this.changeMonth = this.changeMonth.bind(this)
    this.local = state.components[id] = {
      time : undefined
    }
  }

  select () {
    let month = document.getElementById('select_month').value
    let day = document.getElementById('select_day').value
    let hour = document.getElementById('select_hour').value

    let time = moment().utcOffset(offset)
      .month(month).date(day).hour(hour)
      .minutes(0).seconds(0).milliseconds(0)

    console.log('selected ->', hour, time.toString())
    this.emit('time:select', time)
  }

  changeMonth () {
    let month = document.getElementById('select_month').value
    let time = moment().utcOffset(offset)
      .month(month).date(1).hour(0)
      .minutes(0).seconds(0).milliseconds(0)
    this.emit('time:ui', time)
  }

  update (time) {
    return !time.isSame(this.local.time)
  }

  createElement (time) {
    this.local.time = time

    let selectedMonth = time.month()
    let optionsMonth = Object.keys(months).map((month, idx) => {
      let capitalized = month.charAt(0).toUpperCase() + month.slice(1)
      return selectedMonth === idx ? html`<option value=${idx} selected="selected">${capitalized}</option>` :
        html`<option value=${idx}>${capitalized}</option>`
    })

    let selectedDay = time.date()
    let optionsDay = []
    let days = months[Object.keys(months)[selectedMonth]]
    for (var i = 1; i <= days; i++) {
      if (i === selectedDay) {
        optionsDay.push(html`<option value=${i} selected="selected">${i}</option>`)
      } else {
        optionsDay.push(html`<option value=${i}>${i}</option>`)
      }
    }

    let selectedHour = time.hour()
    let optionsHour = []
    for (var i = 0; i < 24; i++) {
      let hour = i
      if (hour === 0) {
        hour = 12
      } else if (hour > 12) {
        hour = hour - 12
      }

      let postfix = i < 12 ? "AM" : "PM"
      if (i === selectedHour) {
        optionsHour.push(html`<option value=${i} selected="selected">${hour+postfix}</option>`)
      } else {
        optionsHour.push(html`<option value=${i}>${hour+postfix}</option>`)
      }
    }

    return html`
      <div>
        <select id="select_month" onchange=${this.changeMonth}>
          ${optionsMonth}
        </select>
        <select id="select_day">
          ${optionsDay}
        </select>
        <select id="select_hour">
          ${optionsHour}
        </select>
        <button onclick=${this.select}>GO!</button>
      </div>
    `
  }
}

module.exports = DateTimeSelect
