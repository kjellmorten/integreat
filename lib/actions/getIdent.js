const util = require('util')
const getField = require('../utils/getField')
const createError = require('../utils/createError')
const createUnknownServiceError = require('../utils/createUnknownServiceError')

const preparePropKeys = ({
  id = 'id',
  roles = 'roles',
  tokens = 'tokens'
} = {}) => ({
  id, roles, tokens
})

const prepareParams = (ident, keys) =>
  (ident.id) ? { [keys.id]: ident.id }
    : (ident.withToken) ? { [keys.tokens]: ident.withToken }
      : null

const wrapOk = (data, ident) => ({ status: 'ok', data, access: { status: 'granted', ident } })

const prepareResponse = (response, params, propKeys) => {
  const { data } = response

  if (data && data[0]) {
    const completeIdent = {
      id: getField(data[0], propKeys.id),
      roles: getField(data[0], propKeys.roles),
      tokens: getField(data[0], propKeys.tokens)
    }
    return wrapOk(data[0], completeIdent)
  } else {
    return createError(`Could not find ident with params ${util.inspect(params)}`, 'notfound')
  }
}

/**
* Get an ident item from service, based on the meta.ident object on the action.
* @param {Object} action - Action object
* @param {Object} resources - Object with getService and identOptions
* @returns {Object} Response object with ident item as data
 */
async function getIdent ({ payload, meta }, { getService, identOptions = {} }) {
  if (!meta.ident) {
    return createError('GET_IDENT: The request has no ident', 'noaction')
  }

  const { type } = identOptions
  if (!type) {
    return createError('GET_IDENT: Integreat is not set up with authentication', 'noaction')
  }

  const service = getService(type)
  if (!service) {
    return createUnknownServiceError(type, null, 'GET_IDENT')
  }

  const propKeys = preparePropKeys(identOptions.props)
  const params = prepareParams(meta.ident, propKeys)
  if (!params) {
    return createError('GET_IDENT: The request has no ident with id or withToken', 'noaction')
  }

  const { response } = await service.send({
    type: 'GET',
    payload: { type, ...params },
    meta: { ident: { root: true } }
  })

  return prepareResponse(response, payload, propKeys)
}

module.exports = getIdent
