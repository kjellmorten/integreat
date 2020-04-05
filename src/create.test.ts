import test from 'ava'
import sinon = require('sinon')
import jsonAdapter from 'integreat-adapter-json'
import { Action, Dispatch, Data } from './types'

import create from './create'

// Setup

const json = jsonAdapter()

const services = [
  {
    id: 'entries',
    adapter: 'json',
    mappings: { entry: 'entries_entry' },
    endpoints: [{ options: { uri: 'http://some.api/entries' } }]
  }
]

const schemas = [
  {
    id: 'entry',
    service: 'entries',
    shape: {
      title: 'string',
      text: 'string',
      sections: 'string[]',
      author: 'user'
    },
    access: 'all'
  },
  {
    id: 'article',
    shape: {
      title: 'string'
    },
    access: 'all'
  }
]

const mappings = [
  {
    id: 'entries_entry',
    schema: 'entry',
    mapping: [
      {
        $iterate: true,
        id: 'key',
        title: ['headline', { $transform: 'exclamate' }],
        text: 'body',
        'sections[]': ['type', { $transform: 'map', dictionary: 'section' }],
        unknown: [],
        author: 'creator',
        createdAt: 'date'
      },
      { $apply: 'cast_entry' }
    ]
  }
]

const dictionaries = {
  section: [['newsitem', 'news'] as const, ['fashionblog', 'fashion'] as const]
}

const transformers = {
  exclamate: () => (value: Data) =>
    typeof value === 'string' ? `${value}!` : value
}

const adapters = {
  json
}

// Tests

test('should return object with dispatch, schemas, services, and identType', t => {
  const identConfig = { type: 'account' }
  const great = create({ services, schemas, identConfig }, { adapters })

  t.is(typeof great.dispatch, 'function')
  t.truthy(great.schemas)
  t.truthy(great.schemas.entry)
  t.truthy(great.services)
  t.truthy(great.services.entries)
  t.is(great.identType, 'account')
})

test('should throw when no services', t => {
  t.throws(() => {
    create({ schemas } as any, { adapters })
  })
})

test('should throw when no schemas', t => {
  t.throws(() => {
    create({ services } as any, { adapters })
  })
})

test('should dispatch with resources', async t => {
  const action = { type: 'TEST', payload: {} }
  const actionHandler = sinon.stub().resolves({ status: 'ok' })
  const actionHandlers = { TEST: actionHandler }
  const identConfig = { type: 'account' }

  const great = create(
    { services, schemas, mappings, identConfig },
    { actionHandlers, adapters }
  )
  await great.dispatch(action)

  t.is(actionHandler.callCount, 1) // If the action handler was called, the action was dispatched
  t.deepEqual(actionHandler.args[0][3], identConfig)
})

test('should dispatch with builtin actionHandler', async t => {
  const send = sinon.stub().resolves({ status: 'ok', data: '[]' })
  const adapters = { json: { ...json, send } }
  const action = { type: 'GET', payload: { type: 'entry' } }

  const great = create({ services, schemas, mappings }, { adapters })
  await great.dispatch(action)

  t.is(send.callCount, 1) // If the send method was called, the GET action was dispatched
})

test('should call middleware', async t => {
  const action = { type: 'TEST', payload: {} }
  const otherAction = sinon.stub().resolves({ status: 'ok' })
  const actionHandlers = { OTHER: otherAction }
  const middlewares = [
    (next: Dispatch) => async (_action: Action) =>
      next({ type: 'OTHER', payload: {} })
  ]

  const great = create(
    { services, schemas, mappings },
    { actionHandlers, adapters },
    middlewares
  )
  await great.dispatch(action)

  t.is(otherAction.callCount, 1) // If other action handler was called, middleware changed action
})

test('should map data', async t => {
  const data0 = {
    key: 'ent1',
    headline: 'Entry 1',
    body: 'The first article',
    type: 'newsitem',
    date: '2019-10-11T18:43:00Z'
  }
  const adapters = {
    json: {
      ...json,
      send: async () => ({ status: 'ok', data: JSON.stringify([data0]) })
    }
  }
  const action = {
    type: 'GET',
    payload: { id: 'ent1', type: 'entry' },
    meta: { ident: { id: 'johnf' } }
  }

  const great = create(
    { services, schemas, mappings, dictionaries },
    { adapters, transformers }
  )
  const ret = await great.dispatch(action)

  t.is(ret.status, 'ok', ret.error)
  t.is(ret.data.length, 1)
  const item = ret.data[0]
  t.is(item.id, 'ent1')
  t.is(item.title, 'Entry 1!')
  t.is(item.text, 'The first article')
  t.deepEqual(item.sections, ['news'])
  t.deepEqual(item.createdAt, new Date('2019-10-11T18:43:00Z'))
})

test.failing('should use auth', async t => {
  const adapters = {
    json: {
      ...json,
      send: async () => ({ status: 'ok', data: '[]' })
    }
  }
  const authServices = [
    {
      ...services[0],
      auth: 'mauth'
    }
  ]
  const auths = [
    {
      id: 'mauth',
      authenticator: 'mock',
      options: { status: 'refused' }
    }
  ]
  const authenticators = {
    mock: {
      authenticate: async ({ status }) => ({ status }),
      isAuthenticated: () => false
    }
  }
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: { ident: { id: 'johnf' } }
  }

  const great = create(
    { services: authServices, schemas, mappings, auths },
    { adapters, authenticators }
  )
  const ret = await great.dispatch(action)

  t.is(ret.status, 'noaccess', ret.error)
})

test.skip('should subscribe to event on service', t => {
  const great = create({ services, schemas, mappings }, { adapters })
  const cb = () => {}
  const onStub = sinon.stub(great.services.entries, 'on')

  great.on('mapToService', 'entries', cb)

  t.is(onStub.callCount, 1)
  t.is(onStub.args[0][0], 'mapToService')
  t.is(onStub.args[0][1], cb)
})

test.skip('should not subscribe to anything for unknown service', t => {
  const great = create({ services, schemas, mappings }, { adapters })

  t.notThrows(() => {
    great.on('mapToService', 'unknown', () => {})
  })
})