from pydantic import BaseModel, field_validator

from config import config


class ChatMessage(BaseModel):
    role: str
    content: str

    @field_validator('role')
    @classmethod
    def check_role(cls, v: str) -> str:
        if v not in ('user', 'assistant'):
            raise ValueError("Role must be 'user' or 'assistant'")
        return v

    @field_validator('content')
    @classmethod
    def check_content_length(cls, v: str) -> str:
        max_len = getattr(config, 'max_message_length', 2000)
        if len(v) > max_len:
            raise ValueError(f"Content exceeds maximum length of {max_len}")
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessage]

    @field_validator('messages')
    @classmethod
    def check_messages_not_empty(cls, v: list[ChatMessage]) -> list[ChatMessage]:
        if not v:
            raise ValueError("Messages cannot be empty")
        max_messages = getattr(config, 'max_messages', 50)
        if len(v) > max_messages:
            raise ValueError(f"Messages exceed maximum count of {max_messages}")
        return v
