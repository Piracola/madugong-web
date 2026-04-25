"""
完整 HTTP SSE 测试：启动真实后端，发送请求，检查 SSE 事件流。
运行方式：cd backend && ./venv/Scripts/python.exe test_full_sse.py
"""
import asyncio
import json
import time
import sys
sys.path.insert(0, ".")

from httpx import AsyncClient, ASGITransport

# 先 import 让模块初始化完成
from main import app


async def main():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        print("发送 POST /api/chat ...")
        start = time.time()
        events = []
        raw_lines = []

        try:
            async with client.stream(
                "POST",
                "/api/chat",
                json={"messages": [{"role": "user", "content": "什么是工业文明？"}]},
                timeout=300,
            ) as response:
                print(f"HTTP {response.status_code}")
                print(f"Content-Type: {response.headers.get('content-type')}")

                async for line in response.aiter_lines():
                    elapsed = time.time() - start
                    line = line.strip()
                    if not line:
                        continue
                    raw_lines.append(line)
                    print(f"  [{elapsed:.1f}s] {line[:120]}")

                    if line.startswith("data: "):
                        try:
                            event = json.loads(line[6:])
                            events.append({"elapsed": elapsed, "event": event})
                        except json.JSONDecodeError as e:
                            print(f"    !! JSON 解析失败: {e}")

        except Exception as e:
            elapsed = time.time() - start
            print(f"\n!! 异常 [{elapsed:.1f}s]: {type(e).__name__}: {e}")

        total = time.time() - start
        print(f"\n{'='*60}")
        print(f"总耗时: {total:.1f}s")
        print(f"原始行数: {len(raw_lines)}")
        print(f"SSE 事件数: {len(events)}")
        if events:
            types = [e["event"].get("type") for e in events]
            print(f"事件类型: {types}")

            # 检查是否有 done
            if "done" in types:
                print("✓ 收到 done 事件")
            else:
                print("✗ 未收到 done 事件！")

            # 检查 metadata
            metadata = [e for e in events if e["event"].get("type") == "metadata"]
            if metadata:
                m = metadata[0]["event"]
                print(f"✓ metadata: original_len={len(m.get('original',''))}, corrections={len(m.get('corrections',[]))}")
            else:
                print("✗ 未收到 metadata 事件！")

            # 检查 chunks
            chunks = [e for e in events if e["event"].get("type") == "chunk"]
            if chunks:
                full_text = "".join(e["event"]["content"] for e in chunks)
                print(f"✓ chunks: {len(chunks)} 个, 拼接长度={len(full_text)}")
                print(f"  拼接内容: {full_text[:100]}...")
            else:
                print("✗ 未收到 chunk 事件！")
        else:
            print("✗ 没有收到任何 SSE 事件！")


if __name__ == "__main__":
    asyncio.run(main())
