# 部署指南

本文档说明如何将 MDG 马督工部署到 Linux VPS，典型组合为 `systemd + Nginx`。

部署前建议先阅读：[注意事项](./notes.md)

## 1. 准备代码与配置

```bash
# 上传或 clone 到服务器
cd /opt/mdg
cp backend/.env.example .env
nano .env
```

建议优先填写以下配置：

- 必填：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`ANSWER_MODEL`、`CRITIQUE_MODEL`
- 生产建议填写：`API_KEY`、`CORS_ORIGINS`
- 按需调整：`RATE_LIMIT_PER_HOUR`、`MAX_MESSAGE_LENGTH`、`MAX_TOKENS`、`HOST`、`PORT`、`TRUSTED_PROXIES`、`ALLOW_CONFIG_UPDATE`

## 2. 后端：虚拟环境 + systemd

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 创建专用服务用户（避免以 root 运行）
sudo useradd -r -s /sbin/nologin mdg
sudo chown -R mdg:mdg /opt/mdg

sudo cp deploy/mdg-api.service /etc/systemd/system/
sudo nano /etc/systemd/system/mdg-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now mdg-api
```

重点检查：

- `WorkingDirectory`：后端目录，默认 `/opt/mdg/backend`
- `ExecStart`：虚拟环境中 `uvicorn` 的绝对路径，默认 `/opt/mdg/venv/bin/uvicorn`
- `EnvironmentFile`：`.env` 文件路径，模板默认 `/opt/mdg/.env`

## 3. 前端：构建静态产物

```bash
cd frontend
npm install
npm run build
sudo mkdir -p /var/www/mdg
sudo cp -r dist/* /var/www/mdg/
```

## 4. Nginx：SPA + API 反向代理

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/mdg
sudo nano /etc/nginx/sites-available/mdg
sudo ln -s /etc/nginx/sites-available/mdg /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

重点检查：

- `server_name`：实际域名
- `root`：前端构建产物目录，默认 `/var/www/mdg`
- `proxy_pass`：后端地址，默认 `http://127.0.0.1:8000`
- `ssl_certificate` / `ssl_certificate_key`：HTTPS 证书路径

说明：

- `/api/` 需要反代到 `127.0.0.1:8000`
- SSE 必须保持 `proxy_buffering off`，模板已内置该配置

## 5. 可选：签发 HTTPS 证书

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 6. 验证部署结果

```bash
curl http://localhost:8000/api/health
```

预期返回：

```json
{"status":"ok"}
```

如果启用了 `ALLOW_CONFIG_UPDATE=true` 且配置了 `API_KEY`，可以在前端「设置」面板中运行时修改配置，无需重启服务。
