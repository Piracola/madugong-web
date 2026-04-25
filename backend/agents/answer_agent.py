from llm_router import router
from agents.prompts import get_answer_system_prompt
from config import config


async def generate_answer(messages: list[dict]) -> str:
    """Agent 1: 根据 answer-prompt.md 生成初始回答"""
    system_prompt = get_answer_system_prompt()
    response = await router.chat_completion_collected(
        system_prompt=system_prompt,
        messages=messages,
        model=config.answer_model,
    )
    return str(response)
