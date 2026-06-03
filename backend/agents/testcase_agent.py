from typing import List
from pydantic import BaseModel
from backend.utils.llm_client import llm_structured
from backend.models.schema import LLMConfig, Priority
from backend.agents.scenario_agent import Scenario


class GherkinStep(BaseModel):
    keyword: str
    text: str


class TestCase(BaseModel):
    scenario_id: str
    title: str
    priority: Priority
    tags: List[str]
    preconditions: List[str]
    gherkin_steps: List[GherkinStep]


class TestCaseOutput(BaseModel):
    test_cases: List[TestCase]


SYSTEM_PROMPT = (
    "You are a Senior QA Engineer. "
    "Generate Gherkin test cases. "
    "Return JSON only."
)


async def generate_test_cases(
    prd_content: str,
    scenarios: List[Scenario],
    config: LLMConfig,
) -> List[TestCase]:

    # Process in small batches — local models can't handle many scenarios at once
    all_test_cases: List[TestCase] = []
    batch_size = 4

    for i in range(0, len(scenarios), batch_size):
        batch = scenarios[i:i+batch_size]
        scenarios_text = "\n".join(
            f"- [{s.id}] ({s.category}) {s.title}" for s in batch
        )

        user_msg = (
            f"PRD (summary):\n{prd_content[:800]}\n\n"
            f"Generate one test case per scenario:\n{scenarios_text}\n\n"
            "keyword must be: Given, When, Then, or And. "
            "priority: HIGH/MEDIUM/LOW. "
            "tags: include @functional/@negative/@boundary."
        )

        try:
            result = await llm_structured(
                config=config,
                system=SYSTEM_PROMPT,
                user=user_msg,
                schema=TestCaseOutput,
                temperature=0.1,
            )
            all_test_cases.extend(result.test_cases)
        except Exception as e:
            print(f"Batch {i//batch_size + 1} failed: {e} — skipping batch")
            # Don't fail entire generation if one batch fails
            continue

    if not all_test_cases:
        raise ValueError(
            "Could not generate any test cases. "
            "Model may not support structured JSON output. "
            "Try a different model."
        )

    return all_test_cases


async def regenerate_single_test_case(
    prd_content: str,
    scenario: Scenario,
    config: LLMConfig,
) -> TestCase:
    user_msg = (
        f"PRD:\n{prd_content[:800]}\n\n"
        f"Scenario: [{scenario.id}] ({scenario.category}) {scenario.title}\n\n"
        "Generate ONE test case. "
        "keyword: Given/When/Then/And. priority: HIGH/MEDIUM/LOW."
    )

    result = await llm_structured(
        config=config,
        system=SYSTEM_PROMPT,
        user=user_msg,
        schema=TestCaseOutput,
        temperature=0.2,
    )

    if not result.test_cases:
        raise ValueError("Model returned no test case")
    return result.test_cases[0]