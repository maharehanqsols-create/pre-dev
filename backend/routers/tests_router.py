"""
Tests Router — Generates and manages test cases.

Changes from old version:
  - Risks are now structured {severity, description, mitigation} not just strings
  - edge_notes field added per test case
  - System-wide risks still generated but stored separately from per-TC risks
  - Streaming progress endpoint added
"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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
    RiskDetail,
)
from backend.agents.scenario_agent import generate_scenarios, Scenario
from backend.agents.risk_agent import generate_risks
from backend.agents.limitations_agent import generate_limitations
from backend.agents.testcase_agent import generate_test_cases, regenerate_single_test_case
from backend.utils.dedup import deduplicate, compute_hash

router = APIRouter(prefix="/api/tests", tags=["Test Cases"])


# ─────────────────────────────────────────
# Helper
# ─────────────────────────────────────────

def _parse_risks(raw: str) -> list[RiskDetail]:
    """Parse risks JSON — handles both old string format and new dict format."""
    items = json.loads(raw or "[]")
    result = []
    for item in items:
        if isinstance(item, str):
            # Old format: plain string
            result.append(RiskDetail(
                severity    = "MEDIUM",
                description = item,
                mitigation  = "",
            ))
        elif isinstance(item, dict):
            result.append(RiskDetail(
                severity    = item.get("severity", "MEDIUM"),
                description = item.get("description", ""),
                mitigation  = item.get("mitigation", ""),
            ))
    return result


def _to_response(tc: TestCaseRecord) -> TestCaseResponse:
    return TestCaseResponse(
        id                 = tc.id,
        prd_id             = tc.prd_id,
        scenario_id        = tc.scenario_id,
        scenario_title     = tc.scenario_title,
        scenario_category  = tc.scenario_category,
        title              = tc.title,
        priority           = tc.priority,
        tags               = json.loads(tc.tags or "[]"),
        preconditions      = json.loads(tc.preconditions or "[]"),
        gherkin_steps      = [GherkinStep(**s) for s in json.loads(tc.gherkin_steps or "[]")],
        risks              = _parse_risks(tc.risks),
        edge_notes         = json.loads(tc.edge_notes or "[]"),
        limitations        = json.loads(tc.limitations or "[]"),
        status             = tc.status,
        reject_reason      = tc.reject_reason,
        created_at         = tc.created_at,
        updated_at         = tc.updated_at,
    )


def _existing_hashes(session: Session, prd_id: int) -> set:
    tcs = session.exec(
        select(TestCaseRecord).where(TestCaseRecord.prd_id == prd_id)
    ).all()
    return {tc.hash_key for tc in tcs if tc.hash_key}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ─────────────────────────────────────────
# Streaming test generation (solves timeout)
# ─────────────────────────────────────────

@router.post("/generate/stream")
async def generate_tests_stream(body: GenerateTestsRequest):
    """
    Streaming test case generation via SSE.

    Events:
      progress  — step updates
      complete  — list of generated test case IDs
      error     — error message
    """

    async def event_stream():
        try:
            from backend.db.database import engine
            from sqlmodel import Session as SyncSession

            with SyncSession(engine) as session:
                prd = session.get(PRDRecord, body.prd_id)

            if not prd:
                yield _sse("error", {"message": "PRD not found"})
                return
            if prd.status.value != "approved":
                yield _sse("error", {"message": "PRD must be approved before generating test cases"})
                return

            prd_content = prd.content

            # ── Step 1: Scenarios ─────────────────────
            yield _sse("progress", {
                "step": 1, "total": 5,
                "message": "Extracting test scenarios from PRD...",
            })

            try:
                scenarios = await generate_scenarios(prd_content, body.config)
                yield _sse("progress", {
                    "step": 1, "total": 5,
                    "message": f"Found {len(scenarios)} test scenarios",
                    "scenario_count": len(scenarios),
                })
            except Exception as e:
                yield _sse("error", {"message": f"Scenario generation failed: {e}"})
                return

            # ── Step 2: System-wide risks ─────────────
            yield _sse("progress", {
                "step": 2, "total": 5,
                "message": "Identifying system-wide risks...",
            })

            system_risks = []
            try:
                risks = await generate_risks(prd_content, body.config)
                system_risks = [
                    {"severity": r.severity, "description": r.description, "mitigation": r.mitigation}
                    for r in risks
                ]
                yield _sse("progress", {
                    "step": 2, "total": 5,
                    "message": f"Identified {len(risks)} system-wide risks",
                })
            except Exception as e:
                print(f"Risk generation failed (non-critical): {e}")

            # ── Step 3: Limitations ───────────────────
            yield _sse("progress", {
                "step": 3, "total": 5,
                "message": "Identifying limitations and gaps...",
            })

            limit_texts = []
            try:
                limitations = await generate_limitations(prd_content, body.config)
                limit_texts = [f"[{l.type}] {l.description}" for l in limitations]
            except Exception as e:
                print(f"Limitations generation failed (non-critical): {e}")

            # ── Step 4: Test cases ────────────────────
            total_batches = (len(scenarios) + 2) // 3
            yield _sse("progress", {
                "step": 4, "total": 5,
                "message": f"Generating test cases in {total_batches} batches...",
            })

            try:
                test_cases = await generate_test_cases(prd_content, scenarios, body.config)
                yield _sse("progress", {
                    "step": 4, "total": 5,
                    "message": f"Generated {len(test_cases)} test cases",
                    "tc_count": len(test_cases),
                })
            except Exception as e:
                yield _sse("error", {"message": f"Test case generation failed: {e}"})
                return

            # ── Step 5: Save to DB ────────────────────
            yield _sse("progress", {
                "step": 5, "total": 5,
                "message": "Saving test cases...",
            })

            raw = []
            for tc in test_cases:
                # Per-TC risks from testcase_agent
                tc_risks = [r.model_dump() for r in tc.risks] if tc.risks else system_risks[:2]

                raw.append({
                    "scenario_id":       tc.scenario_id,
                    "scenario_title":    next(
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
                    "risks":          tc_risks,
                    "edge_notes":     tc.edge_notes if hasattr(tc, "edge_notes") else [],
                    "limitations":    limit_texts,
                })

            with SyncSession(engine) as session:
                existing = _existing_hashes(session, body.prd_id)
                unique   = deduplicate(raw, existing)

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
                        edge_notes        = json.dumps(u.get("edge_notes", [])),
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

                responses = [_to_response(s) for s in saved]

            yield _sse("complete", {
                "count":    len(responses),
                "message":  f"Successfully generated {len(responses)} test cases",
                "test_cases": [r.model_dump(mode="json") for r in responses],
            })

        except Exception as e:
            print(f"Test stream error: {e}")
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────
# Standard generate (backward compatible)
# ─────────────────────────────────────────

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

    print("Step 1: Generating scenarios...")
    try:
        scenarios = await generate_scenarios(prd.content, body.config)
    except Exception as e:
        raise HTTPException(500, f"Scenario generation failed: {e}")

    print("Step 2: Generating system risks...")
    system_risks = []
    try:
        risks = await generate_risks(prd.content, body.config)
        system_risks = [
            {"severity": r.severity, "description": r.description, "mitigation": r.mitigation}
            for r in risks
        ]
    except Exception as e:
        print(f"Risk generation failed (non-critical): {e}")

    print("Step 3: Generating limitations...")
    limit_texts = []
    try:
        limitations = await generate_limitations(prd.content, body.config)
        limit_texts = [f"[{l.type}] {l.description}" for l in limitations]
    except Exception as e:
        print(f"Limitations failed (non-critical): {e}")

    print("Step 4: Generating test cases...")
    try:
        test_cases = await generate_test_cases(prd.content, scenarios, body.config)
    except Exception as e:
        raise HTTPException(500, f"Test case generation failed: {e}")

    raw = []
    for tc in test_cases:
        tc_risks = [r.model_dump() for r in tc.risks] if tc.risks else system_risks[:2]
        raw.append({
            "scenario_id":       tc.scenario_id,
            "scenario_title":    next((s.title for s in scenarios if s.id == tc.scenario_id), tc.scenario_id),
            "scenario_category": next((s.category.value for s in scenarios if s.id == tc.scenario_id), "functional"),
            "title":         tc.title,
            "priority":      tc.priority,
            "tags":          tc.tags,
            "preconditions": tc.preconditions,
            "gherkin_steps": [s.model_dump() for s in tc.gherkin_steps],
            "risks":         tc_risks,
            "edge_notes":    tc.edge_notes if hasattr(tc, "edge_notes") else [],
            "limitations":   limit_texts,
        })

    existing = _existing_hashes(session, body.prd_id)
    unique   = deduplicate(raw, existing)

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
            edge_notes        = json.dumps(u.get("edge_notes", [])),
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


# ─────────────────────────────────────────
# CRUD (unchanged)
# ─────────────────────────────────────────

@router.get("/prd/{prd_id}", response_model=list[TestCaseResponse])
def list_by_prd(prd_id: int, session: Session = Depends(get_session)):
    tcs = session.exec(select(TestCaseRecord).where(TestCaseRecord.prd_id == prd_id)).all()
    return [_to_response(tc) for tc in tcs]


@router.get("/{tc_id}", response_model=TestCaseResponse)
def get_test_case(tc_id: int, session: Session = Depends(get_session)):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")
    return _to_response(tc)


@router.put("/{tc_id}", response_model=TestCaseResponse)
def update_test_case(
    tc_id: int,
    body: UpdateTestCaseRequest,
    session: Session = Depends(get_session),
):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")
    if body.title         is not None: tc.title         = body.title
    if body.priority      is not None: tc.priority      = body.priority
    if body.tags          is not None: tc.tags          = json.dumps(body.tags)
    if body.preconditions is not None: tc.preconditions = json.dumps(body.preconditions)
    if body.gherkin_steps is not None:
        tc.gherkin_steps = json.dumps([s.model_dump() for s in body.gherkin_steps])
    tc.updated_at = datetime.utcnow()
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return _to_response(tc)


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
        id          = body.scenario_id,
        title       = body.scenario_title,
        category    = body.scenario_category,
        description = "",
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
    tc.risks         = json.dumps([r.model_dump() for r in new_tc.risks] if new_tc.risks else [])
    tc.edge_notes    = json.dumps(new_tc.edge_notes if hasattr(new_tc, "edge_notes") else [])
    tc.status        = TestCaseStatus.pending
    tc.reject_reason = None
    tc.updated_at    = datetime.utcnow()
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return _to_response(tc)