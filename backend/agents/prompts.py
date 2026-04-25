from pathlib import Path

_PROMPT_DIR = Path(__file__).resolve().parent.parent
_ANSWER_PROMPT_FILE = _PROMPT_DIR.parent / "answer-prompt.md"
_CRITIQUE_PROMPT_FILE = _PROMPT_DIR.parent / "critique-prompt.md"


def get_answer_system_prompt() -> str:
    """Agent 1 的完整系统提示词，直接读取 answer-prompt.md"""
    return _ANSWER_PROMPT_FILE.read_text(encoding="utf-8")


def get_critique_system_prompt() -> str:
    """Agent 2 的风格校对提示词，直接读取 critique-prompt.md"""
    return _CRITIQUE_PROMPT_FILE.read_text(encoding="utf-8")
