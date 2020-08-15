import { Authenticator, AuthOptions, Authentication } from './types'
import { Exchange, Transporter } from '../types'
import { isObject } from '../utils/is'

const MAX_RETRIES = 1

const shouldRetry = (
  authentication: Authentication | null,
  retryCount: number
) => authentication?.status === 'timeout' && retryCount < MAX_RETRIES

export default class Auth {
  readonly id: string
  #authenticator: Authenticator
  #options: AuthOptions
  #authentication: Authentication | null

  constructor(
    id: string,
    authenticator?: Authenticator,
    options?: AuthOptions
  ) {
    if (!authenticator) {
      throw new TypeError('Auth requires an authenticator')
    }

    this.id = id
    this.#authenticator = authenticator
    this.#options = options || {}
    this.#authentication = null
  }

  async authenticate(): Promise<boolean> {
    if (
      this.#authentication?.status === 'granted' &&
      this.#authenticator.isAuthenticated(this.#authentication)
    ) {
      return true
    }

    let attempt = 0
    do {
      this.#authentication = await this.#authenticator.authenticate(
        this.#options
      )
    } while (shouldRetry(this.#authentication, attempt++))

    return this.#authentication?.status === 'granted'
  }

  applyToExchange(exchange: Exchange, transporter: Transporter): Exchange {
    const auth = this.#authentication
    if (!auth) {
      return { ...exchange, status: 'noaccess', auth: null }
    }

    if (auth.status === 'granted') {
      const authenticator = this.#authenticator
      const fn =
        isObject(authenticator?.authentication) &&
        authenticator.authentication[transporter.authentication]
      return { ...exchange, auth: typeof fn === 'function' ? fn(auth) : null }
    }

    const status = auth.status === 'refused' ? 'noaccess' : 'autherror'
    const error =
      auth.status === 'refused'
        ? `Authentication attempt for '${this.id}' was refused.`
        : `Could not authenticate '${this.id}'. [${auth.status}]`
    return {
      ...exchange,
      status,
      response: {
        ...exchange.response,
        error: [error, auth.error].filter(Boolean).join(' '),
      },
      auth: null,
    }
  }
}