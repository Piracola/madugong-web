"""
端到端测试：mock LLM 调用，验证 SSE 流水线是否正常工作。
运行方式：cd backend && python -m pytest test_pipeline.py -v -s
"""
import asyncio
import json
import sys
import time
from unittest.mock import AsyncMock, patch

import pytest

# 确保 backend 目录在 sys.path 中
sys.path.insert(0, ".")


@pytest.fixture
def mock_llm():
    """Mock 两个 agent，模拟当前纯文本 SSE 协议。"""
    with patch("orchestrator.generate_answer", new_callable=AsyncMock) as mock_answer, \
         patch("orchestrator.critique_and_correct", new_callable=AsyncMock) as mock_critique:

        async def fake_generate_answer(messages):
            await asyncio.sleep(0.05)
            return "<think>这段思维链不应该传给审查 agent</think>\n这是初始回答的草稿文本。"

        async def fake_critique(user_question, draft):
            await asyncio.sleep(0.05)
            assert draft == "这是初始回答的草稿文本。"
            return "这是修正后的回答文本，用于测试流式输出。"

        mock_answer.side_effect = fake_generate_answer
        mock_critique.side_effect = fake_critique
        yield mock_answer, mock_critique


@pytest.mark.asyncio
async def test_orchestrator_streaming(mock_llm):
    """测试 orchestrator 的 SSE 流式输出是否完整，且不会把 think 内容送入审查阶段。"""
    from orchestrator import process_chat

    messages = [{"role": "user", "content": "测试问题"}]
    events = []
    start = time.time()

    async for line in process_chat(messages):
        elapsed = time.time() - start
        line_str = line.strip()
        if line_str.startswith("data: "):
            event_data = json.loads(line_str[6:])
            events.append({"elapsed": round(elapsed, 2), "event": event_data})
            print(f"  [{elapsed:.2f}s] SSE event: type={event_data.get('type')}, content_len={len(event_data.get('content', ''))}")

    total_time = time.time() - start
    print(f"\n  总耗时: {total_time:.2f}s")
    print(f"  事件总数: {len(events)}")

    # 验证事件序列
    types = [e["event"]["type"] for e in events]
    print(f"  事件类型序列: {types}")

    assert "chunk" in types, "缺少 chunk 事件"
    assert "done" in types, "缺少 done 事件"
    assert types[-1] == "done", "done 事件应该是最后一个"
    assert "error" not in types, "不应出现 error 事件"

    # 验证 chunks 拼接后是完整文本
    chunks = [e["event"]["content"] for e in events if e["event"]["type"] == "chunk"]
    full_text = "".join(chunks)
    print(f"  拼接文本: {full_text}")
    assert full_text == "这是修正后的回答文本，用于测试流式输出。", f"拼接文本不匹配: {full_text}"


@pytest.mark.asyncio
async def test_orchestrator_timing():
    """测试两个 LLM 调用都耗时较长时，keep-alive 是否正常工作"""
    from orchestrator import process_chat

    real_wait_for = asyncio.wait_for
    wait_for_calls = 0

    async def slow_generate_answer(messages):
        await asyncio.sleep(0.02)
        return "慢速回答"

    async def slow_critique(user_question, draft):
        await asyncio.sleep(0.02)
        return "修正后的慢速回答"

    async def fake_wait_for(awaitable, timeout):
        nonlocal wait_for_calls
        wait_for_calls += 1
        if wait_for_calls in (1, 3):
            raise asyncio.TimeoutError
        return await real_wait_for(awaitable, timeout=1)

    with patch("orchestrator.generate_answer", side_effect=slow_generate_answer), \
         patch("orchestrator.critique_and_correct", side_effect=slow_critique), \
         patch("orchestrator.asyncio.wait_for", side_effect=fake_wait_for):

        messages = [{"role": "user", "content": "测试慢速"}]
        events = []
        start = time.time()

        async for line in process_chat(messages):
            elapsed = time.time() - start
            line_str = line.strip()
            if line_str.startswith("data: "):
                event_data = json.loads(line_str[6:])
                events.append({"elapsed": round(elapsed, 2), "event": event_data})
                print(f"  [{elapsed:.2f}s] SSE event: type={event_data.get('type')}, content={event_data.get('content', '')[:30]}")

        total_time = time.time() - start
        print(f"\n  总耗时: {total_time:.2f}s")

        types = [e["event"]["type"] for e in events]
        print(f"  事件类型序列: {types}")

        # 应该有 keep-alive status 事件
        status_events = [e for e in events if e["event"]["type"] == "status"]
        print(f"  keep-alive 事件数: {len(status_events)}")
        assert len(status_events) >= 2, "两个阶段都应至少触发一次 keep-alive"
        assert status_events[0]["event"]["content"] == "thinking"
        assert status_events[1]["event"]["content"] == "analyzing"

        # 最终应该有 done
        assert types[-1] == "done", "最终应有 done 事件"


@pytest.mark.asyncio
async def test_http_streaming():
    """测试 HTTP 层面 SSE 流是否正常"""
    from httpx import AsyncClient, ASGITransport
    from main import app

    async def fast_generate_answer(messages):
        await asyncio.sleep(0.5)
        return "快速回答"

    async def fast_critique(user_question, draft):
        await asyncio.sleep(0.5)
        return "修正后的快速回答"

    with patch("orchestrator.generate_answer", side_effect=fast_generate_answer), \
         patch("orchestrator.critique_and_correct", side_effect=fast_critique):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            events = []
            start = time.time()

            async with client.stream("POST", "/api/chat",
                                      json={"messages": [{"role": "user", "content": "你好"}]},
                                      timeout=30) as response:
                assert response.status_code == 200
                print(f"  HTTP 状态码: {response.status_code}")
                print(f"  Content-Type: {response.headers.get('content-type')}")

                async for line in response.aiter_lines():
                    elapsed = time.time() - start
                    line = line.strip()
                    if not line:
                        continue
                    print(f"  [{elapsed:.2f}s] RAW line: {line[:100]}")
                    if line.startswith("data: "):
                        try:
                            event_data = json.loads(line[6:])
                            events.append(event_data)
                        except json.JSONDecodeError:
                            print(f"    !! JSON 解析失败")

            total_time = time.time() - start
            print(f"\n  总耗时: {total_time:.2f}s")
            print(f"  收到事件数: {len(events)}")
            types = [e.get("type") for e in events]
            print(f"  事件类型: {types}")

            assert "chunk" in types
            assert "done" in types


def test_strip_think_blocks():
    from orchestrator import strip_think_blocks

    text = "<think>内部推理</think>\n答案A\n<think>再来一段</think>\n答案B"
    stripped = strip_think_blocks(text)
    assert "<think>" not in stripped.lower()
    assert "答案A" in stripped
    assert "答案B" in stripped

    unterminated = "答案前缀\n<think>没有闭合"
    assert strip_think_blocks(unterminated) == "答案前缀"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
