const css  = require('sheetify')
const choo = require('choo')

css('./assets/style.css')

const app = choo()

app.use(require('choo-devtools')())
if (process.env.NODE_ENV === 'production') {
  app.use(require('choo-service-worker')())
}

app.use(require('./stores/store'))
app.use(require('./stores/store-dat'))
app.use(require('./stores/store-graph'))
//app.use(require('./stores/store-studio'))

app.route('/', require('./views/main'))
app.route('/studio', require('./views/studio'))
app.route('/*', require('./views/404'))

module.exports = app.mount('body')
