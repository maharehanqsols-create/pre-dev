from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig


class RiskItem(BaseModel):
    id: str
    category: str
    description: str
    severity: str
    mitigation: str


class RiskOutput(BaseModel):
    risks: List[RiskItem]


SYSTEM_PROMPT = (
    "You are a QA Risk Analyst. "
    "Identify testing risks from the PRD. "
    "Return JSON only."
)


async def generate_risks(prd_content: str, config: LLMConfig) -> List[RiskItem]:
    prd_short = prd_content[:1500]

    user_msg = (
        f"PRD:\n{prd_short}\n\n"
        "Generate 4-6 risks. "
        "category: security/performance/integration/data/ux. "
        "severity: HIGH/MEDIUM/LOW. "
        "IDs: RISK-001, RISK-002, ..."
    )

    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=user_msg,
        schema=RiskOutput,
        temperature=0.1,
    )
    return result.risks