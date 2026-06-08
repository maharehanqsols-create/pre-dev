"""
PRD Router — Handles PRD generation with:
  1. Scope analysis (single vs multi-module detection)
  2. Single unified PRD generation (modules become sections, never separate docs)
  3. Streaming endpoint for live frontend progress (no 524 timeouts)
  4. Standard CRUD endpoints

Streaming endpoint: POST /api/prd/generate/stream
  - Returns Server-Sent Events (SSE)
  - 3-step flow: scope → generate → save
  - No merge step needed (single-document architecture)
"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from backend.db.database import get_session
from backend.db.models import PRDRecord
from backend.models.schema import (
    GeneratePRDRequest,
    UpdatePRDRequest,
    PRDResponse,
    PRDStatus,
)
from backend.agents.scope_agent import analyze_scope
from backend.agents.prd_agent import generate_prd

router = APIRouter(prefix="/api/prd", tags=["PRD"])


# ─────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────

def _to_response(prd: PRDRecord) -> PRDResponse:
    return PRDResponse(
        id         = prd.id,
        user_story = prd.user_story,
        content    = prd.content or "",
        modules    = json.loads(prd.modules or "[]"),
        is_complex = prd.is_complex or False,
        status     = prd.status,
        created_at = prd.created_at,
        updated_at = prd.updated_at,
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _extract_modules(scope) -> list[dict]:
    """Extract module list from scope analysis result."""
    if not scope.is_complex or not scope.modules:
        return []
    return [{"name": m.name, "focus": m.focus} for m in scope.modules]


# ─────────────────────────────────────────
# Streaming endpoint
# ─────────────────────────────────────────

@router.post("/generate/stream")
async def generate_stream(body: GeneratePRDRequest):
    """
    Streaming PRD generation via SSE.

    Flow (3 steps):
      1. Scope analysis  — detects modules if story is complex
      2. PRD generation  — one LLM call, modules become sections in a single doc
      3. Save to DB      — persists and returns final record

    SSE events:
      progress  { step, total, message, ?modules, ?is_complex }
      complete  { id, content, modules, is_complex, status, created_at, updated_at }
      error     { message }
    """

    async def event_stream():
        try:
            # ── Step 1: Scope analysis ────────────────
            yield _sse("progress", {
                "step": 1,
                "total": 3,
                "message": "Analyzing user story scope...",
            })

            scope = await analyze_scope(body.user_story, body.config)
            module_list = _extract_modules(scope)
            module_names = [m["name"] for m in module_list]

            if module_list:
                yield _sse("progress", {
                    "step": 1,
                    "total": 3,
                    "message": (
                        f"Detected {len(module_list)} modules: {', '.join(module_names)}"
                        " — generating unified PRD..."
                    ),
                    "modules": module_names,
                    "is_complex": True,
                })
            else:
                yield _sse("progress", {
                    "step": 1,
                    "total": 3,
                    "message": "Single module detected — generating PRD...",
                    "is_complex": False,
                })

            # ── Step 2: Generate unified PRD ─────────
            yield _sse("progress", {
                "step": 2,
                "total": 3,
                "message": "Generating PRD...",
            })

            content = await generate_prd(
                user_story = body.user_story,
                config     = body.config,
                modules    = module_list or None,
            )

            # ── Step 3: Save to DB ────────────────────
            yield _sse("progress", {
                "step": 3,
                "total": 3,
                "message": "Saving PRD...",
            })

            from backend.db.database import engine
            from sqlmodel import Session as SyncSession

            with SyncSession(engine) as session:
                prd = PRDRecord(
                    user_story = body.user_story,
                    content    = content,
                    modules    = json.dumps(module_names),
                    is_complex = scope.is_complex,
                    status     = PRDStatus.draft,
                )
                session.add(prd)
                session.commit()
                session.refresh(prd)

                yield _sse("complete", {
                    "id":         prd.id,
                    "content":    content,
                    "modules":    module_names,
                    "is_complex": scope.is_complex,
                    "status":     prd.status.value,
                    "created_at": prd.created_at.isoformat(),
                    "updated_at": prd.updated_at.isoformat(),
                })

        except Exception as e:
            print(f"PRD stream error: {e}")
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
# Non-streaming generate
# ─────────────────────────────────────────

@router.post("/generate", response_model=PRDResponse)
async def generate(
    body: GeneratePRDRequest,
    session: Session = Depends(get_session),
):
    """
    Non-streaming PRD generation.
    WARNING: May timeout (524) for complex stories. Prefer /generate/stream.
    """
    try:
        scope = await analyze_scope(body.user_story, body.config)
        module_list = _extract_modules(scope)
        content = await generate_prd(
            user_story = body.user_story,
            config     = body.config,
            modules    = module_list or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

    module_names = [m["name"] for m in module_list]
    prd = PRDRecord(
        user_story = body.user_story,
        content    = content,
        modules    = json.dumps(module_names),
        is_complex = scope.is_complex,
        status     = PRDStatus.draft,
    )
    session.add(prd)
    session.commit()
    session.refresh(prd)
    return _to_response(prd)


# ─────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────

@router.get("/", response_model=list[PRDResponse])
def list_prds(session: Session = Depends(get_session)):
    return [_to_response(p) for p in session.exec(select(PRDRecord)).all()]


@router.get("/{prd_id}", response_model=PRDResponse)
def get_prd(prd_id: int, session: Session = Depends(get_session)):
    prd = session.get(PRDRecord, prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    return _to_response(prd)


@router.put("/{prd_id}", response_model=PRDResponse)
def update_prd(
    prd_id: int,
    body: UpdatePRDRequest,
    session: Session = Depends(get_session),
):
    prd = session.get(PRDRecord, prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    prd.content    = body.content
    prd.updated_at = datetime.utcnow()
    session.add(prd)
    session.commit()
    session.refresh(prd)
    return _to_response(prd)


@router.post("/{prd_id}/approve", response_model=PRDResponse)
def approve_prd(prd_id: int, session: Session = Depends(get_session)):
    prd = session.get(PRDRecord, prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    prd.status     = PRDStatus.approved
    prd.updated_at = datetime.utcnow()
    session.add(prd)
    session.commit()
    session.refresh(prd)
    return _to_response(prd)


@router.post("/{prd_id}/drop", response_model=PRDResponse)
def drop_prd(prd_id: int, session: Session = Depends(get_session)):
    prd = session.get(PRDRecord, prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    prd.status     = PRDStatus.dropped
    prd.updated_at = datetime.utcnow()
    session.add(prd)
    session.commit()
    session.refresh(prd)
    return _to_response(prd)


@router.post("/{prd_id}/regenerate", response_model=PRDResponse)
async def regenerate_prd(
    prd_id: int,
    body: GeneratePRDRequest,
    session: Session = Depends(get_session),
):
    prd = session.get(PRDRecord, prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    try:
        content = await generate_prd(body.user_story, body.config)
    except Exception as e:
        raise HTTPException(500, f"LLM error: {str(e)}")
    prd.content    = content
    prd.status     = PRDStatus.draft
    prd.updated_at = datetime.utcnow()
    session.add(prd)
    session.commit()
    session.refresh(prd)
    return _to_response(prd)