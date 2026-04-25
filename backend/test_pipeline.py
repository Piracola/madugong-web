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
    """Mock LLM router，模拟一个耗时 5 秒的 LLM 调用"""
    async def fake_chat_completion(system_prompt, messages, model, stream=False, json_mode=False, max_tokens=None):
        # 模拟 LLM 延迟
        await asyncio.sleep(2)
        if json_mode:
            # critique agent 期望 JSON 响应
            return json.dumps({
                "corrections": [{"rule": "测试规则", "original": "原文", "corrected": "修正"}],
                "corrected_text": "这是修正后的回答文本，用于测试流式输出。",
            }, ensure_ascii=False)
        # answer agent 期望纯文本
        return "这是初始回答的草稿文本。"

    with patch("agents.answer_agent.generate_answer", new_callable=AsyncMock) as mock_answer, \
         patch("agents.critique_agent.critique_and_correct", new_callable=AsyncMock) as mock_critique:

        async def fake_generate_answer(messages):
            await asyncio.sleep(2)
            return "这是初始回答的草稿文本。"

        async def fake_critique(user_question, draft):
            await asyncio.sleep(2)
            return {
                "corrections": [{"rule": "测试规则", "original": "原文", "corrected": "修正"}],
                "corrected_text": "这是修正后的回答文本，用于测试流式输出。",
            }

        mock_answer.side_effect = fake_generate_answer
        mock_critique.side_effect = fake_critique
        yield mock_answer, mock_critique


@pytest.mark.asyncio
async def test_orchestrator_streaming(mock_llm):
    """测试 orchestrator 的 SSE 流式输出是否完整"""
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

    assert "metadata" in types, "缺少 metadata 事件"
    assert "chunk" in types, "缺少 chunk 事件"
    assert "done" in types, "缺少 done 事件"
    assert types[-1] == "done", "done 事件应该是最后一个"

    # 验证 metadata 包含 original 和 corrections
    metadata_event = next(e["event"] for e in events if e["event"]["type"] == "metadata")
    assert metadata_event.get("original"), "metadata 缺少 original"
    assert metadata_event.get("corrections"), "metadata 缺少 corrections"

    # 验证 chunks 拼接后是完整文本
    chunks = [e["event"]["content"] for e in events if e["event"]["type"] == "chunk"]
    full_text = "".join(chunks)
    print(f"  拼接文本: {full_text}")
    assert full_text == "这是修正后的回答文本，用于测试流式输出。", f"拼接文本不匹配: {full_text}"


@pytest.mark.asyncio
async def test_orchestrator_timing():
    """测试两个 LLM 调用都耗时较长时，keep-alive 是否正常工作"""
    from orchestrator import process_chat

    async def slow_generate_answer(messages):
        await asyncio.sleep(35)  # 超过 30s timeout，触发 keep-alive
        return "慢速回答"

    async def slow_critique(user_question, draft):
        await asyncio.sleep(35)
        return {
            "corrections": [],
            "corrected_text": "修正后的慢速回答",
        }

    with patch("orchestrator.generate_answer", side_effect=slow_generate_answer), \
         patch("orchestrator.critique_and_correct", side_effect=slow_critique):

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
        assert len(status_events) >= 1, "35s 延迟应该触发至少 1 个 keep-alive"

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
        return {
            "corrections": [],
            "corrected_text": "修正后的快速回答",
        }

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

            assert "metadata" in types
            assert "done" in types


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
