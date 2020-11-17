const choo = require('choo')
const app = choo()

app.use(require('choo-devtools')())
app.use(require('./store'))

app.route('/', require('./home'))
app.route('/*', require('./404'))

module.exports = app.mount('body')
