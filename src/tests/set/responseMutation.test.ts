import test from 'ava'
import nock = require('nock')
import resources from '../helpers/resources'
import entrySchema from '../helpers/defs/schemas/entry'
import entriesService from '../helpers/defs/services/entries'
import entriesEntryMutation from '../helpers/defs/mutations/entries-entry'
import exchangeJsonMutation from '../../mutations/exchangeJson'
import exchangeUriMutation from '../../mutations/exchangeUri'
import { TypedData } from '../../types'

import Integreat from '../..'

// Setup

const entry1Item = {
  $type: 'entry',
  id: 'ent1',
  title: 'Entry 1',
}

const entry1FromService = {
  key: 'ent1',
  headline: 'Entry 1',
  body: 'Text from entry 1',
}

test.after.always(() => {
  nock.restore()
})

// Tests

test('should map response and merge with request data', async (t) => {
  nock('http://some.api')
    .put('/entries/ent1')
    .reply(201, { ok: true, content: { items: entry1FromService } })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: entry1Item },
    meta: { ident: { root: true } },
  }
  const defs = {
    schemas: [entrySchema],
    services: [
      {
        ...entriesService,
        endpoints: [
          {
            mutation: {
              $direction: 'fwd',
              data: ['data.content.items', { $apply: 'entries-entry' }],
            },
            options: { uri: '/entries/{{params.id}}' },
          },
        ],
      },
    ],
    mutations: {
      'entries-entry': entriesEntryMutation,
      'exchange:json': exchangeJsonMutation,
      'exchange:uri': exchangeUriMutation,
    },
  }

  const great = Integreat.create(defs, resources)
  const ret = await great.dispatch(action)

  t.is(ret.status, 'ok', ret.error)
  const data = ret.data as TypedData
  t.is(data.$type, 'entry')
  t.is(data.id, 'ent1')
  t.is(data.title, 'Entry 1')
  t.is(data.text, 'Text from entry 1')
})