# dsh-lan-link

为 DeepSeek Harness Web 提供可持久开启的局域网访问入口，面向当前 **DSH `0.1.5-rc.1`**。

插件不实现第二套反向代理或自定义认证，而是配置并展示 DSH 0.1.5 自带的：

- `0.0.0.0` WebServer LAN 监听；
- LAN IP `trustedHosts` 信任栅栏；
- 每进程随机 launch token；
- token 首次访问后签发的 HttpOnly Cookie；
- 默认 30 天、可跨 DSH 重启复用的签名浏览器会话。

## 兼容版本

| 项目 | 版本 |
| --- | --- |
| DeepSeek Harness CLI | `0.1.5-rc.1` |
| 插件 | `0.2.0` |
| Node.js | `>=22.19.0` |

本插件以实际全局 `dsh --version` 和安装目录为基线，而不是旧源码 checkout。`package.json` 中的 `dsh.engines.dsh` 精确声明为 `0.1.5-rc.1`。

## 安装

```powershell
git clone https://github.com/advance-lion/dsh-lan-link.git
cd dsh-lan-link
dsh plugin --profile web add .
```

然后重启当前 `dsh web` 进程。

卸载：

```powershell
dsh plugin --profile web remove dsh-lan-link
```

## 使用

进入：

**设置 → 插件 → 插件配置 → LAN Link**

设置卡提供：

1. **Enable LAN access after restart**：保存是否允许 LAN 访问；
2. **DSH Web port**：保存下次启动使用的 Web 端口，默认 `3080`；
3. **Authorization lifetime (days)**：设置授权 Cookie 有效期，默认 `30` 天，可设 `1–3650` 天；
4. 当前实际绑定地址与端口；
5. 是否需要重启；
6. DSH 原生的完整 token 授权链接；
7. 安全风险提示。

### 为什么修改后要重启

DSH 0.1.5 的 WebServer 和 BrowserAuth 在进程启动时读取配置：监听地址不能在运行中把 `127.0.0.1` 安全热切换为 `0.0.0.0`，Cookie 有效期也在 BrowserAuth 初始化时确定。因此开关、端口和授权天数使用 `applies: restart`：设置立即持久化，但重启 `dsh web` 后生效。授权天数的修改只影响重启后新签发的 Cookie，不会追溯改变已签发 Cookie 的到期时间。

- 关闭：绑定 `127.0.0.1`，仅本机访问；
- 开启：绑定 `0.0.0.0`，由 DSH Web Runtime 自动发现 LAN IPv4 并加入 `trustedHosts`；
- 显式命令行 `--host` / `--port` 仍优先于插件设置，方便临时覆盖。

## 原生授权流程

1. 开启 LAN 并重启 DSH；
2. 设置卡或启动日志显示类似：

   ```text
   http://192.168.1.20:3080/?token=...
   ```

3. 远程浏览器第一次打开完整链接；
4. DSH 原生 `BrowserAuth` 校验该进程的随机 token；
5. 成功后返回重定向，并写入绑定 hostname 和 port 的签名 Cookie；
6. 此后可直接访问不含 token 的干净 URL；
7. Cookie 默认有效 30 天。

launch token 每次 DSH 启动都会变化。Cookie 签名密钥保存在 `$DSH_HOME/.credentials.yaml`，所以已经授权的浏览器 Cookie 可以跨 DSH 重启继续使用，直到过期、清除浏览器 Cookie，或删除/替换对应 credential 后重启。

## 安全边界

- 完整 token URL 等同于 DSH 完整操作权限，不是只读链接；
- 原生 Cookie 为 HttpOnly、Host-only、`Path=/`、`SameSite=Strict`；
- Cookie 绑定 hostname 和 port，换 IP、主机名或端口后需要重新授权；
- 普通 HTTP 不加密，局域网内具备嗅探能力的攻击者可能看到流量；
- Host、Origin 和 `sec-fetch-site` 仍由 DSH 原生信任栅栏检查；
- 不要把端口映射到公网，不要在公共 Wi-Fi 上开启；
- Windows 防火墙提示时只允许“专用网络”，不要允许“公用网络”；
- 跨公网访问应使用 Tailscale、WireGuard、SSH 隧道或 HTTPS 反向代理。

如果需要撤销某个浏览器：清除其 Cookie。若要撤销全部已授权浏览器，需要删除或替换 `client-connection/browser-session` credential 并重启 DSH。

## 实现结构

- `lib/config.js`：在 WebServer 绑定前读取并注册持久设置，提供启动快照；
- `cordis.patch.yml`：让原生 WebServer 根据快照选择 loopback/LAN 地址，并保持 DSH 原生 Connection 认证；
- `lib/index.js`：向已认证设置页返回原生授权链接并处理配置写入；
- `lib/client.js`：Settings → Plugins 中的配置卡。

插件没有自建 HTTP/WebSocket 代理，也没有自行存储长期 token。

## 验证

已在全局 DSH `0.1.5-rc.1` 上完成真实测试：

- 空白 profile 本地安装与 Cordis 配置合成；
- loopback 模式启动；
- LAN 模式绑定 `0.0.0.0`；
- 未认证 LAN 请求返回 `401`；
- 原生 token 交换返回重定向并设置 Cookie；
- Cookie 后页面返回 `200` 且包含 `window.__DSH_BOOT__`；
- DSH 重启、launch token 变化后，旧签名 Cookie 仍可访问；
- 代理层单元测试已删除，因为 0.2.0 不再包含自建代理。

开发检查：

```powershell
pnpm test
npm pack --dry-run
```

## License

MIT
