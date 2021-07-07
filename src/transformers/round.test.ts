import test from 'ava'

import round from './round'

// Setup

const context = {
  rev: false,
  onlyMappedValues: false, // Will apply in both directions
}

// Tests

test('should round floats to two decimals', (t) => {
  const round2 = round({ precision: 2 })

  t.is(round2(18.4211, context), 18.42)
  t.is(round2(18.42, context), 18.42)
  t.is(round2(18.3, context), 18.3)
  t.is(round2(18, context), 18)
  t.is(round2(18.3352, context), 18.34)
  t.is(round2(-18.3352, context), -18.34)
})

test('should round floats to three decimals', (t) => {
  const round3 = round({ precision: 3 })

  t.is(round3(18.4211, context), 18.421)
  t.is(round3(18.42, context), 18.42)
  t.is(round3(18.3, context), 18.3)
  t.is(round3(18, context), 18)
  t.is(round3(18.3352, context), 18.335)
  t.is(round3(-18.3352, context), -18.335)
})

test('should round to integer as default', (t) => {
  t.is(round({})(18.4211, context), 18)
})

test('should parse number from string', (t) => {
  const round2 = round({ precision: 2 })

  t.is(round2('18.4211', context), 18.42)
  t.is(round2('18', context), 18)
  t.is(round2('18.3352', context), 18.34)
  t.is(round2('-18.3352', context), -18.34)
})

test('should return undefined for other types', (t) => {
  const round2 = round({ precision: 2 })

  t.is(round2('not number', context), undefined)
  t.is(round2(true, context), undefined)
  t.is(round2(new Date(), context), undefined)
  t.is(round2(null, context), undefined)
  t.is(round2(undefined, context), undefined)
})