import test from 'ava'
import sinon from 'sinon'
import createSchema from '../schema'
import createMapping from '../mapping'

import { send } from './send'

// Setup

const schemas = {
  entry: createSchema({
    id: 'entry',
    plural: 'entries',
    attributes: {
      title: 'string',
      one: { type: 'integer', default: 1 },
      two: 'integer'
    },
    relationships: {
      service: 'service'
    },
    access: 'auth'
  }),
  account: createSchema({
    id: 'account',
    attributes: {
      name: 'string'
    },
    access: {
      identFromField: 'id',
      actions: {
        TEST: 'all'
      }
    }
  })
}

const setupMapping = createMapping({ schemas })

const mappings = {
  entry: setupMapping({
    type: 'entry',
    path: 'items[]',
    attributes: {
      id: 'key',
      title: 'header',
      one: 'one',
      two: 'two'
    },
    relationships: {
      service: '$params.service'
    }
  }),
  account: setupMapping({
    type: 'account',
    attributes: { id: 'id', name: 'name', type: 'type' }
  })
}

const endpointOptions = { uri: ['http://some.api/1.0'] }

const createAdapter = (overrides = {}) => ({
  authentication: 'asHttpHeaders',
  connect: async (options, auth, connection) => connection,
  serialize: async (request) => request,
  send: async () => ({ status: 'ok', data: [] }),
  normalize: async (response, request) => response,
  disconnect: (connection) => {},
  ...overrides
})

// Tests

test('send should authenticate request', async (t) => {
  const adapter = createAdapter()
  const authenticator = {
    authenticate: async ({ token }) => ({
      status: 'granted',
      headers: { Authorization: token }
    }),
    isAuthenticated: (authentication) => false,
    asHttpHeaders: ({ headers }) => headers
  }
  const authOptions = { token: 't0k3n' }
  const request = {
    action: 'SET',
    params: {
      type: 'account'
    },
    data: [
      { id: 'johnf', type: 'account' },
      { id: 'betty', type: 'account' }
    ],
    endpoint: endpointOptions,
    access: {
      ident: { id: 'johnf' }
    },
    meta: {
      typePlural: 'accounts'
    }
  }
  const expectedRequest = {
    action: 'SET',
    params: {
      type: 'account'
    },
    data: [{ id: 'johnf', type: 'account' }],
    endpoint: endpointOptions,
    access: {
      status: 'partially',
      scheme: 'data',
      ident: { id: 'johnf' }
    },
    auth: { Authorization: 't0k3n' },
    meta: {
      typePlural: 'accounts'
    }
  }

  const ret = await send({
    schemas, adapter, authenticator, authOptions
  })({ request, mappings })

  t.deepEqual(ret.request, expectedRequest)
})

test('send should map request data', async (t) => {
  const adapter = createAdapter()
  const requestMapper = ({ data }) => ({ data })
  const authenticator = { id: 'auth1' }
  const request = {
    action: 'SET',
    params: {
      type: 'entry'
    },
    data: [
      { id: 'ent1', type: 'entry', attributes: { title: 'The heading', two: '2' } }
    ],
    endpoint: endpointOptions,
    access: {
      ident: { id: 'johnf' }
    }
  }
  const expectedData = {
    data: {
      items: [{ key: 'ent1', header: 'The heading', two: 2 }]
    }
  }

  const ret = await send({ schemas, adapter, authenticator })({ request, requestMapper, mappings })

  t.deepEqual(ret.request.data, expectedData)
})

test('send should emit request data before mapping to service', async (t) => {
  const adapter = createAdapter()
  const requestMapper = ({ data }) => data
  const request = {
    action: 'SET',
    params: {
      type: 'entry'
    },
    data: [
      { id: 'ent1', type: 'entry', attributes: { title: 'The heading', two: '2' } }
    ],
    endpoint: endpointOptions,
    access: {
      ident: { id: 'johnf' }
    }
  }
  const emit = sinon.stub()

  await send({ schemas, adapter, emit })({ request, requestMapper, mappings })

  t.true(emit.callCount >= 1)
  t.is(emit.args[0][0], 'mapToService')
  const emitRequest = emit.args[0][1]
  t.is(emitRequest.action, 'SET')
  t.is(emitRequest.data[0].attributes.title, 'The heading')
  t.is(emit.args[0][2], null)
})

test('send should emit request data after mapping to service', async (t) => {
  const adapter = createAdapter()
  const requestMapper = ({ data }) => data
  const request = {
    action: 'SET',
    params: {
      type: 'entry'
    },
    data: [
      { id: 'ent1', type: 'entry', attributes: { title: 'The heading', two: '2' } }
    ],
    endpoint: endpointOptions,
    access: {
      ident: { id: 'johnf' }
    }
  }
  const emit = sinon.stub()
  const expectedData = {
    items: [
      {
        key: 'ent1',
        header: 'The heading',
        two: 2
      }
    ]
  }

  await send({ schemas, adapter, emit })({ request, requestMapper, mappings })

  t.true(emit.callCount >= 2)
  t.is(emit.args[1][0], 'mappedToService')
  const emitRequest = emit.args[1][1]
  t.is(emitRequest.action, 'SET')
  t.deepEqual(emitRequest.data, expectedData)
  t.is(emit.args[1][2], null)
})

test('send should retrieve and map data from endpoint', async (t) => {
  const adapter = createAdapter({
    send: async () => ({
      status: 'ok',
      data: { content: { items: [{ key: 'ent1', header: 'Entry 1', two: 2 }] } }
    })
  })
  const responseMapper = (response) => ({ data: response.data.content })
  const request = {
    action: 'GET',
    params: { id: 'ent1', type: 'entry', service: 'thenews' },
    access: { ident: { id: 'johnf' } },
    endpoint: endpointOptions
  }
  const expected = {
    status: 'ok',
    data: [{
      id: 'ent1',
      type: 'entry',
      attributes: { title: 'Entry 1', two: 2 },
      relationships: {
        service: { id: 'thenews', type: 'service' }
      }
    }],
    access: { status: 'granted', ident: { id: 'johnf' }, scheme: 'data' }
  }

  const ret = await send({ schemas, adapter })({ request, responseMapper, mappings })

  t.deepEqual(ret.response, expected)
})

test('send should return authorized response', async (t) => {
  const adapter = createAdapter({
    send: async () => ({
      status: 'ok',
      data: [
        { id: 'johnf', type: 'account' },
        { id: 'betty', type: 'account' }
      ]
    })
  })
  const request = {
    action: 'GET',
    params: { type: 'account' },
    auth: { id: 'auth1' },
    access: { ident: { id: 'johnf' } },
    endpoint: endpointOptions
  }
  const expected = {
    status: 'ok',
    data: [
      { id: 'johnf', type: 'account', attributes: {}, relationships: {} }
    ],
    access: {
      status: 'partially',
      scheme: 'data',
      ident: { id: 'johnf' }
    }
  }

  const ret = await send({ schemas, adapter })({ request, mappings })

  t.deepEqual(ret.response, expected)
})

test('send should emit request and response data before mapping from service', async (t) => {
  const adapter = createAdapter({
    send: async () => ({
      status: 'ok',
      data: {
        items: [
          {
            key: 'ent1',
            header: 'The heading',
            two: 2
          }
        ]
      }
    })
  })
  const request = {
    action: 'GET',
    params: { type: 'entry', id: 'ent1' },
    auth: { id: 'auth1' },
    access: { ident: { id: 'johnf' } },
    endpoint: endpointOptions
  }
  const emit = sinon.stub()

  const ret = await send({ schemas, adapter, emit })({ request, mappings })

  t.is(ret.response.status, 'ok')
  t.true(emit.callCount >= 3)
  t.is(emit.args[2][0], 'mapFromService')
  const emitRequest = emit.args[2][1]
  t.is(emitRequest.action, 'GET')
  const emitResponse = emit.args[2][2]
  t.is(emitResponse.data.items[0].key, 'ent1')
})

test('send should emit request and response data after mapping from service', async (t) => {
  const adapter = createAdapter({
    send: async () => ({
      status: 'ok',
      data: {
        items: [
          {
            key: 'ent1',
            header: 'The heading',
            two: 2
          }
        ]
      }
    })
  })
  const request = {
    action: 'GET',
    params: { type: 'entry', id: 'ent1' },
    auth: { id: 'auth1' },
    access: { ident: { id: 'johnf' } },
    endpoint: endpointOptions
  }
  const emit = sinon.stub()

  const ret = await send({ schemas, adapter, emit })({ request, mappings })

  t.is(ret.response.status, 'ok')
  t.true(emit.callCount >= 4)
  t.is(emit.args[3][0], 'mappedFromService')
  const emitRequest = emit.args[3][1]
  t.is(emitRequest.action, 'GET')
  const emitResponse = emit.args[3][2]
  t.is(emitResponse.data[0].id, 'ent1')
})

test('send should return authorized request data before mapping to service', async (t) => {
  const adapter = createAdapter()
  const request = {
    action: 'SET',
    params: {},
    data: [
      { id: 'johnf', type: 'account' },
      { id: 'betty', type: 'account' }
    ],
    access: { ident: { id: 'johnf' } },
    endpoint: endpointOptions
  }
  const expectedData = [{ id: 'johnf', type: 'account', attributes: {}, relationships: {} }]

  const ret = await send({ schemas, adapter })({ request, mappings })

  t.deepEqual(ret.authorizedRequestData, expectedData)
})

test('send should call send with connection', async (t) => {
  const connection = { status: 'ok', value: 'Value from existing connection' }
  const adapter = createAdapter({
    send: async (request, connection = {}) => ({
      status: 'ok',
      data: { items: [{ key: 'ent1', header: connection.value }] }
    })
  })
  const request = {
    action: 'GET',
    params: { id: 'ent1', type: 'entry', service: 'thenews' },
    access: { ident: { id: 'johnf' } },
    endpoint: {}
  }
  const expected = {
    status: 'ok',
    data: [{
      id: 'ent1',
      type: 'entry',
      attributes: { title: 'Value from existing connection' },
      relationships: {
        service: { id: 'thenews', type: 'service' }
      }
    }],
    access: { status: 'granted', ident: { id: 'johnf' }, scheme: 'data' }
  }

  const ret = await send({ schemas, adapter })({ request, connection, mappings })

  t.deepEqual(ret.response, expected)
})

test('send should call connect', async (t) => {
  const adapter = createAdapter({
    connect: async ({ value }) => ({ status: 'ok', value }),
    send: async (request, connection = {}) => ({
      status: 'ok',
      data: { items: [{ key: 'ent1', header: connection.value }] }
    })
  })
  const serviceOptions = { value: 'Value from connection' }
  const request = {
    action: 'GET',
    params: { id: 'ent1', type: 'entry', service: 'thenews' },
    access: { ident: { id: 'johnf' } },
    endpoint: {}
  }
  const expected = {
    status: 'ok',
    data: [{
      id: 'ent1',
      type: 'entry',
      attributes: { title: 'Value from connection' },
      relationships: {
        service: { id: 'thenews', type: 'service' }
      }
    }],
    access: { status: 'granted', ident: { id: 'johnf' }, scheme: 'data' }
  }

  const ret = await send({ schemas, adapter, serviceOptions })({ request, mappings })

  t.deepEqual(ret.response, expected)
})

test('send should retrieve from endpoint with default values', async (t) => {
  const adapter = createAdapter({
    send: async () => ({
      status: 'ok',
      data: { items: [{ key: 'ent1', header: 'Entry 1', two: 2 }] }
    })
  })
  const request = {
    action: 'GET',
    params: { id: 'ent1', type: 'entry', onlyMappedValues: false },
    access: { ident: { id: 'johnf' } },
    endpoint: endpointOptions
  }

  const ret = await send({ schemas, adapter })({ request, mappings })

  const { data } = ret.response
  t.is(data[0].attributes.one, 1)
  t.true(data[0].attributes.createdAt instanceof Date)
  t.true(data[0].attributes.updatedAt instanceof Date)
})

test('send should skip unknown schemas', async (t) => {
  const adapter = createAdapter()
  const request = {
    action: 'SET',
    params: { type: 'account' },
    data: [
      { id: 'un1', type: 'unknown' },
      { id: 'johnf', type: 'account' }
    ],
    access: { ident: { id: 'johnf' } },
    endpoint: endpointOptions
  }

  const ret = await send({ schemas, adapter })({ request, mappings })

  t.is(ret.request.data.length, 1)
  t.is(ret.request.data[0].id, 'johnf')
})

test('send should not map response data when unmapped is true', async (t) => {
  const adapter = createAdapter({
    send: async () => ({
      status: 'ok',
      data: { items: [{ key: 'ent1', header: 'Entry 1', two: 2 }] }
    })
  })
  const request = {
    action: 'GET',
    params: { id: 'ent1', type: 'entry', service: 'thenews', unmapped: true },
    access: { ident: { root: true } },
    endpoint: endpointOptions
  }
  const expected = {
    status: 'ok',
    data: { items: [{ key: 'ent1', header: 'Entry 1', two: 2 }] },
    access: { status: 'granted', ident: { root: true }, scheme: 'unmapped' }
  }

  const ret = await send({ schemas, adapter })({ request, mappings })

  t.deepEqual(ret.response, expected)
})

test('should respond with noaction for unknown action type', async (t) => {
  const request = {
    action: 'SYNC',
    params: {}
  }
  const expectedResponse = {
    status: 'noaction'
  }

  const ret = await send({})({ request, mappings })

  t.deepEqual(ret.response, expectedResponse)
})
