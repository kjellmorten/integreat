require('dotenv').config()
const integreat = require('.')
const debug = require('debug')('great')

const lengthFormat = (value) => (value) ? value.length : 0

const sources = [
  require('./examples/accountsSource'),
  require('./examples/nytimesSource'),
  require('./examples/storeSource')
]
const types = [
  require('./examples/accountType'),
  require('./examples/articleType')
]
const adapters = integreat.adapters()
const auths = integreat.authStrats()
const transformers = {}
const filters = {}
const formatters = Object.assign(
  {length: lengthFormat},
  integreat.formatters()
)
const workers = integreat.workers()

const great = integreat({
  sources,
  types,
  adapters,
  auths,
  transformers,
  filters,
  formatters,
  workers
})
debug('Integreat v' + great.version)

module.exports = great
