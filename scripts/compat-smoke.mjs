import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const dshVersion = process.env.DSH_VERSION || manifest.dsh?.engines?.dsh
if (!dshVersion) throw new Error('missing DSH_VERSION and package.json dsh.engines.dsh')
const port = Number(process.env.DSH_COMPAT_PORT || 39282)
const toolchain = path.join(root, '.compat-toolchain')
const dshHome = path.join(root, '.compat-home')
fs.rmSync(toolchain, { recursive: true, force: true })
fs.rmSync(dshHome, { recursive: true, force: true })
fs.mkdirSync(toolchain, { recursive: true })
fs.writeFileSync(path.join(toolchain, 'package.json'), '{"private":true}')

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && /\.cmd$/iu.test(file), ...options })
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed with ${result.status}`)
}
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--prefix', toolchain, '--ignore-scripts', '--no-audit', '--no-fund', `@deepseek-ai/dsh@${dshVersion}`])
const entry = path.join(toolchain, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const env = { ...process.env, DSH_HOME: dshHome }
run(process.execPath, [entry, '--version'], { env })
run(process.execPath, [entry, 'plugin', '--profile', 'web', 'add', root], { env })
fs.writeFileSync(path.join(dshHome, 'settings.yaml'), `lan-link:\n  enabled: true\n  port: ${port}\n  cookieMaxAgeDays: 7\n`)

function request(pathname, cookie, payload) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? undefined : JSON.stringify(payload)
    const headers = { Host: `127.0.0.1:${port}` }
    if (cookie) headers.Cookie = cookie
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = Buffer.byteLength(body)
    }
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: body === undefined ? 'GET' : 'POST', headers }, res => {
      let responseBody = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { responseBody += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: responseBody }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

async function start() {
  const child = spawn(process.execPath, [entry, '--profile', 'web', '--no-open'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const token = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`DSH start timeout\n${output}`)), 30000)
    const onData = chunk => {
      output += String(chunk)
      const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=([A-Za-z0-9_-]+)/u.exec(output)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`DSH exited ${code}\n${output}`)) })
  })
  return { child, token }
}
async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))])
  if (child.exitCode === null) child.kill('SIGKILL')
}

let first
let second
try {
  first = await start()
  const denied = await request('/')
  const accepted = await request(`/?token=${encodeURIComponent(first.token)}`)
  const setCookie = accepted.headers['set-cookie']?.[0] || ''
  const cookie = setCookie.split(';')[0]
  const page = await request('/', cookie)
  const settingsDenied = await request('/api/lan-link', undefined, { endpoint: 'status', payload: null })
  const settingsStatus = await request('/api/lan-link', cookie, { endpoint: 'status', payload: null })
  const settingsResult = settingsStatus.status === 200 ? JSON.parse(settingsStatus.body) : null
  const settingsWrite = await request('/api/lan-link', cookie, { endpoint: 'configure', payload: { enabled: true, port, cookieMaxAgeDays: 8 } })
  const writeResult = settingsWrite.status === 200 ? JSON.parse(settingsWrite.body) : null
  if (denied.status !== 401 || accepted.status !== 303 || page.status !== 200 || !page.body.includes('__DSH_BOOT__') || !/Max-Age=604800/u.test(setCookie) || settingsDenied.status !== 401 || settingsStatus.status !== 200 || settingsResult?.ok !== true || settingsResult.value?.configuredCookieMaxAgeDays !== 7 || settingsWrite.status !== 200 || writeResult?.ok !== true || writeResult.value?.configuredCookieMaxAgeDays !== 8) {
    throw new Error(`native auth/settings assertion failed: ${JSON.stringify({ denied: denied.status, accepted: accepted.status, page: page.status, settingsDenied: settingsDenied.status, settingsStatus: settingsStatus.status, settingsBody: settingsStatus.body, settingsWrite: settingsWrite.status, writeBody: settingsWrite.body, cookie: setCookie })}`)
  }
  await stop(first.child)
  second = await start()
  if (second.token === first.token) throw new Error('launch token did not rotate after restart')
  const resumed = await request('/', cookie)
  if (resumed.status !== 200 || !resumed.body.includes('__DSH_BOOT__')) throw new Error(`persisted cookie failed after restart: ${resumed.status}`)
  console.log(`compatibility smoke passed: dsh=${dshVersion} platform=${os.platform()}`)
} finally {
  if (first?.child) await stop(first.child)
  if (second?.child) await stop(second.child)
}
