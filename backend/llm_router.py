import asyncio
import random
from typing import AsyncGenerator

import openai
from openai import AsyncOpenAI

from config import config


class LLMRouter:
    def __init__(self):
        self._init_client()

    def _init_client(self):
        self.openai = AsyncOpenAI(
            api_key=config.openai_api_key,
            base_url=config.openai_base_url,
            max_retries=0,
            timeout=120,
        )

    def reload(self):
        """Config changed at runtime, re-initialize client."""
        self._init_client()

    async def chat_completion(
        self,
        system_prompt: str,
        messages: list[dict],
        model: str,
        stream: bool = False,
        json_mode: bool = False,
        max_tokens: int | None = None,
    ) -> str | AsyncGenerator[str, None]:
        mt = max_tokens or config.max_tokens
        return await self._call_openai(system_prompt, messages, model, stream, json_mode, mt)

    async def chat_completion_collected(
        self,
        system_prompt: str,
        messages: list[dict],
        model: str,
        json_mode: bool = False,
        max_tokens: int | None = None,
    ) -> str:
        """对上游 API 始终使用 stream=True 以避免代理超时，但返回收集后的完整文本。"""
        mt = max_tokens or config.max_tokens
        all_messages = [{"role": "system", "content": system_prompt}] + messages

        kwargs: dict = {
            "model": model,
            "messages": all_messages,
            "max_tokens": mt,
            "stream": True,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        max_attempts = 3
        last_exc = None
        for attempt in range(max_attempts):
            try:
                response = await self.openai.chat.completions.create(**kwargs)
                collected = []
                async for chunk in response:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if delta and delta.content:
                        collected.append(delta.content)
                result = "".join(collected)
                if not result.strip():
                    raise ValueError("Model returned empty content")
                return result
            except (
                openai.RateLimitError,
                openai.InternalServerError,
                openai.APIConnectionError,
                openai.APITimeoutError,
            ) as e:
                last_exc = e
                if attempt == max_attempts - 1:
                    break

                wait = min(2 ** (attempt + 1), 120) + random.uniform(0, 1)
                if isinstance(e, openai.RateLimitError):
                    retry_after = getattr(e, "retry_after", None)
                    if retry_after is None and hasattr(e, "response") and e.response is not None:
                        retry_after = e.response.headers.get("retry-after")
                    if retry_after is not None:
                        wait = float(retry_after) + random.uniform(0, 1)

                await asyncio.sleep(wait)

        raise last_exc

    async def _call_openai(
        self,
        system_prompt: str,
        messages: list[dict],
        model: str,
        stream: bool,
        json_mode: bool,
        max_tokens: int,
    ) -> str | AsyncGenerator[str, None]:
        all_messages = [{"role": "system", "content": system_prompt}] + messages

        kwargs: dict = {
            "model": model,
            "messages": all_messages,
            "max_tokens": max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        if stream:
            kwargs["stream"] = True

        max_attempts = 3
        last_exc = None
        for attempt in range(max_attempts):
            try:
                response = await self.openai.chat.completions.create(**kwargs)

                if stream:
                    return self._stream_openai(response)
                return response.choices[0].message.content  # type: ignore
            except (
                openai.RateLimitError,
                openai.InternalServerError,
                openai.APIConnectionError,
                openai.APITimeoutError,
            ) as e:
                last_exc = e
                if attempt == max_attempts - 1:
                    break

                wait = min(2 ** (attempt + 1), 120) + random.uniform(0, 1)
                if isinstance(e, openai.RateLimitError):
                    retry_after = getattr(e, "retry_after", None)
                    if retry_after is None and hasattr(e, "response") and e.response is not None:
                        retry_after = e.response.headers.get("retry-after")
                    if retry_after is not None:
                        wait = float(retry_after) + random.uniform(0, 1)

                await asyncio.sleep(wait)

        raise last_exc

    async def _stream_openai(self, response) -> AsyncGenerator[str, None]:
        async for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content


router = LLMRouter()
