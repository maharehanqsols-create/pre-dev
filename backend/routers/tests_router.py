"""
Tests Router — Generates and manages test cases.

Key improvements:
  - Structured risks: {severity, description, mitigation}
  - edge_notes added per test case
  - System risks stored separately from TC-specific risks
  - Streaming SSE generation for long-running workflows
"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from backend.db.database import get_session, engine
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
from backend.utils.dedup import deduplicate
from sqlmodel import Session as SyncSession

from ..agents.scenario_agent import generate_scenarios, Scenario
from backend.agents.risk_agent import generate_risks
from backend.agents.limitations_agent import generate_limitations
from backend.agents.testcase_agent import (
    generate_test_cases,
    regenerate_single_test_case,
)


router = APIRouter(prefix="/api/tests", tags=["Test Cases"])


# ─────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────

def _parse_risks(raw: str) -> list[RiskDetail]:
    """Backward-compatible risk parser (string + dict formats)."""
    items = json.loads(raw or "[]")
    result = []

    for item in items:
        if isinstance(item, str):
            result.append(RiskDetail(
                severity="MEDIUM",
                description=item,
                mitigation="",
            ))
        elif isinstance(item, dict):
            result.append(RiskDetail(
                severity=item.get("severity", "MEDIUM"),
                description=item.get("description", ""),
                mitigation=item.get("mitigation", ""),
            ))
    return result


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
        risks=_parse_risks(tc.risks),
        edge_notes=json.loads(tc.edge_notes or "[]"),
        limitations=json.loads(tc.limitations or "[]"),
        status=tc.status,
        reject_reason=tc.reject_reason,
        created_at=tc.created_at,
        updated_at=tc.updated_at,
    )


def _existing_hashes(session: Session, prd_id: int) -> set:
    rows = session.exec(
        select(TestCaseRecord).where(TestCaseRecord.prd_id == prd_id)
    ).all()
    return {r.hash_key for r in rows if r.hash_key}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _build_tc_payload(tc, scenarios, system_risks, limit_texts):
    """Normalize TC payload construction (used in both sync + stream)."""
    return {
        "scenario_id": tc.scenario_id,
        "scenario_title": next(
            (s.title for s in scenarios if s.id == tc.scenario_id),
            tc.scenario_id,
        ),
        "scenario_category": next(
            (s.category.value for s in scenarios if s.id == tc.scenario_id),
            "functional",
        ),
        "title": tc.title,
        "priority": tc.priority,
        "tags": tc.tags,
        "preconditions": tc.preconditions,
        "gherkin_steps": [s.model_dump() for s in tc.gherkin_steps],
        "risks": (
            [r.model_dump() for r in tc.risks]
            if tc.risks
            else system_risks[:2]
        ),
        "edge_notes": getattr(tc, "edge_notes", []),
        "limitations": limit_texts,
    }


# ─────────────────────────────────────────
# Streaming Generation (SSE)
# ─────────────────────────────────────────

@router.post("/generate/stream")
async def generate_tests_stream(body: GenerateTestsRequest):

    async def event_stream():
        try:
            with SyncSession(engine) as session:
                prd = session.get(PRDRecord, body.prd_id)

            if not prd:
                yield _sse("error", {"message": "PRD not found"})
                return

            if prd.status.value != "approved":
                yield _sse("error", {"message": "PRD must be approved"})
                return

            prd_content = prd.content

            # ── Step 1: Scenarios ──────────────────
            yield _sse("progress", {
                "step": 1, "total": 5,
                "message": "Extracting scenarios...",
            })

            scenarios = await generate_scenarios(prd_content, body.config)

            yield _sse("progress", {
                "step": 1,
                "total": 5,
                "message": f"{len(scenarios)} scenarios found",
            })

            # ── Step 2: Risks ──────────────────────
            yield _sse("progress", {
                "step": 2, "total": 5,
                "message": "Generating system risks...",
            })

            system_risks = []
            try:
                risks = await generate_risks(prd_content, body.config)
                system_risks = [
                    {
                        "severity": r.severity,
                        "description": r.description,
                        "mitigation": r.mitigation,
                    }
                    for r in risks
                ]
            except Exception:
                pass

            # ── Step 3: Limitations ────────────────
            yield _sse("progress", {
                "step": 3, "total": 5,
                "message": "Detecting limitations...",
            })

            limit_texts = []
            try:
                limitations = await generate_limitations(prd_content, body.config)
                limit_texts = [f"[{l.type}] {l.description}" for l in limitations]
            except Exception:
                pass

            # ── Step 4: Test cases ─────────────────
            yield _sse("progress", {
                "step": 4, "total": 5,
                "message": "Generating test cases...",
            })

            test_cases = await generate_test_cases(
                prd_content, scenarios, body.config
            )

            yield _sse("progress", {
                "step": 4,
                "total": 5,
                "message": f"{len(test_cases)} test cases generated",
            })

            # ── Step 5: Build + Save ───────────────
            yield _sse("progress", {
                "step": 5, "total": 5,
                "message": "Saving test cases...",
            })

            raw = []
            for tc in test_cases:
                raw.append(_build_tc_payload(
                    tc, scenarios, system_risks, limit_texts
                ))

            with SyncSession(engine) as session:
                existing = _existing_hashes(session, body.prd_id)
                unique = deduplicate(raw, existing)

                saved = []
                for u in unique:
                    record = TestCaseRecord(
                        prd_id=body.prd_id,
                        scenario_id=u["scenario_id"],
                        scenario_title=u["scenario_title"],
                        scenario_category=u["scenario_category"],
                        title=u["title"],
                        priority=u["priority"],
                        tags=json.dumps(u["tags"]),
                        preconditions=json.dumps(u["preconditions"]),
                        gherkin_steps=json.dumps(u["gherkin_steps"]),
                        risks=json.dumps(u["risks"]),
                        edge_notes=json.dumps(u.get("edge_notes", [])),
                        limitations=json.dumps(u["limitations"]),
                        hash_key=u.get("hash_key", ""),
                        status=TestCaseStatus.pending,
                    )
                    session.add(record)
                    session.flush()
                    saved.append(record)

                session.commit()
                for s in saved:
                    session.refresh(s)

                responses = [_to_response(s) for s in saved]

            yield _sse("complete", {
                "count": len(responses),
                "message": f"{len(responses)} test cases created",
                "test_cases": [r.model_dump(mode="json") for r in responses],
            })

        except Exception as e:
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────
# Standard Generation
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
        raise HTTPException(400, "PRD must be approved")

    scenarios = await generate_scenarios(prd.content, body.config)

    system_risks = []
    try:
        risks = await generate_risks(prd.content, body.config)
        system_risks = [
            {
                "severity": r.severity,
                "description": r.description,
                "mitigation": r.mitigation,
            }
            for r in risks
        ]
    except Exception:
        pass

    limit_texts = []
    try:
        limitations = await generate_limitations(prd.content, body.config)
        limit_texts = [f"[{l.type}] {l.description}" for l in limitations]
    except Exception:
        pass

    test_cases = await generate_test_cases(prd.content, scenarios, body.config)

    raw = [
        _build_tc_payload(tc, scenarios, system_risks, limit_texts)
        for tc in test_cases
    ]

    existing = _existing_hashes(session, body.prd_id)
    unique = deduplicate(raw, existing)

    saved = []
    for u in unique:
        record = TestCaseRecord(
            prd_id=body.prd_id,
            scenario_id=u["scenario_id"],
            scenario_title=u["scenario_title"],
            scenario_category=u["scenario_category"],
            title=u["title"],
            priority=u["priority"],
            tags=json.dumps(u["tags"]),
            preconditions=json.dumps(u["preconditions"]),
            gherkin_steps=json.dumps(u["gherkin_steps"]),
            risks=json.dumps(u["risks"]),
            edge_notes=json.dumps(u.get("edge_notes", [])),
            limitations=json.dumps(u["limitations"]),
            hash_key=u.get("hash_key", ""),
            status=TestCaseStatus.pending,
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
    rows = session.exec(
        select(TestCaseRecord).where(TestCaseRecord.prd_id == prd_id)
    ).all()
    return [_to_response(r) for r in rows]


@router.get("/{tc_id}", response_model=TestCaseResponse)
def get_test_case(tc_id: int, session: Session = Depends(get_session)):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404, "Test case not found")
    return _to_response(tc)


@router.put("/{tc_id}", response_model=TestCaseResponse)
def update_test_case(tc_id: int, body: UpdateTestCaseRequest, session: Session = Depends(get_session)):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404)

    if body.title is not None:
        tc.title = body.title
    if body.priority is not None:
        tc.priority = body.priority
    if body.tags is not None:
        tc.tags = json.dumps(body.tags)
    if body.preconditions is not None:
        tc.preconditions = json.dumps(body.preconditions)
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
        raise HTTPException(404)

    tc.status = TestCaseStatus.approved
    tc.updated_at = datetime.utcnow()
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return _to_response(tc)


@router.post("/{tc_id}/reject", response_model=TestCaseResponse)
def reject_test_case(tc_id: int, body: RejectTestCaseRequest, session: Session = Depends(get_session)):
    tc = session.get(TestCaseRecord, tc_id)
    if not tc:
        raise HTTPException(404)

    tc.status = TestCaseStatus.rejected
    tc.reject_reason = body.reason
    tc.updated_at = datetime.utcnow()
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
        raise HTTPException(404)

    scenario = Scenario(
        id=body.scenario_id,
        title=body.scenario_title,
        category=body.scenario_category,
        description="",
    )

    new_tc = await regenerate_single_test_case(
        prd_content=body.prd_content,
        scenario=scenario,
        config=body.config,
    )

    tc.title = new_tc.title
    tc.priority = new_tc.priority
    tc.tags = json.dumps(new_tc.tags)
    tc.preconditions = json.dumps(new_tc.preconditions)
    tc.gherkin_steps = json.dumps([s.model_dump() for s in new_tc.gherkin_steps])
    tc.risks = json.dumps([r.model_dump() for r in new_tc.risks] if new_tc.risks else [])
    tc.edge_notes = json.dumps(getattr(new_tc, "edge_notes", []))
    tc.status = TestCaseStatus.pending
    tc.reject_reason = None
    tc.updated_at = datetime.utcnow()

    session.add(tc)
    session.commit()
    session.refresh(tc)

    return _to_response(tc)