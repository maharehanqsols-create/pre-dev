from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig


class LimitationItem(BaseModel):
    id: str
    type: str
    description: str
    impact: str


class LimitationOutput(BaseModel):
    limitations: List[LimitationItem]


SYSTEM_PROMPT = (
    "You are a QA Engineer. "
    "Identify PRD limitations and gaps. "
    "Return JSON only."
)


async def generate_limitations(prd_content: str, config: LLMConfig) -> List[LimitationItem]:
    prd_short = prd_content[:1500]

    user_msg = (
        f"PRD:\n{prd_short}\n\n"
        "Generate 3-5 limitations. "
        "type: scope_gap/assumption/out_of_scope/dependency. "
        "IDs: LIM-001, LIM-002, ..."
    )

    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=user_msg,
        schema=LimitationOutput,
        temperature=0.1,
    )
    return result.limitations