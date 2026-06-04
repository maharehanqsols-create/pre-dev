"""
Test Case Agent — Generates detailed Gherkin test cases from scenarios + PRD.

Key improvements over old version:
  - Each test case has its OWN risks (not shared global risks)
  - Preconditions are specific and detailed
  - Gherkin steps are comprehensive (not 2-3 generic steps)
  - Edge case notes included per test case
  - Batch size optimized to avoid timeouts
"""

from typing import List, Optional
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig, Priority
from backend.agents.scenario_agent import Scenario


# ─────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────

class GherkinStep(BaseModel):
    keyword: str    # Given | When | Then | And | But
    text: str


class RiskItem(BaseModel):
    severity: str   # HIGH | MEDIUM | LOW
    description: str
    mitigation: str


class TestCase(BaseModel):
    scenario_id: str
    title: str
    priority: Priority
    tags: List[str]
    preconditions: List[str]
    gherkin_steps: List[GherkinStep]
    risks: List[RiskItem]
    edge_notes: List[str]       # edge cases / gotchas specific to this test case


class TestCaseOutput(BaseModel):
    test_cases: List[TestCase]


# ─────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a Senior QA Engineer writing professional test cases.

For each test case you must provide:
1. PRECONDITIONS — specific system state required before running this test
   (user account type, existing data, feature flags, permissions, etc.)
2. GHERKIN STEPS — complete scenario in Given/When/Then/And/But format
   - Given: full system state setup
   - When: the specific action being tested
   - Then: primary expected result (be specific — exact messages, status codes, DB changes)
   - And/But: additional assertions (UI state, side effects, downstream impacts)
   - Minimum 4-6 steps per test case
3. RISKS — what can go wrong with THIS specific test case
   (not generic — specific to the scenario being tested)
4. EDGE NOTES — boundary conditions or gotchas for THIS test case

Return JSON only. No text outside JSON."""


def _build_user_msg(prd_summary: str, scenarios: List[Scenario]) -> str:
    scenarios_text = "\n".join(
        f"  - [{s.id}] ({s.category}) {s.title}: {s.description}"
        for s in scenarios
    )

    return f"""PRD Summary:
{prd_summary}

Generate ONE detailed test case for each scenario below:
{scenarios_text}

For each test case:
- title: specific and descriptive (not just the scenario title)
- priority: HIGH for security/auth/critical flows, MEDIUM for functional, LOW for edge/perf
- tags: include @{category} plus relevant @smoke/@regression/@security/@performance/@edge
- preconditions: list 3-5 specific setup requirements (not generic "user is logged in")
- gherkin_steps: minimum 5 steps, be specific about exact values, messages, and assertions
- risks: 2-3 risks specific to this scenario with severity (HIGH/MEDIUM/LOW) and mitigation
- edge_notes: 1-3 specific boundary conditions or gotchas for this test case

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
        "User is authenticated with valid JWT token",
        "..."
      ],
      "gherkin_steps": [
        {{"keyword": "Given", "text": "..."}},
        {{"keyword": "When",  "text": "..."}},
        {{"keyword": "Then",  "text": "..."}},
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


# ─────────────────────────────────────────────────────────────────
# Main function
# ─────────────────────────────────────────────────────────────────

async def generate_test_cases(
    prd_content: str,
    scenarios: List[Scenario],
    config: LLMConfig,
) -> List[TestCase]:
    """
    Generate one detailed test case per scenario.
    Processes in batches of 3 to avoid timeouts with large models.
    """
    all_test_cases: List[TestCase] = []

    # Use first 1500 chars of PRD as context (key sections are at the top)
    prd_summary = prd_content[:1500]

    # Small batch size = fast responses, no timeouts
    batch_size = 3

    for i in range(0, len(scenarios), batch_size):
        batch = scenarios[i:i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(scenarios) + batch_size - 1) // batch_size

        print(f"  Generating test cases batch {batch_num}/{total_batches} "
              f"({len(batch)} scenarios)...")

        user_msg = _build_user_msg(prd_summary, batch)

        try:
            result = await llm_structured(
                config=config,
                system=SYSTEM_PROMPT,
                user=user_msg,
                schema=TestCaseOutput,
                temperature=0.15,
            )
            all_test_cases.extend(result.test_cases)
            print(f"  Batch {batch_num}: got {len(result.test_cases)} test cases")

        except Exception as e:
            print(f"  Batch {batch_num} failed: {e} — skipping")
            continue

    if not all_test_cases:
        raise ValueError(
            "Could not generate any test cases. "
            "Model may not support structured JSON output. "
            "Try a different model (GPT-4o or Gemini recommended)."
        )

    print(f"Total test cases generated: {len(all_test_cases)}")
    return all_test_cases


async def regenerate_single_test_case(
    prd_content: str,
    scenario: Scenario,
    config: LLMConfig,
) -> TestCase:
    """Regenerate a single test case (used when user rejects one)."""

    prd_summary = prd_content[:1500]
    user_msg = _build_user_msg(prd_summary, [scenario])

    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=user_msg,
        schema=TestCaseOutput,
        temperature=0.25,   # slightly higher temp for variety on regenerate
    )

    if not result.test_cases:
        raise ValueError("Model returned no test case for regeneration")

    return result.test_cases[0]