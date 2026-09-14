import http from 'node:http'
import net from 'node:net'
import os from 'node:os'

export const COOKIE_NAME = 'dsh_lan_token'
export const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export function lanIPv4Addresses(interfaces = os.networkInterfaces()) {
  const values = []
  const seen = new Set()
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      const ipv4 = address.family === 'IPv4' || address.family === 4
      if (!ipv4 || address.internal || seen.has(address.address)) continue
      seen.add(address.address)
      values.push(address.address)
    }
  }
  return values
}

export function buildLanUrls(addresses, port, token) {
  return addresses.map(address => `http://${address}:${port}/?token=${encodeURIComponent(token)}`)
}

function cookieAuthorized(header, token) {
  if (typeof header !== 'string') return false
  return header.split(';').some(part => part.trim() === `${COOKIE_NAME}=${token}`)
}

function sameOriginRequest(headers) {
  if (headers['sec-fetch-site'] === 'cross-site') return false
  if (typeof headers.origin !== 'string') return true
  if (typeof headers.host !== 'string') return false
  try {
    const origin = new URL(headers.origin)
    return origin.protocol === 'http:' && origin.host === headers.host
  } catch {
    return false
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function rewriteHeaders(headers, targetAuthority, upgrade = false) {
  const next = { ...headers, host: targetAuthority }
  const named = typeof headers.connection === 'string'
    ? headers.connection.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
    : []
  for (const key of [...HOP_BY_HOP_HEADERS, ...named]) delete next[key]
  if (upgrade && typeof headers.upgrade === 'string') next.upgrade = headers.upgrade
  if (typeof next.origin === 'string') next.origin = `http://${targetAuthority}`
  if (typeof next.referer === 'string') next.referer = `http://${targetAuthority}/`
  return next
}

function deny(response) {
  response.writeHead(403, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  })
  response.end('<!doctype html><meta charset="utf-8"><title>403</title><h3>403 - Invalid or missing access token</h3><p>Open the complete LAN Link URL containing its token parameter.</p>')
}

export function createTokenGateway(options) {
  const targetHost = options.targetHost ?? '127.0.0.1'
  const targetPort = options.targetPort
  const targetAuthority = `${targetHost}:${targetPort}`
  let token = options.token
  let closing = false
  const sockets = new Set()
  const upstreamRequests = new Set()
  const upstreamSockets = new Set()

  const server = http.createServer((request, response) => {
    let requestUrl
    try {
      requestUrl = new URL(request.url ?? '/', 'http://lan-link.invalid')
    } catch {
      deny(response)
      return
    }

    const supplied = requestUrl.searchParams.get('token')
    if (supplied !== null) {
      if (supplied !== token) {
        deny(response)
        return
      }
      requestUrl.searchParams.delete('token')
      const query = requestUrl.searchParams.toString()
      response.writeHead(302, {
        'cache-control': 'no-store',
        location: `${requestUrl.pathname}${query === '' ? '' : `?${query}`}`,
        'set-cookie': `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      })
      response.end()
      return
    }

    if (!cookieAuthorized(request.headers.cookie, token) || !sameOriginRequest(request.headers)) {
      deny(response)
      return
    }
    if (requestUrl.pathname === '/lan-link' || requestUrl.pathname.startsWith('/lan-link/')) {
      deny(response)
      return
    }

    const headers = rewriteHeaders(request.headers, targetAuthority)
    const upstream = http.request({
      host: targetHost,
      port: targetPort,
      method: request.method,
      path: request.url,
      headers,
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    })
    upstreamRequests.add(upstream)
    upstream.once('close', () => upstreamRequests.delete(upstream))
    upstream.on('error', error => {
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      }
      response.end(`LAN Link gateway could not reach DSH: ${error.message}`)
    })
    request.once('aborted', () => upstream.destroy())
    response.once('close', () => {
      if (!response.writableEnded) upstream.destroy()
    })
    request.pipe(upstream)
  })

  server.on('connection', socket => {
    if (closing) {
      socket.destroy()
      return
    }
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://lan-link.invalid').pathname
    if (!cookieAuthorized(request.headers.cookie, token) || !sameOriginRequest(request.headers)
      || pathname === '/lan-link' || pathname.startsWith('/lan-link/')) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }

    const upstream = net.connect(targetPort, targetHost, () => {
      const headers = rewriteHeaders(request.headers, targetAuthority, true)
      let text = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`
      for (const [key, value] of Object.entries(headers)) {
        if (key === 'connection' || value === undefined) continue
        text += `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}\r\n`
      }
      text += 'Connection: Upgrade\r\n\r\n'
      upstream.write(text)
      if (head.length > 0) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstreamSockets.add(upstream)
    upstream.once('close', () => upstreamSockets.delete(upstream))
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.once('close', () => upstream.destroy())
  })

  return {
    setToken(next) {
      token = next
    },
    async listen(port) {
      closing = false
      await new Promise((resolve, reject) => {
        const onError = error => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, '0.0.0.0')
      })
    },
    async close() {
      closing = true
      for (const request of upstreamRequests) request.destroy()
      for (const socket of upstreamSockets) socket.destroy()
      for (const socket of sockets) socket.destroy()
      if (!server.listening) return
      await new Promise(resolve => server.close(() => resolve()))
    },
  }
}
