import assert from 'node:assert/strict'
import test from 'node:test'
import { londonDayBounds, londonDateKey, normalizeTvChannelName } from './tv-guide-time'
import { normalizeTvFollowTitle } from './tv-follow'

test('uses Europe/London boundaries during British Summer Time', () => {
  const { start, end } = londonDayBounds('2026-07-23')
  assert.equal(start.toISOString(), '2026-07-22T23:00:00.000Z')
  assert.equal(end.toISOString(), '2026-07-23T23:00:00.000Z')
})

test('uses UTC boundaries during winter', () => {
  const { start, end } = londonDayBounds('2026-01-23')
  assert.equal(start.toISOString(), '2026-01-23T00:00:00.000Z')
  assert.equal(end.toISOString(), '2026-01-24T00:00:00.000Z')
})

test('supports short and long daylight-saving transition days', () => {
  const spring = londonDayBounds('2026-03-29')
  const autumn = londonDayBounds('2026-10-25')
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 23)
  assert.equal((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000, 25)
})

test('returns the London date independently of the VM timezone', () => {
  assert.equal(londonDateKey(new Date('2026-07-22T23:30:00.000Z')), '2026-07-23')
})

test('normalizes presentation prefixes and punctuation for follows', () => {
  assert.equal(normalizeTvFollowTitle('New: Who Do You Think You Are?'), 'who do you think you are')
  assert.equal(normalizeTvFollowTitle('Brand New: Who Do You Think You Are'), 'who do you think you are')
  assert.equal(normalizeTvFollowTitle('Midsomer Murders & More'), 'midsomer murders and more')
})

test('normalizes ampersands in compact XMLTV channel names', () => {
  assert.equal(normalizeTvChannelName('U&Dave'), 'u and dave')
})
