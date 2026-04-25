# MDG 马督工

一个以马前卒（督工）写作风格生成回答的聊天 Web 应用。

## 工作原理

```
用户提问 → 回答 Agent（生成初稿）→ 审查 Agent（风格修正）→ SSE 流式输出
```

采用双 Agent 流水线：

1. **回答 Agent** 根据 `answer-prompt.md` 中的风格规则生成初稿。
2. **审查 Agent** 依据 `critique-prompt.md` 对初稿进行风格审查并改写。
3. 后端通过 SSE 把最终文本流式推给前端。

技术栈：React 19 + TypeScript + Vite（前端），FastAPI + Python（后端），任意 OpenAI 兼容 API。

## 本地开发

环境要求：Python 3.10+、Node.js 18+、OpenAI 兼容 API Key。

Windows 一键启动：

```powershell
.\start.ps1   # 或 .\start.bat
```

脚本会创建虚拟环境、安装依赖、生成 `.env` 并拉起前后端。手动启动见下方部署步骤的对应命令。

## 安全注意事项

部署到公网前，请务必完成以下配置：

1. **设置 API Key（必须）**  
   在 `backend/.env` 中设置 `API_KEY`，并在前端浏览器控制台执行：
   ```js
   localStorage.setItem('mdg_api_key', 'your-secret-key')
   ```
   若留空，则所有端点处于无认证状态，强烈建议生产环境启用。

2. **配置 CORS（必须）**  
   生产环境必须将 `CORS_ORIGINS` 设为实际域名（如 `https://your-domain.com`）。默认留空表示禁止所有跨域请求。

3. **配置受信反向代理（推荐）**  
   若使用 Nginx 等反向代理，设置 `TRUSTED_PROXIES=127.0.0.1`，否则 `X-Forwarded-For` 可被客户端伪造，导致限流失效。

4. **关闭运行时配置修改（推荐）**  
   保持 `ALLOW_CONFIG_UPDATE=false`（默认）。若需修改配置，直接编辑 `.env` 后重启服务。

5. **保护 .env 文件权限（推荐）**  
   生产环境建议将 `.env` 移至 `/etc/mdg/.env`，并设置权限 `chmod 600`，避免被系统其他用户读取。

6. **启用 HTTPS（必须）**  
   `deploy/nginx.conf.example` 已提供 HTTPS 配置示例。API Key 和聊天内容在 HTTP 下以明文传输，必须使用 TLS。

## VPS 部署

### 1. 准备代码与配置

```bash
# 上传或 clone 到服务器
cd /opt/mdg
cp backend/.env.example backend/.env
nano backend/.env   # 填入 OPENAI_API_KEY / OPENAI_BASE_URL / ANSWER_MODEL / CRITIQUE_MODEL / API_KEY / CORS_ORIGINS
```

### 2. 后端：虚拟环境 + systemd

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

sudo cp deploy/mdg-api.service /etc/systemd/system/
sudo nano /etc/systemd/system/mdg-api.service   # 核对路径
sudo systemctl daemon-reload
sudo systemctl enable --now mdg-api
```

### 3. 前端：构建静态产物

```bash
cd frontend
npm install
npm run build
sudo mkdir -p /var/www/mdg
sudo cp -r dist/* /var/www/mdg/
```

### 4. Nginx：SPA + API 反代

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/mdg
sudo nano /etc/nginx/sites-available/mdg        # 修改 server_name 与静态目录
sudo ln -s /etc/nginx/sites-available/mdg /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

要点：`/api/` 反代到 `127.0.0.1:8000`；SSE 必须保持 `proxy_buffering off`（模板里已配置）。

### 5. （可选）HTTPS

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 6. 验证

```bash
curl http://localhost:8000/api/health   # {"status": "ok"}
```

浏览器访问域名或服务器 IP 即可。若启用了 `ALLOW_CONFIG_UPDATE=true` 并配置了 `API_KEY`，可在前端「设置」面板运行时修改配置，无需重启服务。
