from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig, ScenarioCategory


class Scenario(BaseModel):
    id: str
    title: str
    category: ScenarioCategory


class ScenarioOutput(BaseModel):
    scenarios: List[Scenario]


SYSTEM_PROMPT = (
    "You are a QA Analyst. "
    "Extract test scenarios from the PRD. "
    "Return JSON only."
)


async def generate_scenarios(prd_content: str, config: LLMConfig) -> List[Scenario]:
    # Keep input short — local models have small context windows
    prd_short = prd_content[:2000]

    user_msg = (
        f"PRD:\n{prd_short}\n\n"
        "Generate 8-12 test scenarios. "
        "Categories must be: functional, negative, or boundary. "
        "IDs: SCN-001, SCN-002, ..."
    )

    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=user_msg,
        schema=ScenarioOutput,
        temperature=0.1,
    )
    return result.scenarios