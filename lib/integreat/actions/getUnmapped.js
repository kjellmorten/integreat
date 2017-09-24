const debug = require('debug')('great')

/**
 * Get several items from a source, based on the given action object.
 * The items will be normalized, but not mapped. Any `path` on the endpoint
 * will be followed, though.
 * @param {Object} payload - Payload from action object
 * @param {Object} resources - Object with getSource
 * @returns {array} Array of data from the source
 */
async function getUnmapped (payload, {getSource} = {}) {
  debug('Action: GET_UNMAPPED')
  if (!payload) {
    debug('GET_UNMAPPED: No payload')
    return {status: 'error', error: 'No payload'}
  }

  const {
    source: sourceId,
    endpoint = 'get',
    params = {}
  } = payload
  const source = (typeof getSource === 'function') ? getSource(null, sourceId) : null

  if (!source) {
    debug('GET_UNMAPPED: No source')
    return {status: 'error', error: 'No source'}
  }

  debug('GET_UNMAPPED: Fetch from source %s at endpoint \'%s\'', source.id, endpoint)
  return await source.retrieveNormalized({
    endpoint,
    params: Object.assign({}, payload, params)
  })
}

module.exports = getUnmapped