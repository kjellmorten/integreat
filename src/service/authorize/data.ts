import getField from '../../utils/getField'
import { arrayIncludes } from '../../utils/array'
import { isTypedData, isNullOrUndefined } from '../../utils/is'
import { Exchange, TypedData, Ident } from '../../types'
import { Schema } from '../../schema'

export interface AuthorizeDataFn {
  (exchange: Exchange, allowRaw?: boolean): Exchange
}

const isStringOrArray = (value: unknown): value is string | string[] =>
  typeof value === 'string' || Array.isArray(value)

function getValueAndCompare(
  item: TypedData,
  fieldPath: string,
  compareValue?: string | string[]
) {
  const values = getField(item, fieldPath)
  return isStringOrArray(values) && arrayIncludes(compareValue, values)
}

const authorizeItem = (
  schemas: Record<string, Schema>,
  actionType: string,
  allowRaw: boolean,
  ident?: Ident
) => (item: unknown): string | undefined => {
  if (!isTypedData(item)) {
    return allowRaw ? undefined : 'RAW_DATA'
  }
  const schema = schemas[item.$type]
  if (!schema) {
    return 'NO_SCHEMA'
  }
  const { identFromField, roleFromField } = schema.accessForAction(actionType)
  const validateIdent = typeof identFromField === 'string'
  const validateRole = typeof roleFromField === 'string'

  // Authorize when neither ident nor role should be validated
  if (!validateIdent && !validateRole) {
    return undefined
  }

  // Get validation results for the required methods
  const identResult =
    !validateIdent ||
    getValueAndCompare(item, identFromField as string, ident?.id)
  const roleResult =
    !validateRole ||
    getValueAndCompare(item, roleFromField as string, ident?.roles)

  // Authorize if either ident or role validation passes
  if (validateIdent && validateRole && (identResult || roleResult)) {
    return undefined
  }
  // We are supposed to validate by only one of the methods - do it
  return (
    (!identResult && 'WRONG_IDENT') ||
    (!roleResult && 'MISSING_ROLE') ||
    undefined
  )
}

const generateWarning = (removedCount: number, isToService: boolean) =>
  removedCount > 0
    ? `${removedCount} item${
        removedCount === 1 ? ' was' : 's were'
      } removed from ${
        isToService ? 'request' : 'response'
      } data due to lack of access`
    : undefined

const generateErrorAndReason = (
  reason: string,
  data: unknown,
  isToService: boolean
) =>
  reason === 'RAW_DATA'
    ? `Authentication was refused for raw ${
        isToService ? 'request' : 'response'
      } data`
    : `Authentication was refused for type '${(data as TypedData).$type}'`

function getAuthedWithResponse(
  data: unknown,
  authFn: (item: unknown) => string | undefined,
  isToService: boolean
) {
  if (isNullOrUndefined(data)) {
    return { data }
  } else if (Array.isArray(data)) {
    const authed = data.filter((data: unknown) => authFn(data) === undefined)
    const warning = generateWarning(data.length - authed.length, isToService)
    return { data: authed, ...(warning && { warning }) }
  }

  const reason = authFn(data)
  if (typeof reason === 'string') {
    const error = generateErrorAndReason(reason, data, isToService)
    return {
      data: undefined,
      status: 'noaccess',
      error,
      reason,
    }
  } else {
    return { data }
  }
}

const isError = (status?: string | null) =>
  typeof status === 'string' && status !== 'ok'

const authorizeDataBase = (
  schemas: Record<string, Schema>,
  isToService: boolean
) =>
  function authorizeData(exchange: Exchange, allowRaw = false): Exchange {
    if (exchange.ident?.root) {
      return exchange
    }

    const { type: actionType, ident } = exchange
    const { data, status, error, reason, ...response } = getAuthedWithResponse(
      isToService ? exchange.request.data : exchange.response.data,
      authorizeItem(schemas, actionType, allowRaw, ident),
      isToService
    )

    return {
      ...exchange,
      ...(!isError(exchange.status) && status && { status }),
      request: {
        ...exchange.request,
        ...(isToService && { data }),
      },
      response: {
        ...exchange.response,
        ...(!isToService && { data }),
        ...(!exchange.response.error && error && { error }),
        ...(!exchange.response.error && reason && { reason }),
        ...response,
      },
    }
  }

export const fromService = (schemas: Record<string, Schema>): AuthorizeDataFn =>
  authorizeDataBase(schemas, false)

export const toService = (schemas: Record<string, Schema>): AuthorizeDataFn =>
  authorizeDataBase(schemas, true)