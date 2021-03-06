import test from 'ava'
import nock from 'nock'
import json from 'integreat-adapter-json'
import defs from '../helpers/defs'
import johnfData from '../helpers/data/userJohnf'
import ent1Data from '../helpers/data/entry1'

import integreat from '../..'

// Setup

const createdAt = '2017-11-18T18:43:01Z'
const updatedAt = '2017-11-24T07:11:43Z'

test.after.always(() => {
  nock.restore()
})

// Tests

test('should get one user from service', async (t) => {
  const adapters = { json: json() }
  nock('http://some.api')
    .get('/users/johnf').times(2)
    .reply(200, { data: { ...johnfData, createdAt, updatedAt } })
  const action = {
    type: 'GET',
    payload: { id: 'johnf', type: 'user' },
    meta: { ident: { id: 'johnf' } }
  }
  const expected = [{
    id: 'johnf',
    type: 'user',
    attributes: {
      username: 'johnf',
      firstname: 'John',
      lastname: 'Fjon',
      yearOfBirth: 1987,
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
      roles: ['editor'],
      tokens: ['twitter|23456', 'facebook|12345']
    },
    relationships: {
      feeds: [
        { id: 'news', type: 'feed' },
        { id: 'social', type: 'feed' }
      ]
    }
  }]

  const great = integreat(defs, { adapters })
  const ret = await great.dispatch(action)

  t.is(ret.status, 'ok', ret.error)
  t.deepEqual(ret.data, expected)
})

test('should get one entry from service', async (t) => {
  const adapters = { json: json() }
  nock('http://some.api')
    .get('/entries/ent1')
    .reply(200, { data: { ...ent1Data, createdAt, updatedAt } })
  const action = {
    type: 'GET',
    payload: { id: 'ent1', type: 'entry' },
    meta: { ident: { root: true } }
  }
  const expected = [{
    id: 'ent1',
    type: 'entry',
    attributes: {
      title: 'Entry 1',
      text: 'The text of entry 1',
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt)
    },
    relationships: {
      author: { id: 'johnf', type: 'user' },
      sections: [
        { id: 'news', type: 'section' },
        { id: 'sports', type: 'section' }
      ]
    }
  }]

  const great = integreat(defs, { adapters })
  const ret = await great.dispatch(action)

  t.is(ret.status, 'ok', ret.error)
  t.deepEqual(ret.data, expected)
})

test('should respond with raw data', async (t) => {
  const defsWithEndpoint = {
    ...defs,
    services: [
      {
        ...defs.services[0],
        endpoints: [
          {
            match: { action: 'GET' },
            responseMapping: 'replaceKey',
            mapResponseWithType: false,
            options: { uri: '/{id}' }
          }
        ]
      }
    ]
  }
  const adapters = { json: json() }
  const scope = nock('http://some.api')
    .get('/entries/ent2')
    .reply(200, { replaceKey: 'entry2' })
  const action = {
    type: 'GET',
    payload: { id: 'ent2', type: 'entry' },
    meta: { ident: { id: 'johnf' } }
  }

  const great = integreat(defsWithEndpoint, { adapters })
  const ret = await great.dispatch(action)

  t.is(ret.status, 'ok', ret.error)
  t.is(ret.data, 'entry2')
  t.true(scope.isDone())
})
