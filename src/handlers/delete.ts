import debugLib = require('debug')
import pPipe = require('p-pipe')
import createError from '../utils/createError'
import createUnknownServiceError from '../utils/createUnknownServiceError'
import { Action, Payload, InternalDispatch } from '../types'
import { GetService } from '../dispatch'

const debug = debugLib('great')

const prepareData = ({ type, id, data }: Payload) =>
  type && id
    ? // Delete one action -- return as data
      [{ id, $type: type }]
    : // Filter away null values
      ([] as unknown[]).concat(data).filter(Boolean)

const setDataOnAction = (action: Action, data?: unknown) => ({
  ...action,
  payload: { ...action.payload, data, sendNoDefaults: true },
})

/**
 * Delete several items from a service, based on the given payload.
 */
export default async function deleteFn(
  action: Action,
  _dispatch: InternalDispatch,
  getService: GetService
): Promise<Action> {
  const {
    type,
    id,
    targetService: serviceId,
    endpoint: endpointId,
  } = action.payload

  const service =
    typeof getService === 'function' ? getService(type, serviceId) : null
  if (!service) {
    return createUnknownServiceError(action, type, serviceId, 'DELETE')
  }

  const data = prepareData(action.payload)
  if (data.length === 0) {
    return createError(
      action,
      `No items to delete from service '${service.id}'`,
      'noaction'
    )
  }

  const endpointDebug = endpointId
    ? `endpoint '${endpointId}'`
    : `endpoint matching ${type} and ${id}`
  debug("DELETE: Delete from service '%s' at %s.", service.id, endpointDebug)

  const nextAction = setDataOnAction(action, data)
  const endpoint = service.endpointFromAction(nextAction)
  if (!endpoint) {
    return createError(
      nextAction,
      `No endpoint matching ${nextAction.type} request to service '${serviceId}'.`,
      'noaction'
    )
  }

  return pPipe(
    service.authorizeAction,
    (action: Action) => service.mapRequest(action, endpoint),
    service.send,
    (action: Action) => service.mapResponse(action, endpoint)
  )(nextAction)
}