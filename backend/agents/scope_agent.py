"""
Scope Agent — Analyzes a user story and decides:
  1. Is it a single module or multi-module feature?
  2. If multi-module, what are the individual modules?

This is a cheap, fast LLM call done BEFORE PRD generation.
It prevents 524 timeouts by breaking large stories into small chunks.
"""

from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured, llm_complete, LLMConfig
from backend.models.schema import LLMConfig


class ModuleInfo(BaseModel):
    name: str           # e.g. "Authentication", "Payment", "Notifications"
    focus: str          # 1-line description of what this module covers


class ScopeAnalysis(BaseModel):
    is_complex: bool            # True = needs module split
    reason: str                 # Why it's complex or simple
    modules: List[ModuleInfo]   # Empty list if is_complex=False


SYSTEM_PROMPT = (
    "You are a senior software architect. "
    "Analyze user stories and identify distinct functional modules. "
    "A module is a self-contained area of functionality (e.g. Auth, Payments, Notifications). "
    "Return JSON only. No explanation outside JSON."
)


async def analyze_scope(user_story: str, config: LLMConfig) -> ScopeAnalysis:
    """
    Analyze user story scope.
    Returns ScopeAnalysis with is_complex=True and modules list if story needs splitting.
    """

    user_msg = f"""User Story:
{user_story}

Analyze this and determine:
1. Does it cover MORE THAN ONE distinct functional module?
   - Single module: one clear feature (e.g. "reset password", "add to cart")
   - Multi-module: touches multiple areas (e.g. "user registration with email verification,
     profile setup, and welcome notifications")

2. If multi-module, list each module with a 1-line focus description.

Rules:
- Be conservative: split only when modules are truly distinct (different DB tables, different APIs)
- Max 5 modules
- Module names: short (1-3 words), PascalCase

Return JSON matching this exact structure:
{{
  "is_complex": true/false,
  "reason": "one sentence explanation",
  "modules": [
    {{"name": "ModuleName", "focus": "what this module handles"}},
    ...
  ]
}}

If is_complex is false, modules must be an empty array [].
"""

    try:
        result = await llm_structured(
            config=config,
            system=SYSTEM_PROMPT,
            user=user_msg,
            schema=ScopeAnalysis,
            temperature=0.1,
        )
        return result
    except Exception as e:
        # If scope analysis fails, treat as single module — safe fallback
        print(f"Scope analysis failed (fallback to single): {e}")
        return ScopeAnalysis(
            is_complex=False,
            reason="Scope analysis failed — treating as single module",
            modules=[],
        )