import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStartupConfig } from '../lib/config.js'

test('keeps DSH loopback-only while disabled', () => {
  assert.deepEqual(resolveStartupConfig({ enabled: false, port: 3080 }), {
    enabled: false,
    host: '127.0.0.1',
    port: 3080,
  })
})

test('binds native DSH WebServer to all interfaces while enabled', () => {
  assert.deepEqual(resolveStartupConfig({ enabled: true, port: 39181 }), {
    enabled: true,
    host: '0.0.0.0',
    port: 39181,
  })
})
