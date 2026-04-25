from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import config
from models import ChatRequest
from orchestrator import process_chat
from llm_router import router


def get_client_ip(request: Request) -> str:
    # 当使用 Nginx 等反向代理时，从 X-Forwarded-For 获取真实客户端 IP
    # 生产环境应配置防火墙，禁止直接访问后端端口，只允许反向代理访问
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_client_ip)
app = FastAPI(title="MDG Chat API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: 生产环境应在 .env 中把 CORS_ORIGINS 设为实际域名
origins = config.cors_origins.split(",") if config.cors_origins != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConfigUpdate(BaseModel):
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    answer_model: str | None = None
    critique_model: str | None = None
    max_tokens: int | None = None
    rate_limit_per_hour: int | None = None
    max_message_length: int | None = None
    cors_origins: str | None = None


@app.get("/")
async def root():
    return {"message": "MDG API is running. Visit the frontend."}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    c = config.to_dict()
    # 隐藏 API Key 中间部分
    if c["openai_api_key"] and len(c["openai_api_key"]) > 12:
        k = c["openai_api_key"]
        c["openai_api_key"] = k[:6] + "..." + k[-4:]
    return c


@app.put("/api/config")
async def update_config(data: ConfigUpdate):
    if not config.allow_config_update:
        raise HTTPException(status_code=403, detail="Runtime config update is disabled")
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    config.update_from_dict(update_dict)
    router.reload()
    return {"status": "ok"}


@app.post("/api/chat")
@limiter.limit(lambda: f"{config.rate_limit_per_hour}/hour")
async def chat(request: Request, req: ChatRequest):
    messages = [m.model_dump() for m in req.messages]
    return StreamingResponse(
        process_chat(messages),
        media_type="text/event-stream",
    )
