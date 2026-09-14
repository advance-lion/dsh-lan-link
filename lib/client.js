window.__ModuleLoader__.load({
  id: 'dsh-lan-link',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const CHANNEL = '/lan-link'
    const inject = ['slots', 'connection']

    const cardStyle = {
      border: '1px solid rgba(128,128,128,.35)',
      borderRadius: '10px',
      padding: '16px',
      display: 'grid',
      gap: '12px',
    }
    const rowStyle = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }
    const buttonStyle = {
      border: '1px solid rgba(128,128,128,.45)',
      borderRadius: '7px',
      padding: '6px 12px',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
    }
    const linkStyle = {
      display: 'block',
      padding: '8px 10px',
      borderRadius: '6px',
      background: 'rgba(128,128,128,.12)',
      color: 'inherit',
      fontFamily: 'monospace',
      fontSize: '12px',
      overflowWrap: 'anywhere',
    }
    const warningStyle = {
      padding: '10px 12px',
      border: '1px solid rgba(220,120,40,.55)',
      borderRadius: '7px',
      background: 'rgba(220,120,40,.1)',
      lineHeight: 1.55,
    }

    function LanLinkCard(props) {
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [port, setPort] = React.useState('3081')

      const applyResult = result => {
        if (!result || result.ok !== true) {
          const message = result && result.error && result.error.message
          throw new Error(message || 'LAN Link request failed')
        }
        setState(result.value)
        setPort(String(result.value.port))
        setError(null)
      }
      const call = async (endpoint, payload = null) => {
        setBusy(true)
        try {
          const result = await props.connection.rpc.call(CHANNEL, endpoint, payload)
          applyResult(result)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
        } finally {
          setBusy(false)
        }
      }

      React.useEffect(() => { void call('status') }, [])

      const copy = async value => {
        try {
          await navigator.clipboard.writeText(value)
          setError(null)
        } catch {
          setError('Clipboard write failed. Select and copy the link manually.')
        }
      }

      const children = [
        React.createElement('div', { key: 'head', style: rowStyle },
          React.createElement('strong', { style: { fontSize: '16px' } }, 'LAN Link'),
          React.createElement('span', { style: { opacity: .65 } }, state && state.running ? '● Running' : '○ Stopped'),
        ),
        React.createElement('div', { key: 'desc', style: { opacity: .78, lineHeight: 1.55 } },
          'Expose this DSH Web instance to the local network through a persistent token-gated HTTP and WebSocket proxy.'),
        React.createElement('div', { key: 'warning', style: warningStyle },
          React.createElement('strong', null, 'Security warning: '),
          'Anyone who obtains a complete token URL can operate DSH with the host user’s authority. The token is stored locally in plaintext, and ordinary HTTP does not encrypt LAN traffic. Use only on a trusted private network; never expose the gateway port to the public Internet.'),
      ]

      if (state !== null) {
        children.push(React.createElement('label', { key: 'toggle', style: rowStyle },
          React.createElement('input', {
            type: 'checkbox',
            checked: state.enabled === true,
            disabled: busy,
            onChange: event => { void call('set-enabled', { enabled: event.target.checked }) },
          }),
          React.createElement('span', null, 'Enable persistent LAN access'),
        ))
        children.push(React.createElement('div', { key: 'port', style: rowStyle },
          React.createElement('label', { htmlFor: 'dsh-lan-link-port' }, 'Gateway port'),
          React.createElement('input', {
            id: 'dsh-lan-link-port',
            type: 'number',
            min: 1,
            max: 65535,
            value: port,
            disabled: busy,
            onChange: event => setPort(event.target.value),
            style: { width: '100px', padding: '6px', borderRadius: '6px' },
          }),
          React.createElement('button', {
            type: 'button',
            disabled: busy,
            style: buttonStyle,
            onClick: () => { void call('set-port', { port: Number(port) }) },
          }, 'Save port'),
          React.createElement('button', {
            type: 'button',
            disabled: busy,
            style: buttonStyle,
            onClick: () => { void call('rotate-token') },
          }, 'Rotate token'),
          React.createElement('button', {
            type: 'button',
            disabled: busy,
            style: buttonStyle,
            onClick: () => { void call('status') },
          }, 'Refresh'),
        ))

        if (state.running) {
          const links = Array.isArray(state.links) ? state.links : []
          children.push(React.createElement('div', { key: 'link-title' },
            React.createElement('strong', null, 'Authorized LAN links'),
            React.createElement('div', { style: { opacity: .65, fontSize: '12px', marginTop: '3px' } },
              'Opening a complete link stores an HttpOnly cookie for 30 days. The same persisted token is reused after DSH restarts until you rotate it.'),
          ))
          for (const link of links) {
            children.push(React.createElement('div', { key: link, style: rowStyle },
              React.createElement('a', { href: link, target: '_blank', rel: 'noreferrer', style: { ...linkStyle, flex: '1 1 360px' } }, link),
              React.createElement('button', { type: 'button', style: buttonStyle, onClick: () => { void copy(link) } }, 'Copy'),
            ))
          }
          if (links.length === 0) {
            children.push(React.createElement('div', { key: 'no-ip', style: { opacity: .7 } },
              'No non-loopback IPv4 address was detected. Check the active network adapter and refresh.'))
          }
          if (typeof state.localLink === 'string') {
            children.push(React.createElement('div', { key: 'local' },
              React.createElement('div', { style: { opacity: .65, fontSize: '12px', marginBottom: '4px' } }, 'Local verification link'),
              React.createElement('a', { href: state.localLink, target: '_blank', rel: 'noreferrer', style: linkStyle }, state.localLink),
            ))
          }
        }
        if (state.enabled && !state.running) {
          children.push(React.createElement('div', { key: 'startup-error', style: { color: '#d65d4b' } },
            `LAN access is enabled but the gateway failed to start: ${state.error || 'unknown error'}`))
        }
      } else {
        children.push(React.createElement('div', { key: 'loading', style: { opacity: .65 } }, 'Loading LAN Link status…'))
      }

      if (error !== null) {
        children.push(React.createElement('div', { key: 'error', style: { color: '#d65d4b', overflowWrap: 'anywhere' } }, error))
      }
      return React.createElement('section', { style: cardStyle }, ...children)
    }

    function apply(ctx) {
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: 'lan-link',
        inject: () => ({ connection: ctx.connection }),
      }, LanLinkCard))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
