from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig, ScenarioCategory, RiskDetail, LimitDetail


class Scenario(BaseModel):
    id:          str
    title:       str
    category:    ScenarioCategory
    description: str = ""
    steps:       List[str]       = []
    risks:       List[RiskDetail]  = []
    limitations: List[LimitDetail] = []


class ScenarioOutput(BaseModel):
    scenarios: List[Scenario]


SYSTEM_PROMPT = (
    "You are a QA Analyst. "
    "Extract test scenarios from PRD. "
    "Return only valid JSON. "
    "Do not include markdown, explanation, or any extra text."
)


async def generate_scenarios(prd_content: str, config: LLMConfig) -> List[Scenario]:
    prd_short = prd_content[:4000]

    user_msg = f"""PRD:
{prd_short}

Generate 12-18 test scenarios covering ALL six categories:
functional, negative, boundary, edge_case, security, performance.

Return only valid JSON in this exact format:
{{
  "scenarios": [
    {{
      "id": "SCN-001",
      "title": "Valid course assignment triggers email notification",
      "category": "functional",
      "description": "Verify that assigning a course via Assign by Role sends the correct email.",
      "steps": ["Assign course to role", "Check employee inbox"],
      "risks": [
        {{"severity": "MEDIUM", "description": "Email not sent", "mitigation": "Retry logic"}}
      ],
      "limitations": [
        {{"type": "scope_gap", "description": "Password recovery not covered"}}
      ]
    }}
  ]
}}"""

    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=user_msg,
        schema=ScenarioOutput,
        temperature=0.1,
    )
    return result.scenarios