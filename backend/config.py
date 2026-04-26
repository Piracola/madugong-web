import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    answer_model: str = os.getenv("ANSWER_MODEL", "gpt-4o-mini")
    critique_model: str = os.getenv("CRITIQUE_MODEL", "gpt-4o")
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))
    max_tokens: int = int(os.getenv("MAX_TOKENS", "4096"))
    rate_limit_per_hour: int = int(os.getenv("RATE_LIMIT_PER_HOUR", "30"))
    max_message_length: int = int(os.getenv("MAX_MESSAGE_LENGTH", "2000"))
    max_messages: int = int(os.getenv("MAX_MESSAGES", "50"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "")
    allow_config_update: bool = os.getenv("ALLOW_CONFIG_UPDATE", "false").lower() == "true"
    trusted_proxies: str = os.getenv("TRUSTED_PROXIES", "")

    @classmethod
    def validate(cls):
        if not cls.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set")

    @classmethod
    def to_safe_dict(cls) -> dict:
        """返回脱敏后的配置，用于 API 响应"""
        key = cls.openai_api_key
        masked_key = ""
        if key and len(key) > 12:
            masked_key = key[:6] + "..." + key[-4:]
        return {
            "openai_api_key": masked_key,
            "openai_base_url": cls.openai_base_url,
            "answer_model": cls.answer_model,
            "critique_model": cls.critique_model,
            "max_tokens": cls.max_tokens,
            "rate_limit_per_hour": cls.rate_limit_per_hour,
            "max_message_length": cls.max_message_length,
            "max_messages": cls.max_messages,
            "cors_origins": cls.cors_origins,
            "allow_config_update": cls.allow_config_update,
        }

    @classmethod
    def update_from_dict(cls, data: dict):
        for key in ("openai_base_url",
                     "answer_model", "critique_model", "cors_origins"):
            if key in data:
                setattr(cls, key, data[key])
        for key, (lo, hi) in {
            "max_tokens": (1, 128000),
            "rate_limit_per_hour": (1, 10000),
            "max_message_length": (1, 100000),
            "max_messages": (1, 500),
        }.items():
            if key in data:
                val = int(data[key])
                if val < lo or val > hi:
                    raise ValueError(f"{key} must be between {lo} and {hi}")
                setattr(cls, key, val)


config = Config()
