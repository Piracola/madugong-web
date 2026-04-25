from pathlib import Path

_PROMPT_DIR = Path(__file__).resolve().parent.parent
_ANSWER_PROMPT_FILE = _PROMPT_DIR.parent / "answer-prompt.md"
_CRITIQUE_PROMPT_FILE = _PROMPT_DIR.parent / "critique-prompt.md"

_FALLBACK_ANSWER_PROMPT = "你是一个有用的助手，请根据用户的问题给出准确的回答。"
_FALLBACK_CRITIQUE_PROMPT = "你是一个文本校对助手，检查并修正文本中的明显错误。"


def get_answer_system_prompt() -> str:
    try:
        return _ANSWER_PROMPT_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        return _FALLBACK_ANSWER_PROMPT


def get_critique_system_prompt() -> str:
    try:
        return _CRITIQUE_PROMPT_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        return _FALLBACK_CRITIQUE_PROMPT
