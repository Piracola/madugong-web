import sys

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, ".")

from main import app


@pytest.mark.asyncio
async def test_chat_rejects_multi_turn_history():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/chat",
            json={
                "messages": [
                    {"role": "user", "content": "第一问"},
                    {"role": "assistant", "content": "第一答"},
                    {"role": "user", "content": "第二问"},
                ]
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "每个历史记录仅允许进行一轮对话，请新建对话后再提问"
