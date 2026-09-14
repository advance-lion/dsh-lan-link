import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { COOKIE_NAME, buildLanUrls, createTokenGateway, lanIPv4Addresses } from '../lib/proxy.js'

async function freePort() {
  const server = http.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('builds unique LAN IPv4 links', () => {
  const addresses = lanIPv4Addresses({
    a: [
      { family: 'IPv4', internal: false, address: '192.168.1.10' },
      { family: 'IPv4', internal: false, address: '192.168.1.10' },
      { family: 'IPv4', internal: true, address: '127.0.0.1' },
    ],
    b: [{ family: 4, internal: false, address: '10.0.0.8' }],
  })
  assert.deepEqual(addresses, ['192.168.1.10', '10.0.0.8'])
  assert.deepEqual(buildLanUrls(addresses, 3081, 'a+b'), [
    'http://192.168.1.10:3081/?token=a%2Bb',
    'http://10.0.0.8:3081/?token=a%2Bb',
  ])
})

test('requires token, establishes cookie, proxies, and invalidates rotated token', async t => {
  const target = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ url: req.url, host: req.headers.host, origin: req.headers.origin ?? null }))
  })
  target.on('upgrade', (req, socket) => {
    socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
  })
  target.listen(0, '127.0.0.1')
  await once(target, 'listening')
  t.after(() => new Promise(resolve => target.close(resolve)))

  const gatewayPort = await freePort()
  const gateway = createTokenGateway({
    targetHost: '127.0.0.1',
    targetPort: target.address().port,
    token: 'alpha-token',
  })
  await gateway.listen(gatewayPort)
  t.after(() => gateway.close())

  const denied = await request(gatewayPort, '/')
  assert.equal(denied.status, 403)

  const accepted = await request(gatewayPort, '/?token=alpha-token')
  assert.equal(accepted.status, 302)
  assert.equal(accepted.headers.location, '/')
  const cookie = accepted.headers['set-cookie'][0].split(';')[0]
  assert.equal(cookie, `${COOKIE_NAME}=alpha-token`)

  const blockedControl = await request(gatewayPort, '/lan-link/status', {
    cookie,
    host: `127.0.0.1:${gatewayPort}`,
    origin: `http://127.0.0.1:${gatewayPort}`,
  })
  assert.equal(blockedControl.status, 403)

  const proxied = await request(gatewayPort, '/api/demo', {
    cookie,
    host: `127.0.0.1:${gatewayPort}`,
    origin: `http://127.0.0.1:${gatewayPort}`,
  })
  assert.equal(proxied.status, 200)
  assert.deepEqual(JSON.parse(proxied.body), {
    url: '/api/demo',
    host: `127.0.0.1:${target.address().port}`,
    origin: `http://127.0.0.1:${target.address().port}`,
  })

  gateway.setToken('beta-token')
  const crossOrigin = await request(gatewayPort, '/api/demo', {
    cookie,
    host: `127.0.0.1:${gatewayPort}`,
    origin: 'http://127.0.0.1:9999',
    'sec-fetch-site': 'same-site',
  })
  assert.equal(crossOrigin.status, 403)

  const stale = await request(gatewayPort, '/', { cookie })
  assert.equal(stale.status, 403)
  const fresh = await request(gatewayPort, '/?token=beta-token')
  assert.equal(fresh.status, 302)
  const freshCookie = fresh.headers['set-cookie'][0].split(';')[0]

  const upgrade = await new Promise((resolve, reject) => {
    const socket = net.connect(gatewayPort, '127.0.0.1', () => {
      socket.write([
        'GET /events HTTP/1.1',
        `Host: 127.0.0.1:${gatewayPort}`,
        `Origin: http://127.0.0.1:${gatewayPort}`,
        `Cookie: ${freshCookie}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        '',
        '',
      ].join('\r\n'))
    })
    let text = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      text += chunk
      if (text.includes('\r\n\r\n')) {
        socket.destroy()
        resolve(text)
      }
    })
    socket.on('error', reject)
  })
  assert.match(upgrade, /^HTTP\/1\.1 101 Switching Protocols/)
})
