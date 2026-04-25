# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MDG 马督工 — a chat web app that generates answers in the writing style of Ma Qianzu (马前卒). It uses a two-agent pipeline: one agent drafts an answer, and a second agent critiques and corrects its style.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite (`frontend/`)
- **Backend**: FastAPI + Python (`backend/`)
- **LLM Routing**: OpenAI-compatible API only

## Common Commands

### Development
Run the full stack from the repo root using the provided scripts (Windows):
- PowerShell: `.\start.ps1`
- CMD: `.\start.bat`

Or start services manually:

**Backend** (from `backend/` with venv activated):
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Frontend** (from `frontend/`):
```bash
npm run dev      # dev server on localhost:5173
npm run build    # production build to frontend/dist
npm run lint     # eslint
npm run preview  # preview production build
```

### Dependencies
- Backend: `pip install -r backend/requirements.txt`
- Frontend: `npm install` inside `frontend/`

## Architecture

### Two-Agent Pipeline (backend)
1. **`agents/answer_agent.py`**: Generates the initial draft using `answer-prompt.md` as the system prompt.
2. **`agents/critique_agent.py`**: Style-checks the draft and returns JSON `{ corrections, corrected_text }`.
3. **`orchestrator.py`**: Sequentially runs Agent 1 → Agent 2, then streams the corrected text to the client via SSE (`/api/chat`).

### LLM Router (`llm_router.py`)
- `LLMRouter.chat_completion()` wraps the OpenAI-compatible client.
- `json_mode=True` sets `response_format` to `json_object`.
- Runtime config changes (API keys, base URLs, models) are applied via `/api/config` and trigger `router.reload()` to reinitialize the client.

### Config (`backend/config.py`)
- Loaded from `backend/.env` (copied from `.env.example` on first run).
- Keys: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ANSWER_MODEL`, `CRITIQUE_MODEL`, `MAX_TOKENS`.
- The `/api/config` endpoint masks API keys (shows first/last few chars only).

### Frontend (`frontend/src/`)
- **`api.ts`**: Handles SSE parsing for `/api/chat` and REST calls for `/api/config`.
- **`App.tsx`**: Manages chat state; streams assistant responses with metadata (original draft + correction list).
- **`SettingsPanel.tsx`**: Runtime config editor for API keys, base URLs, and model selection.
- **Vite proxy**: `vite.config.ts` proxies `/api` to `http://localhost:8000` during development.

## Critical File: `answer-prompt.md`

This file at the repository root is **not documentation** — it is the live system prompt for the answer agent. `agents/prompts.py` reads it at runtime. The critique agent also extracts its style rules from this file (it strips out the "真实回答示例" section). Any edits to style rules or examples must be made here.

## Deployment

- `deploy/nginx.conf.example`: nginx config for SPA fallback + API proxy (note `proxy_buffering off` for SSE).
- `deploy/mdg-api.service`: systemd service for the FastAPI backend.
- Build the frontend with `npm run build`, then serve `frontend/dist` via nginx.
