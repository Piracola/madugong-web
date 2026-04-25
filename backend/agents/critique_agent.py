import json

from llm_router import router
from agents.prompts import get_critique_system_prompt
from config import config


async def critique_and_correct(user_question: str, draft: str) -> str:
    """Agent 2: 风格勘误，直接返回修正后的完整文本"""
    system_prompt = get_critique_system_prompt()
    user_message = json.dumps(
        {"user_question": user_question, "draft": draft},
        ensure_ascii=False,
    )

    response = await router.chat_completion_collected(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        model=config.critique_model,
    )
    return str(response).strip() or draft
