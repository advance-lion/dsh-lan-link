export const name = 'lan-link'
export const inject = ['settings', 'connection', 'webServer', 'webRuntime', 'lanLinkConfig']
export const LAN_LINK_ROUTE = '/api/lan-link'

function rpcError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

export function apply(ctx) {
  const snapshot = () => {
    const persisted = ctx.lanLinkConfig.get()
    const enabled = ctx.lanLinkConfig.enabled
    const port = ctx.webServer.port
    const addresses = ctx.webRuntime.lanAddresses
    const links = enabled
      ? addresses.map(address => ctx.connection.authenticatedUrl(`http://${address}:${port}`))
      : []
    return {
      configuredEnabled: persisted.enabled,
      configuredPort: persisted.port,
      configuredCookieMaxAgeDays: persisted.cookieMaxAgeDays,
      activeEnabled: enabled,
      activeHost: ctx.webServer.host,
      activePort: port,
      restartRequired: persisted.enabled !== enabled || persisted.port !== ctx.lanLinkConfig.port || persisted.cookieMaxAgeDays !== ctx.lanLinkConfig.cookieMaxAgeDays,
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
