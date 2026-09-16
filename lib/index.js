import { createServer } from 'node:net'

export const name = 'lan-link'
export const inject = ['settings', 'connection', 'webServer', 'webRuntime', 'lanLinkConfig']
export const LAN_LINK_ROUTE = '/api/lan-link'
export const DEFAULT_PORT = 3080

export async function checkPortAvailability(port, activePort, createServer) {
  if (port === activePort) return { available: true, current: true }
  return new Promise(resolve => {
    const server = createServer()
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      resolve(result)
    }
    server.once('error', error => finish({ available: false, current: false, code: typeof error?.code === 'string' ? error.code : 'UNKNOWN' }))
    server.listen(port, '0.0.0.0', () => server.close(error => finish(error
      ? { available: false, current: false, code: typeof error?.code === 'string' ? error.code : 'UNKNOWN' }
      : { available: true, current: false })))
  })
}

function rpcError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

export function apply(ctx) {
  const snapshot = () => {
    const persisted = ctx.lanLinkConfig.get()
    const activeEnabled = ctx.webServer.host === '0.0.0.0'
    const port = ctx.webServer.port
    const addresses = ctx.webRuntime.lanAddresses
    const links = activeEnabled
      ? addresses.map(address => ctx.connection.authenticatedUrl(`http://${address}:${port}`))
      : []
    return {
      configuredEnabled: persisted.enabled,
      configuredPort: persisted.port,
      configuredCookieMaxAgeDays: persisted.cookieMaxAgeDays,
      activeEnabled,
      activeHost: ctx.webServer.host,
      activePort: port,
      restartRequired: persisted.enabled !== activeEnabled || persisted.port !== port || persisted.cookieMaxAgeDays !== ctx.lanLinkConfig.cookieMaxAgeDays,
      links,
      localLink: ctx.connection.authenticatedUrl(`http://127.0.0.1:${port}`),
      activeCookieMaxAgeDays: ctx.lanLinkConfig.cookieMaxAgeDays,
      dshVersion: '0.1.5-rc.2',
    }
  }

  ctx.inject(['webServer'], owner => {
    owner.connection.fetch.register({
      path: LAN_LINK_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async request => {
        let result
        try {
          const body = await request.json()
          if (body === null || typeof body !== 'object') throw new TypeError('request expects an object')
          const { endpoint, payload } = body
          if (endpoint === 'status') result = { ok: true, value: snapshot() }
          else if (endpoint === 'configure') {
            if (payload === null || typeof payload !== 'object') throw new TypeError('configure expects an object')
            const patch = {}
            if (Object.hasOwn(payload, 'enabled')) {
              if (typeof payload.enabled !== 'boolean') throw new TypeError('enabled must be boolean')
              patch.enabled = payload.enabled
            }
            if (Object.hasOwn(payload, 'port')) {
              if (!Number.isInteger(payload.port) || payload.port < 1 || payload.port > 65535) {
                throw new TypeError('port must be an integer from 1 to 65535')
              }
              const availability = await checkPortAvailability(payload.port, owner.webServer.port, () => createServer())
              if (!availability.available) {
                result = { ok: false, error: { code: 'port-unavailable', message: `端口 ${payload.port} 已被其他进程占用或无法监听（${availability.code}）。输入框已恢复为默认端口 ${DEFAULT_PORT}，原配置没有修改。`, details: { port: payload.port, defaultPort: DEFAULT_PORT, reason: availability.code } } }
                return Response.json(result)
              }
              patch.port = payload.port
            }
            if (Object.hasOwn(payload, 'cookieMaxAgeDays')) {
              if (!Number.isInteger(payload.cookieMaxAgeDays) || payload.cookieMaxAgeDays < 1 || payload.cookieMaxAgeDays > 3650) {
                throw new TypeError('cookieMaxAgeDays must be an integer from 1 to 3650')
              }
              patch.cookieMaxAgeDays = payload.cookieMaxAgeDays
            }
            await owner.lanLinkConfig.update(patch)
            result = { ok: true, value: snapshot() }
          } else result = { ok: false, error: { code: 'not-found', message: `Unknown LAN Link endpoint: ${endpoint}`, details: {} } }
        } catch (error) {
          result = rpcError(error)
        }
        return Response.json(result)
      },
    })
  })
}
