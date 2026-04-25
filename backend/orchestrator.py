import json
import asyncio
from typing import AsyncGenerator

from agents.answer_agent import generate_answer
from agents.critique_agent import critique_and_correct


async def process_chat(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Agent 1 → Agent 2 流水线，输出 SSE 事件"""
    try:
        user_question = messages[-1]["content"] if messages else ""

        # Step 1: Agent 1 生成回答（每 30s 发送 keep-alive 防止 Cloudflare 504）
        task = asyncio.create_task(generate_answer(messages))
        while True:
            try:
                draft = await asyncio.wait_for(asyncio.shield(task), timeout=30)
                break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'status', 'content': 'thinking'}, ensure_ascii=False)}\n\n"

        # Step 2: Agent 2 风格修正（同样每 30s keep-alive）
        task = asyncio.create_task(critique_and_correct(user_question, draft))
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
        error_event = {"type": "error", "message": str(e)}
        yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
