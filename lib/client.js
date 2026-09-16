window.__ModuleLoader__.load({
  id: 'dsh-lan-link',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const ROUTE = '/api/lan-link'
    const inject = ['slots', 'connection']
    const card = { border: '1px solid rgba(128,128,128,.35)', borderRadius: 10, padding: 16, display: 'grid', gap: 12 }
    const row = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
    const button = { border: '1px solid rgba(128,128,128,.45)', borderRadius: 7, padding: '6px 12px', background: 'transparent', color: 'inherit', cursor: 'pointer' }
    const link = { display: 'block', padding: '8px 10px', borderRadius: 6, background: 'rgba(128,128,128,.12)', color: 'inherit', fontFamily: 'monospace', fontSize: 12, overflowWrap: 'anywhere' }
    const warning = { padding: '10px 12px', border: '1px solid rgba(220,120,40,.55)', borderRadius: 7, background: 'rgba(220,120,40,.1)', lineHeight: 1.55 }

    function LanLinkCard(props) {
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [port, setPort] = React.useState('3080')
      const [cookieDays, setCookieDays] = React.useState('30')
      const [restarting, setRestarting] = React.useState(false)

      const applyResult = result => {
        if (!result || result.ok !== true) throw new Error(result?.error?.message || 'LAN Link request failed')
        setState(result.value)
        setPort(String(result.value.configuredPort))
        setCookieDays(String(result.value.configuredCookieMaxAgeDays))
        setError(null)
      }
      const call = async (endpoint, payload = null) => {
        setBusy(true)
        try {
          const response = await window.fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint, payload }),
          })
          if (!response.ok) throw new Error(`transport failure for ${ROUTE}: HTTP ${response.status}`)
          applyResult(await response.json())
        }
        catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
        finally { setBusy(false) }
      }
      React.useEffect(() => { void call('status') }, [])

      const restartDsh = async () => {
        if (restarting || !window.confirm('Restart DSH now? Active model responses and background jobs will be interrupted.')) return
        setRestarting(true)
        setError(null)
        const oldOrigin = window.location.origin
        const targetPort = Number(port)
        const targetHost = state?.configuredEnabled ? window.location.hostname : '127.0.0.1'
        const targetOrigin = `${window.location.protocol}//${targetHost}:${targetPort}`
        try {
          const response = await fetch('/dsh-market/restart', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
          })
          const body = await response.json().catch(() => ({}))
          if (response.status !== 202 || body.ok !== true) throw new Error(body.error || `Restart failed (HTTP ${response.status})`)
        } catch (caught) {
          if (caught instanceof TypeError) {
            // The old process may close before fetch receives its 202 response.
          } else {
            setRestarting(false)
            setError(caught instanceof Error ? caught.message : String(caught))
            return
          }
        }
        const deadline = Date.now() + 60000
        const poll = () => {
          if (Date.now() > deadline) {
            setRestarting(false)
            setError(`DSH restart timed out. Open ${targetOrigin} manually.`)
            return
          }
          fetch(targetOrigin + '/dsh-market/status', { cache: 'no-store', mode: 'cors' })
            .then(response => {
              if (!response.ok) throw new Error('not ready')
              if (targetOrigin === oldOrigin) window.location.reload()
              else window.location.assign(targetOrigin)
            })
            .catch(() => window.setTimeout(poll, 1500))
        }
        window.setTimeout(poll, 1500)
      }

      const copy = async value => {
        try { await navigator.clipboard.writeText(value); setError(null) }
        catch { setError('Clipboard write failed. Select and copy the link manually.') }
      }

      const children = [
        React.createElement('div', { key: 'head', style: row },
          React.createElement('strong', { style: { fontSize: 16 } }, 'LAN Link'),
          React.createElement('span', { style: { opacity: .65 } }, state?.activeEnabled ? '● LAN active' : '○ Loopback only')),
        React.createElement('div', { key: 'desc', style: { opacity: .78, lineHeight: 1.55 } },
          'Use DSH 0.1.5 native WebServer, BrowserAuth, launch token and signed 30-day cookie. Changes take effect after restarting DSH Web.'),
        React.createElement('div', { key: 'warning', style: warning },
          React.createElement('strong', null, 'Security warning: '),
          'A complete link grants full DSH authority. LAN traffic is plain HTTP and is not encrypted. Enable this only on a trusted private network; never expose the port to the public Internet.'),
      ]

      if (state) {
        children.push(React.createElement('label', { key: 'toggle', style: row },
          React.createElement('input', { type: 'checkbox', checked: state.configuredEnabled, disabled: busy,
            onChange: event => { void call('configure', { enabled: event.target.checked }) } }),
          React.createElement('span', null, 'Enable LAN access after restart')))
        children.push(React.createElement('div', { key: 'port', style: row },
          React.createElement('label', { htmlFor: 'dsh-lan-link-port' }, 'DSH Web port'),
          React.createElement('input', { id: 'dsh-lan-link-port', type: 'number', min: 1, max: 65535, value: port, disabled: busy,
            onChange: event => setPort(event.target.value), style: { width: 100, padding: 6, borderRadius: 6 } }),
          React.createElement('button', { type: 'button', disabled: busy, style: button,
            onClick: () => { void call('configure', { port: Number(port) }) } }, 'Save'),
          React.createElement('button', { type: 'button', disabled: busy, style: button,
            onClick: () => { void call('status') } }, 'Refresh')))
        children.push(React.createElement('div', { key: 'cookie-days', style: row },
          React.createElement('label', { htmlFor: 'dsh-lan-link-cookie-days' }, 'Authorization lifetime (days)'),
          React.createElement('input', { id: 'dsh-lan-link-cookie-days', type: 'number', min: 1, max: 3650, value: cookieDays, disabled: busy,
            onChange: event => setCookieDays(event.target.value), style: { width: 100, padding: 6, borderRadius: 6 } }),
          React.createElement('button', { type: 'button', disabled: busy, style: button,
            onClick: () => { void call('configure', { cookieMaxAgeDays: Number(cookieDays) }) } }, 'Save lifetime'),
          React.createElement('span', { style: { opacity: .65, fontSize: 12 } }, 'Default: 30 days; applies to newly issued cookies after restart.')))
        if (state.restartRequired) children.push(React.createElement('div', { key: 'restart', style: { display: 'grid', gap: 8 } },
          React.createElement('div', { style: { color: '#d9892b', fontWeight: 600 } }, 'Restart dsh web to apply the saved LAN setting.'),
          React.createElement('div', { style: row },
            React.createElement('button', { type: 'button', disabled: busy || restarting, style: { ...button, fontWeight: 600 }, onClick: restartDsh },
              restarting ? 'Restarting…' : 'Save and restart DSH'),
            React.createElement('span', { style: { opacity: .65, fontSize: 12 } },
              'Available only from this machine. Remote LAN restart requests are rejected by DSH Market.'))))
        children.push(React.createElement('div', { key: 'active', style: { opacity: .75 } },
          `Active bind: ${state.activeHost}:${state.activePort} · DSH ${state.dshVersion} · Cookie ${state.activeCookieMaxAgeDays} days`))
        if (state.activeEnabled) {
          children.push(React.createElement('div', { key: 'links-title' },
            React.createElement('strong', null, 'Native authorized LAN links'),
            React.createElement('div', { style: { opacity: .65, fontSize: 12, marginTop: 3 } },
              'The token belongs to this DSH process. First visit exchanges it for a host-bound HttpOnly signed cookie.')))
          for (const value of state.links) children.push(React.createElement('div', { key: value, style: row },
            React.createElement('a', { href: value, target: '_blank', rel: 'noreferrer', style: { ...link, flex: '1 1 360px' } }, value),
            React.createElement('button', { type: 'button', style: button, onClick: () => { void copy(value) } }, 'Copy')))
          if (state.links.length === 0) children.push(React.createElement('div', { key: 'none', style: { opacity: .7 } }, 'No non-loopback IPv4 address was detected.'))
        }
      } else children.push(React.createElement('div', { key: 'loading', style: { opacity: .65 } }, 'Loading LAN Link status…'))
      if (error) children.push(React.createElement('div', { key: 'error', style: { color: '#d65d4b', overflowWrap: 'anywhere' } }, error))
      return React.createElement('section', { style: card }, ...children)
    }

    function apply(ctx) {
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item', key: 'lan-link', inject: () => ({ connection: ctx.connection }),
      }, LanLinkCard))
    }
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
