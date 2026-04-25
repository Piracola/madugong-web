from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from config import config
from models import ChatRequest
from orchestrator import process_chat
from llm_router import router


class LimitUploadSize(BaseHTTPMiddleware):
    """限制请求体大小，防止内存耗尽攻击"""

    def __init__(self, app, max_size: int):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > self.max_size:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large"},
                )
        return await call_next(request)


def get_client_ip(request: Request) -> str:
    """获取客户端真实 IP，仅在请求来自受信代理时信任 X-Forwarded-For"""
    trusted_proxies = config.trusted_proxies.split(",") if config.trusted_proxies else []
    client_host = request.client.host if request.client else "127.0.0.1"

    if not trusted_proxies:
        return client_host

    # 检查直接连接来源是否是受信代理
    if client_host not in trusted_proxies:
        return client_host

    xff = request.headers.get("X-Forwarded-For")
    if xff:
        # 取最左侧的原始客户端 IP
        return xff.split(",")[0].strip()
    return client_host


def verify_api_key(request: Request) -> None:
    """验证 API Key；若未配置 API_KEY 则跳过认证（向后兼容）"""
    if not config.api_key:
        return
    provided = request.headers.get("X-API-Key", "")
    if not provided:
        raise HTTPException(status_code=401, detail="Missing API Key")
    if provided != config.api_key:
        raise HTTPException(status_code=403, detail="Invalid API Key")


def get_dynamic_rate_limit() -> str:
    """每次请求时重新读取限流配置，支持运行时更新"""
    return f"{config.rate_limit_per_hour}/hour"


limiter = Limiter(key_func=get_client_ip)
app = FastAPI(title="MDG Chat API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 限制请求体大小为 1MB
app.add_middleware(LimitUploadSize, max_size=1024 * 1024)

# CORS: 生产环境必须在 .env 中把 CORS_ORIGINS 设为实际域名
origins = [o.strip() for o in config.cors_origins.split(",") if o.strip()] if config.cors_origins else []
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器，防止内部细节泄露"""
    import logging
    logging.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred"},
    )


@app.get("/")
async def root():
    return {"message": "MDG API is running. Visit the frontend."}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config(_=Depends(verify_api_key)):
    return config.to_safe_dict()


@app.put("/api/config")
async def update_config(data: ConfigUpdate, _=Depends(verify_api_key)):
    if not config.allow_config_update:
        raise HTTPException(status_code=403, detail="Runtime config update is disabled")
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    config.update_from_dict(update_dict)
    router.reload()
    return {"status": "ok"}


@app.post("/api/chat")
@limiter.limit(get_dynamic_rate_limit)
async def chat(request: Request, req: ChatRequest, _=Depends(verify_api_key)):
    messages = [m.model_dump() for m in req.messages]
    return StreamingResponse(
        process_chat(messages),
        media_type="text/event-stream",
    )
