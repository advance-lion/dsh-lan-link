window.__ModuleLoader__.load({
  id: 'dsh-lan-link',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const ROUTE = '/api/lan-link'
    const inject = ['slots']
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
        if (!result || result.ok !== true) throw new Error(result?.error?.message || 'LAN Link 请求失败')
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
          if (!response.ok) throw new Error(`请求 ${ROUTE} 失败：HTTP ${response.status}`)
          applyResult(await response.json())
        }
        catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
        finally { setBusy(false) }
      }
      React.useEffect(() => { void call('status') }, [])

      const restartDsh = async () => {
        if (restarting || !window.confirm('确定现在重启 DSH 吗？正在生成的模型回复和后台任务将会中断。')) return
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
          if (response.status !== 202 || body.ok !== true) throw new Error(body.error || `重启失败（HTTP ${response.status}）`)
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
            setError(`DSH 重启超时，请手动打开 ${targetOrigin}。`)
            return
          }
          fetch(targetOrigin + '/dsh-market/status', { cache: 'no-store', mode: 'cors' })
            .then(response => {
              if (!response.ok) throw new Error('尚未就绪')
              if (targetOrigin === oldOrigin) window.location.reload()
              else window.location.assign(targetOrigin)
            })
            .catch(() => window.setTimeout(poll, 1500))
        }
        window.setTimeout(poll, 1500)
      }

      const copy = async value => {
        try { await navigator.clipboard.writeText(value); setError(null) }
        catch { setError('无法写入剪贴板，请手动选择并复制链接。') }
      }

      const children = [
        React.createElement('div', { key: 'head', style: row },
          React.createElement('strong', { style: { fontSize: 16 } }, '局域网连接'),
          React.createElement('span', { style: { opacity: .65 } }, state?.activeEnabled ? '● 局域网访问已启用' : '○ 仅限本机访问')),
        React.createElement('div', { key: 'desc', style: { opacity: .78, lineHeight: 1.55 } },
          '使用 DSH 0.1.5 原生 Web 服务、浏览器认证、启动令牌和签名 Cookie。配置修改将在重启 DSH Web 后生效。'),
        React.createElement('div', { key: 'warning', style: warning },
          React.createElement('strong', null, '安全警告：'),
          '完整的授权链接拥有 DSH 的全部操作权限。局域网流量使用未加密的 HTTP。请仅在可信的专用网络中启用，切勿将端口暴露到公网。'),
      ]

      if (state) {
        children.push(React.createElement('label', { key: 'toggle', style: row },
          React.createElement('input', { type: 'checkbox', checked: state.configuredEnabled, disabled: busy,
            onChange: event => { void call('configure', { enabled: event.target.checked }) } }),
          React.createElement('span', null, '重启后启用局域网访问')))
        children.push(React.createElement('div', { key: 'port', style: row },
          React.createElement('label', { htmlFor: 'dsh-lan-link-port' }, 'DSH Web 端口'),
          React.createElement('input', { id: 'dsh-lan-link-port', type: 'number', min: 1, max: 65535, value: port, disabled: busy,
            onChange: event => setPort(event.target.value), style: { width: 100, padding: 6, borderRadius: 6 } }),
          React.createElement('button', { type: 'button', disabled: busy, style: button,
            onClick: () => { void call('configure', { port: Number(port) }) } }, '保存'),
          React.createElement('button', { type: 'button', disabled: busy, style: button,
            onClick: () => { void call('status') } }, '刷新')))
        children.push(React.createElement('div', { key: 'cookie-days', style: row },
          React.createElement('label', { htmlFor: 'dsh-lan-link-cookie-days' }, '授权有效期（天）'),
          React.createElement('input', { id: 'dsh-lan-link-cookie-days', type: 'number', min: 1, max: 3650, value: cookieDays, disabled: busy,
            onChange: event => setCookieDays(event.target.value), style: { width: 100, padding: 6, borderRadius: 6 } }),
          React.createElement('button', { type: 'button', disabled: busy, style: button,
            onClick: () => { void call('configure', { cookieMaxAgeDays: Number(cookieDays) }) } }, '保存有效期'),
          React.createElement('span', { style: { opacity: .65, fontSize: 12 } }, '默认 30 天；重启后签发的新 Cookie 将使用此有效期。')))
        if (state.restartRequired) children.push(React.createElement('div', { key: 'restart', style: { display: 'grid', gap: 8 } },
          React.createElement('div', { style: { color: '#d9892b', fontWeight: 600 } }, '需要重启 DSH Web 才能应用已保存的局域网设置。'),
          React.createElement('div', { style: row },
            React.createElement('button', { type: 'button', disabled: busy || restarting, style: { ...button, fontWeight: 600 }, onClick: restartDsh },
              restarting ? '正在重启…' : '保存并重启 DSH'),
            React.createElement('span', { style: { opacity: .65, fontSize: 12 } },
              '仅允许在本机执行；来自局域网远程设备的重启请求会被 DSH Market 拒绝。'))))
        children.push(React.createElement('div', { key: 'active', style: { opacity: .75 } },
          `当前监听：${state.activeHost}:${state.activePort} · DSH ${state.dshVersion} · Cookie ${state.activeCookieMaxAgeDays} 天`))
        if (state.activeEnabled) {
          children.push(React.createElement('div', { key: 'links-title' },
            React.createElement('strong', null, '原生授权局域网链接'),
            React.createElement('div', { style: { opacity: .65, fontSize: 12, marginTop: 3 } },
              '令牌仅属于当前 DSH 进程。首次访问会将令牌兑换为绑定当前主机的 HttpOnly 签名 Cookie。')))
          for (const value of state.links) children.push(React.createElement('div', { key: value, style: row },
            React.createElement('a', { href: value, target: '_blank', rel: 'noreferrer', style: { ...link, flex: '1 1 360px' } }, value),
            React.createElement('button', { type: 'button', style: button, onClick: () => { void copy(value) } }, '复制')))
          if (state.links.length === 0) children.push(React.createElement('div', { key: 'none', style: { opacity: .7 } }, '未检测到非回环 IPv4 地址。'))
        }
      } else children.push(React.createElement('div', { key: 'loading', style: { opacity: .65 } }, '正在加载局域网连接状态…'))
      if (error) children.push(React.createElement('div', { key: 'error', style: { color: '#d65d4b', overflowWrap: 'anywhere' } }, error))
      return React.createElement('section', { style: card }, ...children)
    }

    function apply(ctx) {
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item', key: 'lan-link', inject: () => ({}),
      }, LanLinkCard))
    }
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
