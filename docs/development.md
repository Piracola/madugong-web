# 开发指南

本文档用于本地开发和调试 MDG 马督工。

## 环境要求

- Python 3.10+
- Node.js 18+
- OpenAI 兼容 API Key

## Windows 一键启动

项目根目录已提供启动脚本：

```powershell
.\start.ps1
# 或
.\start.bat
```

脚本会自动完成以下操作：

1. 创建 `backend/venv`
2. 安装后端依赖
3. 安装前端依赖
4. 生成 `backend/.env`
5. 启动前端和后端服务

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`

## 手动启动

### 1. 配置后端环境变量

在项目根目录执行：

```powershell
Copy-Item backend\.env.example backend\.env
```

至少需要填写：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`（使用官方接口可留空）
- `ANSWER_MODEL`
- `CRITIQUE_MODEL`

### 2. 启动后端

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 3. 启动前端

新开一个终端窗口：

```powershell
cd frontend
npm install
npm run dev
```

### 4. 访问应用

浏览器打开：

```text
http://localhost:5173
```

## 开发说明

前端开发服务器默认通过 Vite 代理将 `/api` 请求转发到 `http://localhost:8000`。

如果后端地址或端口发生变化，请同步修改 `frontend/vite.config.ts` 中的 `server.proxy` 配置。
