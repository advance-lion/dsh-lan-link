# dsh-lan-link

为 DeepSeek Harness Web 提供**可持久化、令牌保护的局域网访问**。

插件不会直接把 DSH 的原始 Web 端口暴露到局域网，而是在另一个端口上启动 HTTP/WebSocket 网关：访问完整的 `?token=...` 链接后，网关写入 30 天的 HttpOnly Cookie，并把已授权流量转发到本机 DSH。

## 功能

- 在 **设置 → 插件 → 插件配置 → LAN Link** 中手动开启或关闭
- `enabled`、端口和随机 token 由 DSH Settings 持久化
- 开关保持开启时，DSH 重启后自动恢复相同端口和 token，原链接继续有效
- 设置卡片显示所有检测到的 IPv4 LAN 链接并支持复制
- 一键换发 token；换发后旧链接和旧 Cookie 立即失效
- 同时代理普通 HTTP 请求和 DSH WebSocket 事件流
- 不修改 DSH 自带的 `webserver` 或 `connection` 配置

## 插件界面与使用体验

安装并重启 DSH 后，进入：

**设置 → 插件 → 插件配置 → LAN Link**

设置卡片大致如下：

```text
LAN Link                                      ● Running / ○ Stopped

通过持久化令牌网关，让局域网设备访问当前 DSH Web。

┌─────────────────────────────── 风险提示 ──┐
│ 获得完整链接的人将拥有 DSH 控制权限。      │
│ HTTP 不加密，请仅在可信私有局域网使用。    │
└────────────────────────────────────────────┘

☑ Enable persistent LAN access

Gateway port  [ 3081 ]  [Save port]
                         [Rotate token] [Refresh]

Authorized LAN links
http://192.168.1.10:3081/?token=xxxx...  [Copy]
http://10.0.0.8:3081/?token=xxxx...       [Copy]

Local verification link
http://127.0.0.1:3081/?token=xxxx...
```

### 开启访问

勾选 **Enable persistent LAN access** 后，插件会：

1. 首次自动生成 256-bit 随机 token；
2. 持久保存开关、端口和 token；
3. 默认监听 `0.0.0.0:3081`；
4. 自动识别可用的 LAN IPv4 地址；
5. 在设置卡片中显示完整授权链接。

### 远端设备首次访问

在同一局域网的电脑或手机上打开完整链接：

```text
http://192.168.1.10:3081/?token=<完整令牌>
```

网关验证 token 后会写入一个有效期 30 天的 HttpOnly Cookie，并跳转到不带 token 的首页。之后同一浏览器可以直接访问：

```text
http://192.168.1.10:3081/
```

只要 Cookie 未清除或过期、插件仍为开启状态、DSH 正在运行且 token 未换发，就不需要再次输入完整链接。

### 跨 DSH 重启

插件不是脱离 DSH 独立运行的 Windows 服务；DSH 退出时网关也会关闭。但设置是持久的：

- 开关保持开启时，下一次启动 DSH 会自动恢复网关；
- 恢复时继续使用同一端口和 token；
- 原授权链接仍然有效；
- 远端浏览器中未过期的 Cookie 仍然有效。

因此正常使用时只需开启一次，不需要每次启动都重新生成链接。

### 管理操作

- **Save port**：保存新端口并立即重启网关；token 不变，旧端口停止服务。
- **Rotate token**：生成新 token；旧链接和旧 Cookie 立即失效。
- **Refresh**：重新读取运行状态和本机 LAN 地址。
- **取消开启开关**：立即停止 LAN 监听；token 仍保留，下次开启默认继续使用。
- 若希望关闭后让所有旧链接永久失效，请在重新开启后执行一次 **Rotate token**。

### 网络路径

```text
局域网浏览器
    │  http://LAN-IP:3081 + token / Cookie
    ▼
dsh-lan-link 令牌网关
    │  认证、同源检查、Host/Origin 改写
    ▼
127.0.0.1:3080 的原始 DSH Web
```

LAN 侧不能访问插件自己的 `/lan-link/*` 控制 RPC；修改开关、端口和换发 token 只允许在宿主机的 loopback 设置页面操作。

## ⚠️ 安全风险

启用前请明确理解：

1. **完整 token URL 等同于 DSH 控制权限。** 获取链接的人可以用宿主用户的权限操作 DSH，包括运行可用工具、读写工作区、发起模型调用等。
2. **token 持久化在本机 DSH Settings 中，属于明文机密。** 插件把该字段标记为 secret，使通用 Settings API 脱敏，但磁盘上的配置并未加密。
3. **默认使用普通 HTTP。** token、Cookie 和会话内容不会被 TLS 加密；同一不可信网络中的监听者可能窃取它们。
4. **仅限可信私有局域网。** 不要做公网端口映射，不要暴露到公司访客网、公共 Wi‑Fi 或不受信任 VLAN。
5. Windows 防火墙可能在首次监听时弹出授权；只允许“专用网络”，不要允许“公用网络”。
6. token 用户拥有完整 DSH 使用能力，而不是只读权限；应把完整链接视为密码。

如果链接可能泄露，请立即点击 **Rotate token**；如果不需要远程访问，请关闭开关。跨公网或不可信网络使用时，请优先选择 Tailscale、WireGuard、SSH 隧道或带 HTTPS 的反向代理。

## 版本兼容性

当前 `0.1.x` 分支专门面向并测试于：

- DeepSeek Harness CLI：`0.1.1-rc.2`
- DSH Client/Host 公共插件接口：`0.1.1-rc.2`
- Node.js：`>=22.19.0`

`package.json` 使用精确的 `dsh.engines.dsh` 和 DSH peer 版本，避免 pnpm 自动解析到 `0.1.2-alpha/rc` 系列。插件不依赖新版原生 `launchToken`，令牌认证由自身网关完成。

安装前可以确认当前版本：

```powershell
dsh --version
# 预期：0.1.1-rc.2
```

## 安装

从 GitHub checkout 安装到 Web profile：

```powershell
git clone https://github.com/advance-lion/dsh-lan-link.git
cd dsh-lan-link
dsh plugin --profile web add .
```

然后重启当前 `dsh web` 进程。进入 **设置 → 插件 → 插件配置**，找到 **LAN Link**。

卸载：

```powershell
dsh plugin --profile web remove dsh-lan-link
```

## 设置行为

- 初始状态：关闭
- 默认网关端口：`3081`
- token：第一次开启时自动生成 256-bit 随机值
- Cookie：HttpOnly、SameSite=Lax、30 天
- 开启后：监听 `0.0.0.0:<gateway-port>`，转发到当前 DSH Web 的回环端口
- 端口被占用：保持 `enabled: true`，但卡片显示启动失败；修改端口后会立即重试

持久设置大致如下（token 已省略）：

```yaml
lan-link:
  enabled: true
  port: 3081
  token: "..."
```

## 与原生 `launchToken` 的关系

部分 DSH 版本可能提供原生 `connection.launchToken`。当前验证目标版本没有这一配置；如果盲目添加该字段，可能被忽略并造成无认证暴露。本插件因此使用独立令牌网关，不依赖 `launchToken`。

## 开发与验证

```powershell
npm test
npm pack --dry-run
dsh plugin --profile web add .
dsh --profile web --dump-config
```

## License

MIT
