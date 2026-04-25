import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    answer_model: str = os.getenv("ANSWER_MODEL", "gpt-4o-mini")
    critique_model: str = os.getenv("CRITIQUE_MODEL", "gpt-4o")
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    max_tokens: int = int(os.getenv("MAX_TOKENS", "4096"))
    rate_limit_per_hour: int = int(os.getenv("RATE_LIMIT_PER_HOUR", "30"))
    max_message_length: int = int(os.getenv("MAX_MESSAGE_LENGTH", "2000"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    allow_config_update: bool = os.getenv("ALLOW_CONFIG_UPDATE", "false").lower() == "true"

    @classmethod
    def validate(cls):
        if not cls.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set")

    @classmethod
    def to_dict(cls) -> dict:
        return {
            "openai_api_key": cls.openai_api_key,
            "openai_base_url": cls.openai_base_url,
            "answer_model": cls.answer_model,
            "critique_model": cls.critique_model,
            "max_tokens": cls.max_tokens,
            "rate_limit_per_hour": cls.rate_limit_per_hour,
            "max_message_length": cls.max_message_length,
            "cors_origins": cls.cors_origins,
            "allow_config_update": cls.allow_config_update,
        }

    @classmethod
    def update_from_dict(cls, data: dict):
        for key in ("openai_api_key", "openai_base_url",
                    "answer_model", "critique_model", "cors_origins"):
            if key in data:
                setattr(cls, key, data[key])
        for key in ("max_tokens", "rate_limit_per_hour", "max_message_length"):
            if key in data:
                setattr(cls, key, int(data[key]))
        if "allow_config_update" in data:
            cls.allow_config_update = bool(data["allow_config_update"])


config = Config()
