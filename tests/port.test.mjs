import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPortAvailability } from '../lib/index.js'

test('allows the currently active DSH port without probing it', async () => {
  let called = false
  const result = await checkPortAvailability(3082, 3082, () => { called = true })
  assert.deepEqual(result, { available: true, current: true })
  assert.equal(called, false)
})

test('accepts a free port and closes the probe', async () => {
  let closed = false
  const server = {
    once() {},
    listen(_port, _host, ready) { ready() },
    close(done) { closed = true; done() },
  }
  const result = await checkPortAvailability(4000, 3082, () => server)
  assert.deepEqual(result, { available: true, current: false })
  assert.equal(closed, true)
})

test('rejects an occupied port with its system reason', async () => {
  let onError
  const server = {
    once(_name, handler) { onError = handler },
    listen() { onError(Object.assign(new Error('occupied'), { code: 'EADDRINUSE' })) },
  }
  const result = await checkPortAvailability(4000, 3082, () => server)
  assert.deepEqual(result, { available: false, current: false, code: 'EADDRINUSE' })
})
