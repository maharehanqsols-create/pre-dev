from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig, Priority, RiskDetail
from backend.agents.scenario_agent import Scenario


class GherkinStep(BaseModel):
    keyword: str
    text:    str


class TestCase(BaseModel):
    scenario_id:  str
    title:        str
    priority:     Priority
    tags:         List[str]
    preconditions: List[str]
    gherkin_steps: List[GherkinStep]
    risks:         List[RiskDetail]   # ← shared type, no local RiskItem
    edge_notes:    List[str]


class TestCaseOutput(BaseModel):
    test_cases: List[TestCase]


SYSTEM_PROMPT = """You are a Senior QA Engineer writing professional test cases.

For each test case provide:
1. PRECONDITIONS — specific system state (account type, data, permissions, feature flags)
2. GHERKIN STEPS — Given/When/Then/And/But, minimum 5 steps, exact values and assertions
3. RISKS — 2-3 risks specific to this scenario (not generic)
4. EDGE NOTES — boundary conditions or gotchas for this test case

Return JSON only. No text outside JSON."""


def _build_user_msg(prd_summary: str, scenarios: List[Scenario]) -> str:
    scenarios_text = "\n".join(
        f"  - [{s.id}] ({s.category}) {s.title}: {getattr(s, 'description', '')}"
        for s in scenarios
    )

    return f"""PRD Summary:
{prd_summary}

Generate ONE detailed test case for each scenario below:
{scenarios_text}

For each test case:
- title: specific and descriptive
- priority: HIGH for security/auth/critical, MEDIUM for functional, LOW for edge/perf
- tags: include the scenario category plus @smoke/@regression/@security/@performance/@edge as relevant
- preconditions: 3-5 specific setup requirements
- gherkin_steps: minimum 5 steps with exact values and assertions
- risks: 2-3 risks with severity (HIGH/MEDIUM/LOW), description, mitigation
- edge_notes: 1-3 boundary conditions or gotchas

Return JSON:
{{
  "test_cases": [
    {{
      "scenario_id": "SCN-001",
      "title": "...",
      "priority": "HIGH",
      "tags": ["@functional", "@smoke"],
      "preconditions": [
        "User account exists with role 'customer'",
        "User has valid JWT token"
      ],
      "gherkin_steps": [
        {{"keyword": "Given", "text": "..."}},
        {{"keyword": "When",  "text": "..."}},
        {{"keyword": "Then",  "text": "..."}},
        {{"keyword": "And",   "text": "..."}},
        {{"keyword": "And",   "text": "..."}}
      ],
      "risks": [
        {{
          "severity": "HIGH",
          "description": "...",
          "mitigation": "..."
        }}
      ],
      "edge_notes": ["...", "..."]
    }}
  ]
}}"""


async def generate_test_cases(
    prd_content: str,
    scenarios: List[Scenario],
    config: LLMConfig,
) -> List[TestCase]:
    all_test_cases: List[TestCase] = []
    prd_summary = prd_content[:1500]
    batch_size  = 3

    for i in range(0, len(scenarios), batch_size):
        batch     = scenarios[i:i + batch_size]
        batch_num = i // batch_size + 1
        total     = (len(scenarios) + batch_size - 1) // batch_size
        print(f"  Generating batch {batch_num}/{total} ({len(batch)} scenarios)...")

        try:
            result = await llm_structured(
                config=config,
                system=SYSTEM_PROMPT,
                user=_build_user_msg(prd_summary, batch),
                schema=TestCaseOutput,
                temperature=0.15,
            )
            all_test_cases.extend(result.test_cases)
            print(f"  Batch {batch_num}: {len(result.test_cases)} test cases")
        except Exception as e:
            print(f"  Batch {batch_num} failed: {e} — skipping")

    if not all_test_cases:
        raise ValueError(
            "Could not generate any test cases. "
            "Model may not support structured JSON output. "
            "Try GPT-4o or Gemini."
        )

    return all_test_cases


async def regenerate_single_test_case(
    prd_content: str,
    scenario:    Scenario,
    config:      LLMConfig,
) -> TestCase:
    prd_summary = prd_content[:1500]
    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=_build_user_msg(prd_summary, [scenario]),
        schema=TestCaseOutput,
        temperature=0.25,
    )
    if not result.test_cases:
        raise ValueError("Model returned no test case for regeneration")
    return result.test_cases[0]