import test from 'ava'
import createSchema from '../schema'

import createMapOptions from './createMapOptions'

// Setup

const mappings = [
  {
    id: 'entries_entry',
    type: 'entry',
    mapping: [
      {
        id: 'id',
        title: 'headline',
      },
    ],
  },
  {
    id: 'entries_user',
    type: 'user',
    mapping: [
      {
        id: 'username',
        name: 'fullName',
      },
    ],
  },
]

const schemas = {
  entry: createSchema({
    id: 'entry',
  }),
  user: createSchema({
    id: 'user',
  }),
}

const transformFunctions = {
  string: () => (value: unknown) => String(value),
}

const dictionaries = {
  userRole: [['super', 'admin'] as const, ['readwrite', 'editor'] as const],
}

// Tests

test('should return map options with pipelines from mappings', (t) => {
  const expected = {
    ['entries_entry']: mappings[0].mapping,
    ['entries_user']: mappings[1].mapping,
  }

  const ret = createMapOptions({}, mappings, transformFunctions)

  t.deepEqual(ret.pipelines, expected)
})

test('should include schema cast mappings in pipelines', (t) => {
  const expected = {
    ['entries_entry']: mappings[0].mapping,
    ['entries_user']: mappings[1].mapping,
    ['cast_entry']: schemas.entry.mapping,
    ['cast_user']: schemas.user.mapping,
  }

  const ret = createMapOptions(schemas, mappings, transformFunctions)

  t.deepEqual(ret.pipelines, expected)
})

test('should include transform functions', (t) => {
  const ret = createMapOptions(schemas, mappings, transformFunctions)

  t.is(ret.functions, transformFunctions)
})

test('should include dictionaries functions', (t) => {
  const ret = createMapOptions(
    schemas,
    mappings,
    transformFunctions,
    dictionaries
  )

  t.is(ret.dictionaries, dictionaries)
})
