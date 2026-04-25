# MDG 马督工

一个以马前卒（督工）写作风格生成回答的聊天 Web 应用。采用双 Agent 流水线架构：第一个 Agent 生成初稿，第二个 Agent 对风格进行审查和修正。

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **后端**: FastAPI + Python
- **LLM**: OpenAI 兼容 API（支持任意 OpenAI 兼容服务商）

## 项目结构

```
.
├── answer-prompt.md          # 回答 Agent 的系统提示词（核心文件）
├── critique-prompt.md        # 审查 Agent 的系统提示词
├── backend/
│   ├── main.py               # FastAPI 入口
│   ├── orchestrator.py        # 双 Agent 流水线编排
│   ├── llm_router.py          # LLM 调用封装（含重试）
│   ├── config.py              # 配置管理
│   ├── models.py              # Pydantic 数据模型
│   ├── agents/
│   │   ├── answer_agent.py    # 回答生成 Agent
│   │   ├── critique_agent.py  # 风格审查 Agent
│   │   └── prompts.py         # 提示词加载
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # 主应用组件
│   │   ├── api.ts             # SSE 通信
│   │   ├── components/        # UI 组件
│   │   └── types.ts           # TypeScript 类型
│   ├── package.json
│   └── vite.config.ts
└── deploy/
    ├── nginx.conf.example     # Nginx 配置模板
    └── mdg-api.service        # systemd 服务文件
```

## 工作原理

```
用户提问 → 回答 Agent（生成初稿）→ 审查 Agent（风格检查与修正）→ SSE 流式输出
```

1. 用户在前端输入问题
2. 后端回答 Agent 根据 `answer-prompt.md` 中的风格规则生成初稿
3. 审查 Agent 对初稿进行风格审查，返回修正后的文本和勘误列表
4. 前端通过 SSE 逐步展示最终回答，并可展开查看勘误详情

## 本地开发

### 环境要求

- Python 3.10+
- Node.js 18+
- OpenAI 兼容的 API Key

### 快速启动（Windows）

```powershell
.\start.ps1
# 或
.\start.bat
```

脚本会自动：创建虚拟环境、安装依赖、配置 `.env`、启动前后端服务。

### 手动启动

**1. 配置环境变量**

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入你的 API Key 和模型配置
```

`backend/.env` 配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | API 密钥 | - |
| `OPENAI_BASE_URL` | API 基础地址（留空使用 OpenAI 官方） | - |
| `ANSWER_MODEL` | 回答模型 | `gpt-4o-mini` |
| `CRITIQUE_MODEL` | 审查模型 | `gpt-4o` |
| `MAX_TOKENS` | 最大 token 数 | `4096` |

**2. 启动后端**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**3. 启动前端**

```bash
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173`。

## VPS 部署

### 环境要求

- Linux 服务器（Ubuntu/Debian 推荐）
- Python 3.10+
- Node.js 18+
- Nginx

### 1. 上传代码

```bash
scp -r ./mdg user@your-server:/opt/mdg
```

或在服务器上 git clone 你的仓库。

### 2. 配置后端

```bash
cd /opt/mdg
cp backend/.env.example backend/.env
nano backend/.env  # 填入 API Key、模型等配置
```

### 3. 创建 Python 虚拟环境

```bash
cd /opt/mdg
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 4. 配置 systemd 服务

复制服务文件并修改路径：

```bash
sudo cp deploy/mdg-api.service /etc/systemd/system/
sudo nano /etc/systemd/system/mdg-api.service
```

确保路径与你的实际部署路径一致，然后启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable mdg-api
sudo systemctl start mdg-api
sudo systemctl status mdg-api
```

### 5. 构建前端

```bash
cd /opt/mdg/frontend
npm install
npm run build
```

构建产物在 `frontend/dist/` 目录。

### 6. 配置 Nginx

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/mdg
sudo nano /etc/nginx/sites-available/mdg  # 修改 server_name 和路径
sudo ln -s /etc/nginx/sites-available/mdg /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

关键配置说明：

- 静态文件从 `/var/www/mdg` 提供（将 `frontend/dist/` 内容复制过去）
- `/api/` 请求代理到后端 `127.0.0.1:8000`
- SSE 需要关闭 proxy buffering（已配置 `proxy_buffering off`）

```bash
# 复制前端构建产物
sudo mkdir -p /var/www/mdg
sudo cp -r /opt/mdg/frontend/dist/* /var/www/mdg/
```

### 7. （可选）配置 HTTPS

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 8. 验证

```bash
curl http://localhost:8000/api/health
# 应返回 {"status": "ok"}
```

在浏览器访问你的域名或服务器 IP。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/chat` | 发送消息（SSE 流式响应） |
| `GET` | `/api/config` | 获取当前配置（API Key 脱敏） |
| `PUT` | `/api/config` | 运行时更新配置 |

### SSE 事件类型

| 事件 | 说明 |
|------|------|
| `status` | 进度状态（`thinking` / `analyzing`） |
| `metadata` | 包含原始草稿和勘误列表 |
| `chunk` | 流式文本片段 |
| `done` | 传输完成 |

## 运行时配置

应用支持通过前端设置面板或 API 在运行时修改配置，无需重启服务：

- API Key / Base URL
- 回答模型 / 审查模型

修改后会立即生效（`LLMRouter` 会重新初始化客户端）。

## 许可证

本项目仅供学习和个人使用。
