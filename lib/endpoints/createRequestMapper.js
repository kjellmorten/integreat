const { mapTransform, set } = require('map-transform')
const { normalizeMappingWithSwitchedTransforms } = require('../mapping/normalize')

function createRequestMapper ({ requestMapping }, { transformers } = {}) {
  if (!requestMapping) {
    return null
  }
  return (typeof requestMapping === 'string')
    ? mapTransform(['data', set(requestMapping)])
    : mapTransform(normalizeMappingWithSwitchedTransforms(requestMapping, transformers))
}

module.exports = createRequestMapper
