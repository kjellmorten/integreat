import test from 'ava'
import nock from 'nock'
import json from '../lib/adapters/json'
import standardTransforms from '../lib/transforms'
import userType from './types/user'
import usersSource from './sources/users'
import johnfData from './data/userJohnf'

import integreat from '../lib/integreat'

test('should get one entry from source', async (t) => {
  const adapters = {json}
  const transforms = standardTransforms()
  const types = [userType]
  const sources = [usersSource]
  nock('http://some.api')
    .get('/users/johnf')
    .reply(200, {data: johnfData})
  const action = {
    type: 'GET',
    payload: {id: 'johnf', type: 'user'}
  }

  const great = integreat(sources, types, {adapters, transforms})
  const ret = await great.dispatch(action)

  t.true(Array.isArray(ret))
  t.is(ret.length, 1)
  t.is(ret[0].id, 'johnf')
  const attrs = ret[0].attributes
  t.truthy(attrs)
  t.is(attrs.username, 'johnf')
  t.is(attrs.firstname, 'John')
  t.is(attrs.lastname, 'Fjon')
  t.is(attrs.yearOfBirth, 1987)

  nock.restore()
})
