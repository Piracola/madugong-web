import json
import asyncio
import re
from typing import AsyncGenerator

from agents.answer_agent import generate_answer
from agents.critique_agent import critique_and_correct


# 用于减少 prompt injection 风险的特殊标记
_USER_CONTENT_START = "<|USER_CONTENT|>"
_USER_CONTENT_END = "<|END_USER_CONTENT|>"
_THINK_BLOCK_RE = re.compile(r"<think\b[^>]*>.*?</think>", re.IGNORECASE | re.DOTALL)
_TRAILING_THINK_RE = re.compile(r"<think\b[^>]*>.*$", re.IGNORECASE | re.DOTALL)


def sanitize_user_input(text: str) -> str:
    """清理用户输入：截断控制字符，移除分隔符避免破坏结构"""
    if not text:
        return text
    # 移除用户可能用来逃逸上下文的特殊标记
    text = text.replace(_USER_CONTENT_START, "")
    text = text.replace(_USER_CONTENT_END, "")
    # 移除控制字符（保留换行、制表符）
    text = "".join(ch for ch in text if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    return text.strip()


def wrap_user_messages(messages: list[dict]) -> list[dict]:
    """用显式标记包裹用户消息内容，降低 prompt injection 成功率"""
    wrapped = []
    for msg in messages:
        content = msg.get("content", "")
        safe_content = sanitize_user_input(content)
        if msg.get("role") == "user":
            safe_content = f"{_USER_CONTENT_START}\n{safe_content}\n{_USER_CONTENT_END}"
        wrapped.append({"role": msg.get("role", "user"), "content": safe_content})
    return wrapped


def strip_think_blocks(text: str) -> str:
    """移除上游模型输出中的 <think> 思维链块，避免传入审查 agent。"""
    if not text:
        return text

    cleaned = _THINK_BLOCK_RE.sub("", text)
    cleaned = _TRAILING_THINK_RE.sub("", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def get_safe_error_message(exc: Exception) -> str:
    """将异常映射为安全的用户可见错误信息"""
    from openai import (
        RateLimitError,
        AuthenticationError,
        PermissionDeniedError,
        BadRequestError,
        APIConnectionError,
        APITimeoutError,
        InternalServerError,
    )

    if isinstance(exc, RateLimitError):
        return "上游服务繁忙，请稍后再试"
    if isinstance(exc, (AuthenticationError, PermissionDeniedError)):
        return "服务认证失败，请联系管理员"
    if isinstance(exc, BadRequestError):
        return "请求内容不符合规范，请调整后重试"
    if isinstance(exc, (APIConnectionError, APITimeoutError, InternalServerError)):
        return "连接上游服务异常，请稍后再试"
    if isinstance(exc, ValueError):
        return "请求处理失败，请检查输入内容"
    return "服务内部错误，请稍后再试"


async def process_chat(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Agent 1 → Agent 2 流水线，输出 SSE 事件"""
    # 先对原始消息做清理，用于 critique agent 的 user_question 保持原始语义
    sanitized_messages = []
    for msg in messages:
        sanitized_messages.append({
            "role": msg.get("role", "user"),
            "content": sanitize_user_input(msg.get("content", "")),
        })

    # 再用标记包裹用户消息，用于 answer agent 防止 prompt injection
    safe_messages = wrap_user_messages(messages)
    try:
        user_question = sanitized_messages[-1]["content"] if sanitized_messages else ""

        # Step 1: Agent 1 生成回答（每 30s 发送 keep-alive 防止 Cloudflare 504）
        task = asyncio.create_task(generate_answer(safe_messages))
        while True:
            try:
                draft = await asyncio.wait_for(asyncio.shield(task), timeout=30)
                break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'status', 'content': 'thinking'}, ensure_ascii=False)}\n\n"

        # Step 2: Agent 2 风格修正（同样每 30s keep-alive）
        critique_draft = strip_think_blocks(draft)
        task = asyncio.create_task(critique_and_correct(user_question, critique_draft))
        while True:
            try:
                corrected_text = await asyncio.wait_for(asyncio.shield(task), timeout=30)
                break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'status', 'content': 'analyzing'}, ensure_ascii=False)}\n\n"

        # Step 3: 逐块推送修正后文本
        chunk_size = 8
        for i in range(0, len(corrected_text), chunk_size):
            chunk = corrected_text[i : i + chunk_size]
            chunk_event = {"type": "chunk", "content": chunk}
            yield f"data: {json.dumps(chunk_event, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.01)

        # Step 4: 结束
        yield "data: {\"type\": \"done\"}\n\n"
    except Exception as e:
        safe_message = get_safe_error_message(e)
        error_event = {"type": "error", "message": safe_message}
        yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
