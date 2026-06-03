import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from backend.db.database import get_session
from backend.db.models import PRDRecord, TestCaseRecord
from backend.models.schema import (
    GenerateTestsRequest,
    UpdateTestCaseRequest,
    RejectTestCaseRequest,
    RegenerateTestCaseRequest,
    TestCaseResponse,
    TestCaseStatus,
    GherkinStep,
)
from backend.agents.scenario_agent import generate_scenarios, Scenario
from backend.agents.risk_agent import generate_risks
from backend.agents.limitations_agent import generate_limitations
from backend.agents.testcase_agent import generate_test_cases, regenerate_single_test_case
from backend.utils.dedup import deduplicate, compute_hash

router = APIRouter(prefix="/api/tests", tags=["Test Cases"])


def _to_response(tc: TestCaseRecord) -> TestCaseResponse:
    return TestCaseResponse(
        id=tc.id,
        prd_id=tc.prd_id,
        scenario_id=tc.scenario_id,
        scenario_title=tc.scenario_title,
        scenario_category=tc.scenario_category,
        title=tc.title,
        priority=tc.priority,
        tags=json.loads(tc.tags or "[]"),
        preconditions=json.loads(tc.preconditions or "[]"),
        gherkin_steps=[GherkinStep(**s) for s in json.loads(tc.gherkin_steps or "[]")],
        risks=json.loads(tc.risks or "[]"),
        limitations=json.loads(tc.limitations or "[]"),
        status=tc.status,
        reject_reason=tc.reject_reason,
        created_at=tc.created_at,
        updated_at=tc.updated_at,
    )


def _existing_hashes(session: Session, prd_id: int) -> set:
    tcs = session.exec(
        select(TestCaseRecord).where(TestCaseRecord.prd_id == prd_id)
    ).all()
    return {tc.hash_key for tc in tcs if tc.hash_key}


# ── Generate all test cases ───────────────

@router.post("/generate", response_model=list[TestCaseResponse])
async def generate_tests(
    body: GenerateTestsRequest,
    session: Session = Depends(get_session),
):
    prd = session.get(PRDRecord, body.prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    if prd.status.value != "approved":
        raise HTTPException(400, "PRD must be approved before generating test cases")

    # ── Step 1: Scenarios ─────────────────
    print("Step 1: Generating scenarios...")
    try:
        scenarios = await generate_scenarios(prd.content, body.config)
        print(f"Got {len(scenarios)} scenarios")
    except Exception as e:
        raise HTTPException(500, f"Scenario generation failed: {e}")

    # ── Step 2: Risks (non-blocking) ──────
    print("Step 2: Generating risks...")
    risk_texts = []
    try:
        risks = await generate_risks(prd.content, body.config)
        risk_texts = [f"[{r.severity}] {r.description}" for r in risks]
        print(f"Got {len(risks)} risks")
    except Exception as e:
        print(f"Risk generation failed (non-critical): {e}")

    # ── Step 3: Limitations (non-blocking) ─
    print("Step 3: Generating limitations...")
    limit_texts = []
    try:
        limitations = await generate_limitations(prd.content, body.config)
        limit_texts = [f"[{l.type}] {l.description}" for l in limitations]
        print(f"Got {len(limitations)} limitations")
    except Exception as e:
        print(f"Limitations generation failed (non-critical): {e}")

    # ── Step 4: Test cases ────────────────
    print("Step 4: Generating test cases...")
    try:
        test_cases = await generate_test_cases(prd.content, scenarios, body.config)
        print(f"Got {len(test_cases)} test cases")
    except Exception as e:
        raise HTTPException(500, f"Test case generation failed: {e}")

    # ── Step 5: Dedup + save ──────────────
    raw = []
    for tc in test_cases:
        raw.append({
            "scenario_id": tc.scenario_id,
            "scenario_title": next(
                (s.title for s in scenarios if s.id == tc.scenario_id),
                tc.scenario_id,
            ),
            "scenario_category": next(
                (s.category.value for s in scenarios if s.id == tc.scenario_id),
                "functional",
            ),
            "title":          tc.title,
            "priority":       tc.priority,
            "tags":           tc.tags,
            "preconditions":  tc.preconditions,
            "gherkin_steps":  [s.model_dump() for s in tc.gherkin_steps],
            "risks":          risk_texts,
            "limitations":    limit_texts,
        })

    existing = _existing_hashes(session, body.prd_id)
    unique   = deduplicate(raw, existing)
    print(f"After dedup: {len(unique)} unique test cases")

    saved = []
    for u in unique:
        record = TestCaseRecord(
            prd_id            = body.prd_id,
            scenario_id       = u["scenario_id"],
            scenario_title    = u["scenario_title"],
            scenario_category = u["scenario_category"],
            title             = u["title"],
            priority          = u["priority"],
            tags              = json.dumps(u["tags"]),
            preconditions     = json.dumps(u["preconditions"]),
            gherkin_steps     = json.dumps(u["gherkin_steps"]),
            risks             = json.dumps(u["risks"]),
            limitations       = json.dumps(u["limitations"]),
            hash_key          = u.get("hash_key", ""),
            status            = TestCaseStatus.pending,
        )
        session.add(record)
        session.flush()
        saved.append(record)

    session.commit()
    for s in saved:
        session.refresh(s)

    return [_to_response(s) for s in saved]


# ── List by PRD ───────────────────────────

@router.get("/prd/{prd_id}", response_model=list[TestCaseResponse])
def list_by_prd(prd_id: int, session: Session = Depends(get_session)):
    tcs = session.exec(
        select(TestCaseRecord).where(TestCaseRecord.prd_id == prd_id)
    ).all()
    return [_to_response(tc) for tc in tcs]


# ── Get single ────────────────────────────

@router.get("/{tc_id}", response_model=TestCaseResponse)
def get_test_case(tc_id: int, session: Session = Depends(get_session)):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")
    return _to_response(tc)


# ── Edit ──────────────────────────────────

@router.put("/{tc_id}", response_model=TestCaseResponse)
def update_test_case(
    tc_id: int,
    body: UpdateTestCaseRequest,
    session: Session = Depends(get_session),
):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")
    if body.title        is not None: tc.title        = body.title
    if body.priority     is not None: tc.priority     = body.priority
    if body.tags         is not None: tc.tags         = json.dumps(body.tags)
    if body.preconditions is not None: tc.preconditions = json.dumps(body.preconditions)
    if body.gherkin_steps is not None:
        tc.gherkin_steps = json.dumps([s.model_dump() for s in body.gherkin_steps])
    tc.updated_at = datetime.utcnow()
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return _to_response(tc)


# ── Approve ───────────────────────────────

@router.post("/{tc_id}/approve", response_model=TestCaseResponse)
def approve_test_case(tc_id: int, session: Session = Depends(get_session)):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")
    tc.status     = TestCaseStatus.approved
    tc.updated_at = datetime.utcnow()
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return _to_response(tc)


# ── Reject ────────────────────────────────

@router.post("/{tc_id}/reject", response_model=TestCaseResponse)
def reject_test_case(
    tc_id: int,
    body: RejectTestCaseRequest,
    session: Session = Depends(get_session),
):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")
    tc.status        = TestCaseStatus.rejected
    tc.reject_reason = body.reason
    tc.updated_at    = datetime.utcnow()
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return _to_response(tc)


# ── Regenerate single ─────────────────────

@router.post("/{tc_id}/regenerate", response_model=TestCaseResponse)
async def regenerate_test_case(
    tc_id: int,
    body: RegenerateTestCaseRequest,
    session: Session = Depends(get_session),
):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")

    scenario = Scenario(
        id       = body.scenario_id,
        title    = body.scenario_title,
        category = body.scenario_category,
    )

    try:
        new_tc = await regenerate_single_test_case(
            prd_content = body.prd_content,
            scenario    = scenario,
            config      = body.config,
        )
    except Exception as e:
        raise HTTPException(500, f"Regeneration failed: {e}")

    tc.title         = new_tc.title
    tc.priority      = new_tc.priority
    tc.tags          = json.dumps(new_tc.tags)
    tc.preconditions = json.dumps(new_tc.preconditions)
    tc.gherkin_steps = json.dumps([s.model_dump() for s in new_tc.gherkin_steps])
    tc.status        = TestCaseStatus.pending
    tc.reject_reason = None
    tc.updated_at    = datetime.utcnow()
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return _to_response(tc)