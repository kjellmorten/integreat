import debugLib = require('debug')
import pPipe = require('p-pipe')
import createError from '../utils/createError'
import createUnknownServiceError from '../utils/createUnknownServiceError'
import {
  exchangeFromAction,
  responseFromExchange
} from '../utils/exchangeMapping'
import { Action, Exchange, ExchangeRequest, Dispatch, Data } from '../types'
import { GetService } from '../dispatch'

const debug = debugLib('great')

const prepareData = ({ type, id, data }: ExchangeRequest) =>
  type && id
    ? // Delete one action -- return as data
      [{ id, $type: type }]
    : // Filter away null values
      ([] as Data[]).concat(data).filter(Boolean)

const setDataOnExchange = (exchange: Exchange, data?: Data | Data[]) => ({
  ...exchange,
  request: { ...exchange.request, data }
})

/**
 * Delete several items from a service, based on the given payload.
 */
export default async function deleteFn(
  obsoleteAction: Action,
  _dispatch: Dispatch,
  getService: GetService
) {
  const exchange = exchangeFromAction(obsoleteAction)
  const {
    request: { type, id, service: serviceId },
    endpoint
  } = exchange

  const service =
    typeof getService === 'function' ? getService(type, serviceId) : null
  if (!service) {
    return createUnknownServiceError(type, serviceId, 'DELETE')
  }

  const data = prepareData(exchange.request)
  if (data.length === 0) {
    return createError(
      `No items to delete from service '${service.id}'`,
      'noaction'
    )
  }

  const endpointDebug = endpoint
    ? `endpoint '${endpoint}'`
    : `endpoint matching ${type} and ${id}`
  debug("DELETE: Delete from service '%s' at %s.", service.id, endpointDebug)

  const nextExchange = await pPipe<
    Exchange,
    Exchange,
    Exchange,
    Exchange,
    Exchange,
    Exchange
  >(
    service.authorizeExchange,
    service.assignEndpointMapper,
    service.mapToService,
    service.sendExchange,
    service.mapFromService
  )(setDataOnExchange(exchange, data))

  return responseFromExchange(nextExchange)
  // return response.status === 'ok' ? { status: 'ok' } : response
}
