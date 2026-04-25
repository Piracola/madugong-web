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

## VPS 部署

### 1. 准备代码与配置

```bash
# 上传或 clone 到服务器
cd /opt/mdg
cp backend/.env.example backend/.env
nano backend/.env   # 填入 OPENAI_API_KEY / OPENAI_BASE_URL / ANSWER_MODEL / CRITIQUE_MODEL
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

浏览器访问域名或服务器 IP 即可。API Key、Base URL、模型等可在前端「设置」面板运行时修改，无需重启服务。
