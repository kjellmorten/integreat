import test from 'ava'
import nock = require('nock')
import json from 'integreat-adapter-json'
import createService from '../service'
import schema from '../schema'
import functions from '../transformers/builtIns'

import deleteFn from './delete'

// Helpers

const schemas = {
  entry: schema({
    id: 'entry',
    fields: {
      title: { $cast: 'string', $default: 'A title' }
    }
  }),
  account: schema({
    id: 'account',
    fields: {
      name: 'string'
    },
    access: { identFromField: 'id' }
  })
}

const pipelines = {
  entry: [
    { $iterate: true, id: 'id', title: 'header' },
    { $apply: 'cast_entry' }
  ],
  account: [
    { $iterate: true, id: 'id', name: 'name' },
    { $apply: 'cast_account' }
  ],
  cast_entry: schemas.entry.mapping,
  cast_account: schemas.account.mapping
}

const mapOptions = { pipelines, functions }

const setupService = createService({ schemas, mapOptions })

test.after.always(() => {
  nock.restore()
})

// Tests

test('should delete items from service', async t => {
  const scope = nock('http://api1.test')
    .post('/database/bulk_delete', { docs: [{ id: 'ent1' }, { id: 'ent2' }] })
    .reply(200, [
      { ok: true, id: 'ent1', rev: '2-000001' },
      { ok: true, id: 'ent2', rev: '2-000001' }
    ])
  const src = setupService({
    id: 'entries',
    adapter: json,
    endpoints: [
      {
        match: { action: 'DELETE' },
        requestMapping: 'docs[]',
        options: {
          uri: 'http://api1.test/database/bulk_delete',
          method: 'POST'
        }
      }
    ],
    mappings: { entry: 'entry' }
  })
  const getService = (type, service) => (service === 'entries' ? src : null)
  const action = {
    type: 'DELETE',
    payload: {
      data: [
        { id: 'ent1', $schema: 'entry' },
        { id: 'ent2', $schema: 'entry' }
      ],
      service: 'entries'
    }
  }

  const ret = await deleteFn(action, { getService })

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should delete one item from service', async t => {
  const scope = nock('http://api1.test')
    .delete('/database/ent1')
    .reply(200, { ok: true, id: 'ent1', rev: '000001' })
  const src = setupService({
    id: 'entries',
    adapter: json,
    endpoints: [
      {
        match: {
          action: 'DELETE',
          scope: 'member'
        },
        options: {
          uri: 'http://api1.test/database/{id}',
          method: 'DELETE'
        }
      }
    ],
    mappings: { entry: 'entry' }
  })
  const getService = (type, service) => (service === 'entries' ? src : null)
  const action = {
    type: 'DELETE',
    payload: { id: 'ent1', type: 'entry', service: 'entries' }
  }

  const ret = await deleteFn(action, { getService })

  t.truthy(ret)
  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should infer service id from type', async t => {
  const scope = nock('http://api2.test')
    .post('/database/bulk_delete', { docs: [{ id: 'ent1' }, { id: 'ent2' }] })
    .reply(200, [
      { ok: true, id: 'ent1', rev: '2-000001' },
      { ok: true, id: 'ent2', rev: '2-000001' }
    ])
  const src = setupService({
    id: 'entries',
    adapter: json,
    endpoints: [
      {
        match: { action: 'DELETE' },
        requestMapping: 'docs[]',
        options: {
          uri: 'http://api2.test/database/bulk_delete',
          method: 'POST'
        }
      }
    ],
    mappings: { entry: 'entry' }
  })
  const getService = (type, service) => (type === 'entry' ? src : null)
  const action = {
    type: 'DELETE',
    payload: {
      data: [
        { id: 'ent1', $schema: 'entry' },
        { id: 'ent2', $schema: 'entry' }
      ],
      type: 'entry'
    }
  }

  const ret = await deleteFn(action, { getService })

  t.truthy(ret)
  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should delete with other endpoint and uri params', async t => {
  const scope = nock('http://api3.test')
    .post('/entries/bulk_delete', [{ id: 'ent1' }, { id: 'ent2' }])
    .reply(200, [
      { ok: true, id: 'ent1', rev: '2-000001' },
      { ok: true, id: 'ent2', rev: '2-000001' }
    ])
  const src = setupService({
    id: 'entries',
    adapter: json,
    endpoints: [
      {
        id: 'other',
        options: {
          uri: 'http://api3.test/{typefolder}/bulk_delete',
          method: 'POST'
        }
      }
    ],
    mappings: { entry: 'entry' }
  })
  const getService = (type, service) => src
  const action = {
    type: 'DELETE',
    payload: {
      data: [
        { id: 'ent1', $schema: 'entry' },
        { id: 'ent2', $schema: 'entry' }
      ],
      type: 'entry',
      endpoint: 'other',
      typefolder: 'entries'
    }
  }

  const ret = await deleteFn(action, { getService })

  t.truthy(ret)
  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should return error from response', async t => {
  const scope = nock('http://api5.test')
    .post('/database/bulk_delete')
    .reply(404)
  const src = setupService({
    id: 'entries',
    adapter: json,
    endpoints: [
      {
        id: 'delete',
        requestMapping: 'docs[]',
        options: {
          uri: 'http://api5.test/database/bulk_delete',
          method: 'POST'
        }
      }
    ],
    mappings: { entry: 'entry' }
  })
  const getService = (type, service) => src
  const action = {
    type: 'DELETE',
    payload: {
      data: [{ id: 'ent1', $schema: 'entry' }],
      type: 'entry'
    }
  }

  const ret = await deleteFn(action, { getService })

  t.truthy(ret)
  t.is(ret.status, 'notfound', ret.error)
  t.is(typeof ret.error, 'string')
  t.falsy(ret.data)
  t.true(scope.isDone())
})

test('should return noaction when nothing to delete', async t => {
  const src = setupService({
    id: 'entries',
    adapter: json,
    endpoints: [
      {
        id: 'delete',
        options: { uri: 'http://api1.test/database/bulk_delete' }
      }
    ],
    mappings: { entry: 'entry' }
  })
  const getService = (type, service) => src
  const action = { type: 'DELETE', payload: { data: [], service: 'entries' } }

  const ret = await deleteFn(action, { getService })

  t.truthy(ret)
  t.is(ret.status, 'noaction')
})

test('should skip null values in data array', async t => {
  const src = setupService({
    id: 'entries',
    adapter: json,
    endpoints: [
      {
        id: 'delete',
        options: { uri: 'http://api1.test/database/bulk_delete' }
      }
    ],
    mappings: { entry: 'entry' }
  })
  const getService = (type, service) => src
  const action = {
    type: 'DELETE',
    payload: { data: [null], service: 'entries' }
  }

  const ret = await deleteFn(action, { getService })

  t.is(ret.status, 'noaction')
})

test('should only delete items the ident is authorized to', async t => {
  const scope = nock('http://api4.test')
    .post('/database/bulk_delete', { docs: [{ id: 'johnf' }] })
    .reply(200, [
      { ok: true, id: 'ent1', rev: '2-000001' },
      { ok: true, id: 'ent2', rev: '2-000001' }
    ])
  const src = setupService({
    id: 'accounts',
    adapter: json,
    endpoints: [
      {
        match: { action: 'DELETE' },
        requestMapping: 'docs[]',
        options: {
          uri: 'http://api4.test/database/bulk_delete',
          method: 'POST'
        }
      }
    ],
    mappings: { account: 'account' }
  })
  const getService = (type, service) => (service === 'accounts' ? src : null)
  const action = {
    type: 'DELETE',
    payload: {
      data: [
        { id: 'johnf', $schema: 'account' },
        { id: 'betty', $schema: 'account' }
      ],
      service: 'accounts',
    },
    meta: { ident: { id: 'johnf' } }
  }

  const ret = await deleteFn(action, { getService })

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should return error when no service exists for a type', async t => {
  const getService = () => null
  const action = {
    type: 'DELETE',
    payload: { id: 'ent1', type: 'entry' }
  }

  const ret = await deleteFn(action, { getService, schemas })

  t.truthy(ret)
  t.is(ret.status, 'error')
  t.is(ret.error, "No service exists for type 'entry'")
})

test('should return error when specified service does not exist', async t => {
  const getService = () => null
  const action = {
    type: 'DELETE',
    payload: { id: 'ent1', type: 'entry', service: 'entries' }
  }

  const ret = await deleteFn(action, { getService, schemas })

  t.truthy(ret)
  t.is(ret.status, 'error')
  t.is(ret.error, "Service with id 'entries' does not exist")
})

test('should return error if no getService', async t => {
  const action = { type: 'DELETE', payload: { id: 'ent1', type: 'entry' } }

  const ret = await deleteFn(action)

  t.is(ret.status, 'error')
})
