"""
Risk Agent — Identifies system-wide risks from the PRD.

These are HIGH-LEVEL risks for the entire feature.
Per-test-case risks are generated in testcase_agent.py.
"""

from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig


class RiskItem(BaseModel):
    id: str             # RISK-001, RISK-002, ...
    severity: str       # HIGH | MEDIUM | LOW
    category: str       # security | data | integration | performance | ux | compliance
    description: str    # what the risk is
    impact: str         # what happens if this risk materializes
    mitigation: str     # how to reduce/prevent it


class RiskOutput(BaseModel):
    risks: List[RiskItem]


SYSTEM_PROMPT = (
    "You are a Risk Analyst specializing in software QA. "
    "Identify system-level risks that QA must test for. "
    "Be specific to the feature — no generic platitudes. "
    "Return JSON only."
)


async def generate_risks(prd_content: str, config: LLMConfig) -> List[RiskItem]:
    """Generate 5-8 system-wide risks from the PRD."""

    prd_trimmed = prd_content[:2500]

    user_msg = f"""PRD:
{prd_trimmed}

Identify 5-8 KEY RISKS that QA must test for this feature.

Categories to consider:
- security: data exposure, auth bypass, injection attacks
- data: data loss, corruption, inconsistency between modules
- integration: third-party service failures, API contract breaks
- performance: slow response under load, memory leaks, timeout cascades
- ux: confusing error messages, broken flows, accessibility
- compliance: GDPR, audit trail, data retention

For each risk, be specific to THIS feature — not generic.

Return JSON:
{{
  "risks": [
    {{
      "id": "RISK-001",
      "severity": "HIGH",
      "category": "security",
      "description": "...",
      "impact": "...",
      "mitigation": "..."
    }}
  ]
}}"""

    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=user_msg,
        schema=RiskOutput,
        temperature=0.15,
    )
    return result.risks