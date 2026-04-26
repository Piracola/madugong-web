# 注意事项

本文档整理部署到公网前需要确认的安全与运行配置。

## 1. 设置 API Key

在当前运行实例所使用的 `.env` 文件中设置 `API_KEY`，并在前端浏览器控制台执行：

```js
sessionStorage.setItem('mdg_api_key', 'your-secret-key')
```

说明：

- 若 `API_KEY` 留空，则所有端点处于无认证状态
- 生产环境强烈建议启用认证
- API Key 存储在 `sessionStorage` 中，关闭标签页后会自动清除

## 2. 配置 CORS

生产环境必须将 `CORS_ORIGINS` 设为实际域名，例如：

```text
https://your-domain.com
```

默认留空表示禁止所有跨域请求。

## 3. 配置受信反向代理

如果使用 Nginx 等反向代理，建议设置：

```text
TRUSTED_PROXIES=127.0.0.1
```

否则 `X-Forwarded-For` 可能被客户端伪造，进而导致限流判断失效。

## 4. 调整限流与消息长度

可根据业务需求修改以下配置：

- `RATE_LIMIT_PER_HOUR`：每小时单 IP 最大请求数，默认 `30`
- `MAX_MESSAGE_LENGTH`：单条用户消息最大字符数，默认 `2000`
- `MAX_MESSAGES`：单次请求最大消息条数，默认 `50`
- `MAX_TOKENS`：单次生成最大 token 数，默认 `4096`

## 5. 修改服务监听地址

默认配置为：

- `HOST=127.0.0.1`
- `PORT=8000`

如果需要对外暴露或修改端口，请同步调整：

- `deploy/nginx.conf.example`
- `deploy/mdg-api.service`

## 6. 关闭运行时配置修改

建议保持：

```text
ALLOW_CONFIG_UPDATE=false
```

如果需要修改配置，优先直接编辑 `.env` 后重启服务。

## 7. 保护 .env 文件权限

生产环境建议将 `.env` 移至：

```text
/etc/mdg/.env
```

并设置权限：

```bash
chmod 600 /etc/mdg/.env
```

如果调整了 `.env` 路径，请同步修改 `deploy/mdg-api.service` 中的 `EnvironmentFile=` 配置。

## 8. 启用 HTTPS

`deploy/nginx.conf.example` 已提供 HTTPS 配置示例。

API Key 与聊天内容在 HTTP 下会明文传输，公网环境必须启用 TLS。
