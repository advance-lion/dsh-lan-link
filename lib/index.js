import crypto from 'node:crypto'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { buildLanUrls, createTokenGateway, lanIPv4Addresses } from './proxy.js'

export const name = 'lan-link'
export const inject = ['settings', 'connection', 'webServer']
export const LAN_LINK_NAMESPACE = settingsNamespace('lan-link')
export const LAN_LINK_CHANNEL = '/lan-link'

export const Config = z.object({
  enabled: z.boolean().default(false),
  port: z.natural().min(1).max(65535).default(3081),
  token: z.string().regex(/^(?:[A-Za-z0-9_-]{43}|)$/).role('secret').default(''),
})

function newToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function rpcError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

export async function apply(ctx) {
  const scope = ctx.settings.register(LAN_LINK_NAMESPACE, Config, { applies: 'live' })
  let gateway = null
  let activeSignature = ''
  let lastError = null
  let queue = Promise.resolve()
  let disposed = false

  const snapshot = () => {
    const settings = scope.get()
    const addresses = lanIPv4Addresses()
    const running = gateway !== null
    const links = running ? buildLanUrls(addresses, settings.port, settings.token) : []
    return {
      enabled: settings.enabled,
      running,
      port: settings.port,
      token: settings.token,
      links,
      localLink: running ? `http://127.0.0.1:${settings.port}/?token=${encodeURIComponent(settings.token)}` : null,
      error: lastError,
      risk: 'Anyone holding this URL receives the same DSH authority as the host user. HTTP on a LAN is not encrypted.',
    }
  }

  const stopGateway = async () => {
    const current = gateway
    gateway = null
    activeSignature = ''
    if (current !== null) await current.close()
  }

  const reconcileNow = async () => {
    if (disposed) return
    let settings = scope.get()
    if (settings.enabled && settings.token === '') {
      await scope.update({ token: newToken() })
      settings = scope.get()
    }

    const signature = `${settings.enabled}:${settings.port}:${settings.token}`
    if (signature === activeSignature) return
    await stopGateway()
    lastError = null
    if (!settings.enabled) {
      activeSignature = signature
      return
    }

    const next = createTokenGateway({
      targetHost: '127.0.0.1',
      targetPort: ctx.webServer.port,
      token: settings.token,
    })
    try {
      await next.listen(settings.port)
      if (disposed) {
        await next.close()
        return
      }
      gateway = next
      activeSignature = signature
      console.log(`[dsh-lan-link] listening on 0.0.0.0:${settings.port}`)
    } catch (error) {
      await next.close()
      lastError = error instanceof Error ? error.message : String(error)
      console.error(`[dsh-lan-link] failed to listen: ${lastError}`)
    }
  }

  const reconcile = () => {
    queue = queue.then(reconcileNow, reconcileNow)
    return queue
  }

  const unwatch = scope.watch(() => { void reconcile() })

  const removeRpc = ctx.connection.rpc.handle(LAN_LINK_CHANNEL, async (endpoint, payload) => {
    try {
      if (endpoint === 'status') {
        return { ok: true, value: snapshot() }
      }
      if (endpoint === 'set-enabled') {
        if (payload === null || typeof payload !== 'object' || typeof payload.enabled !== 'boolean') {
          throw new TypeError('set-enabled expects { enabled: boolean }')
        }
        await scope.update({ enabled: payload.enabled })
        await reconcile()
        return { ok: true, value: snapshot() }
      }
      if (endpoint === 'set-port') {
        if (payload === null || typeof payload !== 'object' || !Number.isInteger(payload.port) || payload.port < 1 || payload.port > 65535) {
          throw new TypeError('set-port expects an integer port from 1 to 65535')
        }
        await scope.update({ port: payload.port })
        await reconcile()
        return { ok: true, value: snapshot() }
      }
      if (endpoint === 'rotate-token') {
        await scope.update({ token: newToken() })
        await reconcile()
        return { ok: true, value: snapshot() }
      }
      return { ok: false, error: { code: 'not-found', message: `Unknown LAN Link endpoint: ${endpoint}`, details: {} } }
    } catch (error) {
      return rpcError(error)
    }
  }, { authority: 'loopback' })

  ctx.effect(() => async () => {
    disposed = true
    unwatch()
    await removeRpc()
    await queue.catch(() => {})
    await stopGateway()
  }, 'dsh-lan-link: rpc and token gateway')

  await reconcile()
}
