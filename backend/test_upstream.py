"""
直接测试上游 API，验证 stream=True 是否能避免 Cloudflare 504。
运行方式：cd backend && ./venv/Scripts/python.exe test_upstream.py
"""
import asyncio
import time
import sys
sys.path.insert(0, ".")

from config import config
from openai import AsyncOpenAI


async def test_non_streaming():
    """stream=False — 可能触发 Cloudflare 504"""
    client = AsyncOpenAI(
        api_key=config.openai_api_key,
        base_url=config.openai_base_url,
        timeout=120,
    )
    print(f"[non-stream] 调用 {config.answer_model} ...")
    start = time.time()
    try:
        resp = await client.chat.completions.create(
            model=config.answer_model,
            messages=[
                {"role": "system", "content": "你是一个测试助手。请用中文回答。"},
                {"role": "user", "content": "请简短介绍什么是云计算。"},
            ],
            max_tokens=500,
            stream=False,
        )
        elapsed = time.time() - start
        text = resp.choices[0].message.content
        print(f"[non-stream] 成功，耗时 {elapsed:.1f}s，长度 {len(text)} 字")
        print(f"[non-stream] 内容: {text[:100]}...")
    except Exception as e:
        elapsed = time.time() - start
        print(f"[non-stream] 失败，耗时 {elapsed:.1f}s")
        print(f"[non-stream] 错误: {type(e).__name__}: {e}")


async def test_streaming():
    """stream=True — Cloudflare 看到持续数据流"""
    client = AsyncOpenAI(
        api_key=config.openai_api_key,
        base_url=config.openai_base_url,
        timeout=120,
    )
    print(f"\n[stream] 调用 {config.answer_model} ...")
    start = time.time()
    try:
        resp = await client.chat.completions.create(
            model=config.answer_model,
            messages=[
                {"role": "system", "content": "你是一个测试助手。请用中文回答。"},
                {"role": "user", "content": "请简短介绍什么是云计算。"},
            ],
            max_tokens=500,
            stream=True,
        )
        collected = []
        chunk_count = 0
        first_chunk_time = None
        async for chunk in resp:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                if first_chunk_time is None:
                    first_chunk_time = time.time() - start
                collected.append(delta.content)
                chunk_count += 1

        elapsed = time.time() - start
        text = "".join(collected)
        print(f"[stream] 成功，耗时 {elapsed:.1f}s，首块延迟 {first_chunk_time:.1f}s，{chunk_count} 个块，长度 {len(text)} 字")
        print(f"[stream] 内容: {text[:100]}...")
    except Exception as e:
        elapsed = time.time() - start
        print(f"[stream] 失败，耗时 {elapsed:.1f}s")
        print(f"[stream] 错误: {type(e).__name__}: {e}")


async def main():
    print(f"API: {config.openai_base_url}")
    print(f"Model: {config.answer_model}")
    print("=" * 60)

    await test_streaming()
    print()
    await test_non_streaming()


if __name__ == "__main__":
    asyncio.run(main())
