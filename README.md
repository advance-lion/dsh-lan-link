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

## ⚠️ 安全风险

启用前请明确理解：

1. **完整 token URL 等同于 DSH 控制权限。** 获取链接的人可以用宿主用户的权限操作 DSH，包括运行可用工具、读写工作区、发起模型调用等。
2. **token 持久化在本机 DSH Settings 中，属于明文机密。** 插件把该字段标记为 secret，使通用 Settings API 脱敏，但磁盘上的配置并未加密。
3. **默认使用普通 HTTP。** token、Cookie 和会话内容不会被 TLS 加密；同一不可信网络中的监听者可能窃取它们。
4. **仅限可信私有局域网。** 不要做公网端口映射，不要暴露到公司访客网、公共 Wi‑Fi 或不受信任 VLAN。
5. Windows 防火墙可能在首次监听时弹出授权；只允许“专用网络”，不要允许“公用网络”。

如果链接可能泄露，请立即点击 **Rotate token**；如果不需要远程访问，请关闭开关。

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
