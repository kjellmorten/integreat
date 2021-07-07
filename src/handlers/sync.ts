import pLimit = require('p-limit')
import { Action, InternalDispatch, Meta, TypedData } from '../types'
import createError from '../utils/createError'
import { isTypedData, isNotNullOrUndefined } from '../utils/is'
import { ensureArray } from '../utils/array'

interface ActionParams extends Record<string, unknown> {
  type: string | string[]
  service?: string
  action?: string
  updatedAfter?: Date
  updatedUntil?: Date
}

interface SyncParams extends Record<string, unknown> {
  from?: string | Partial<ActionParams> | (string | Partial<ActionParams>)[]
  to?: string | Partial<ActionParams>
  updatedAfter?: Date
  updatedUntil?: Date
  dontQueueSet?: boolean
  retrieve?: 'all' | 'updated'
  metaKey?: string
  setLastSyncedAtFromData?: boolean
}

interface MetaData {
  meta: {
    lastSyncedAt?: Date
  }
}

const createGetMetaAction = (
  targetService: string,
  type?: string | string[],
  metaKey?: string,
  meta?: Meta
) => ({
  type: 'GET_META',
  payload: { type, params: { keys: 'lastSyncedAt', metaKey }, targetService },
  meta,
})

const createSetMetaAction = (
  lastSyncedAt: Date,
  targetService: string,
  type?: string | string[],
  metaKey?: string,
  meta?: Meta
) => ({
  type: 'SET_META',
  payload: { type, params: { meta: { lastSyncedAt }, metaKey }, targetService },
  meta,
})

const createGetAction = (
  { type, service: targetService, action = 'GET', ...params }: ActionParams,
  meta?: Meta
) => ({
  type: action,
  payload: { type, params, targetService },
  meta,
})

const createSetAction = (
  data: unknown,
  {
    type,
    service: targetService,
    action = 'SET',
    dontQueueSet = false,
    ...params
  }: ActionParams,
  meta?: Meta
) => ({
  type: action,
  payload: { type, data, params, targetService },
  meta: { ...meta, queue: !dontQueueSet },
})

const setUpdatedDatesAndType = (
  dispatch: InternalDispatch,
  type: string | string[],
  syncParams: SyncParams,
  meta?: Meta
) =>
  async function setUpdatedDatesAndType(params: Partial<ActionParams>) {
    const { retrieve, updatedAfter, updatedUntil, metaKey } = syncParams

    // Fetch lastSyncedAt from meta when needed, and use as updatedAfter
    if (retrieve === 'updated' && params.service && !updatedAfter) {
      const metaResponse = await dispatch(
        createGetMetaAction(params.service, type, metaKey, meta)
      )
      params.updatedAfter = (
        metaResponse.response?.data as MetaData | undefined
      )?.meta.lastSyncedAt
    }

    // Create from params from dates, type, and params
    return {
      ...(updatedAfter && { updatedAfter }),
      ...(updatedUntil && { updatedUntil }),
      type,
      ...params,
    }
  }

const setMetaFromParams = (
  dispatch: InternalDispatch,
  { payload: { type, params: { metaKey } = {} }, meta }: Action,
  datesFromData: (Date | undefined)[]
) =>
  async function setMetaFromParams(
    { service, updatedUntil }: ActionParams,
    index: number
  ) {
    if (service) {
      return dispatch(
        createSetMetaAction(
          // eslint-disable-next-line security/detect-object-injection
          datesFromData[index] || updatedUntil || new Date(),
          service,
          type,
          metaKey as string | undefined,
          meta
        )
      )
    }
    return { status: 'noaction' }
  }

const paramsAsObject = (params?: string | Partial<ActionParams>) =>
  typeof params === 'string' ? { service: params } : params

const generateFromParams = async (
  dispatch: InternalDispatch,
  type: string | string[],
  { payload: { params = {} }, meta }: Action
) =>
  Promise.all(
    ensureArray((params as SyncParams).from)
      .map(paramsAsObject)
      .filter(isNotNullOrUndefined)
      .map(setUpdatedDatesAndType(dispatch, type, params, meta))
      .map((p) => pLimit(1)(() => p)) // Run one promise at a time
  )

function generateToParams(
  fromParams: ActionParams[],
  type: string | string[],
  { payload: { params = {} } }: Action
): ActionParams {
  const { to, updatedUntil, dontQueueSet }: SyncParams = params
  const oldestUpdatedAfter = fromParams
    .map((params) => params.updatedAfter)
    .sort()[0]
  return {
    type,
    dontQueueSet,
    ...(oldestUpdatedAfter ? { updatedAfter: oldestUpdatedAfter } : {}),
    ...(updatedUntil ? { updatedUntil } : {}),
    ...paramsAsObject(to),
  }
}

async function extractActionParams(
  action: Action,
  dispatch: InternalDispatch
): Promise<[ActionParams[], ActionParams | undefined]> {
  const { type } = action.payload
  // Require a type
  if (!type) {
    return [[], undefined]
  }

  // Make from an array of params objects and fetch updatedAfter from meta
  // when needed
  const fromParams = await generateFromParams(dispatch, type, action)

  return [fromParams, generateToParams(fromParams, type, action)]
}

function sortByUpdatedAt(
  { updatedAt: a }: TypedData,
  { updatedAt: b }: TypedData
) {
  const dateA = a ? new Date(a).getTime() : undefined
  const dateB = b ? new Date(b).getTime() : undefined
  return dateA && dateB ? dateA - dateB : dateA ? -1 : 1
}

const withinDateRange =
  (updatedAfter?: Date, updatedUntil?: Date) => (data: TypedData) =>
    (!updatedAfter || (!!data.updatedAt && data.updatedAt > updatedAfter)) &&
    (!updatedUntil || (!!data.updatedAt && data.updatedAt <= updatedUntil))

async function retrieveDataFromOneService(
  dispatch: InternalDispatch,
  params: ActionParams,
  meta?: Meta
) {
  const { updatedAfter, updatedUntil } = params

  // Fetch data from service
  const responseAction = await dispatch(createGetAction(params, meta))

  // Throw is not successfull
  if (responseAction.response?.status !== 'ok') {
    throw new Error(responseAction.response?.error)
  }

  // Return array of data filtered with updatedAt within date range
  const data = ensureArray(responseAction.response.data).filter(isTypedData)

  return updatedAfter || updatedUntil
    ? data.filter(withinDateRange(updatedAfter, updatedUntil))
    : data
}

const prepareInputParams = (action: Action) => ({
  ...action,
  payload: {
    ...action.payload,
    params: {
      ...action.payload.params,
      updatedUntil:
        action.payload.params?.updatedUntil === 'now'
          ? new Date()
          : action.payload.params?.updatedUntil,
      retrieve: action.payload.params?.retrieve ?? 'all',
    } as SyncParams,
  },
})

const extractUpdatedAt = (item?: TypedData) =>
  (item?.updatedAt && new Date(item?.updatedAt)) || undefined

const fetchDataFromService = (
  fromParams: ActionParams[],
  dispatch: InternalDispatch,
  { meta }: Action
) =>
  Promise.all(
    fromParams.map((params) =>
      retrieveDataFromOneService(dispatch, params, meta)
    )
  )

const extractLastSyncedAtDates = (dataFromServices: TypedData[][]) =>
  dataFromServices.map((data) =>
    data
      .map(extractUpdatedAt)
      .reduce(
        (lastDate, date) =>
          !lastDate || (date && date > lastDate) ? date : lastDate,
        undefined
      )
  )

/**
 * Handler for SYNC action, to sync data from one service to another.
 *
 * `retrieve` indicates which items to retrieve. The default is `all`, which
 * will retrieve all items from the `get` endpoint(s). Set `retrieve` to
 * `updated` to retrieve only items that are updated after the  `lastSyncedAt`
 * date for the `from` service(s). This is done by passing the `lastSyncedAt`
 * date as a parameter named `updatedAfter` to the `get` endpoint(s), and by
 * filtering away any items received with `updatedAt` earlier than
 * `lastSyncedAt`.
 *
 * The `lastSyncedAt` metadata will be set on the `from` service when items
 * are retrieved and updated. By default it will be set to the updatedUntil date
 * or now if no updatedUntil is given. When `setLastSyncedAtFromData` is true,
 * the latest updatedAt from the data will be used for each service.
 */
export default async function syncHandler(
  inputAction: Action,
  dispatch: InternalDispatch
): Promise<Action> {
  const action = prepareInputParams(inputAction)
  const {
    payload: {
      params: { retrieve, setLastSyncedAtFromData = false },
    },
    meta,
  } = action
  const [fromParams, toParams] = await extractActionParams(action, dispatch)
  const { alwaysSet = false } = action.payload.params ?? {}

  if (fromParams.length === 0 || !toParams) {
    return createError(
      action,
      'SYNC: `type`, `to`, and `from` parameters are required',
      'badrequest'
    )
  }

  let data: TypedData[]
  let datesFromData: (Date | undefined)[] = []
  try {
    const dataFromServices = await fetchDataFromService(
      fromParams,
      dispatch,
      action
    )
    data = dataFromServices.flat().sort(sortByUpdatedAt)
    if (setLastSyncedAtFromData) {
      datesFromData = extractLastSyncedAtDates(dataFromServices)
    }
  } catch (error) {
    return createError(action, `SYNC: Could not get data. ${error.message}`)
  }

  if (!alwaysSet && data.length === 0) {
    return createError(action, 'SYNC: No data to set', 'noaction')
  }

  const responseAction = await dispatch(createSetAction(data, toParams, meta))
  if (
    responseAction.response?.status !== 'ok' &&
    responseAction.response?.status !== 'queued'
  ) {
    return createError(
      action,
      `SYNC: Could not set data. ${responseAction.response?.error}`
    )
  }

  if (retrieve === 'updated') {
    await Promise.all(
      fromParams.map(setMetaFromParams(dispatch, action, datesFromData))
    )
  }

  return { ...action, response: { ...action.response, status: 'ok' } }
}