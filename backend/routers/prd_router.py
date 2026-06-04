"""
PRD Router — Handles PRD generation with:
  1. Scope analysis (is it single or multi-module?)
  2. Module splitting for complex stories → parallel generation → merge
  3. Streaming endpoint so the frontend shows progress live (no 524 timeouts)
  4. Standard CRUD endpoints (unchanged)

Streaming endpoint: POST /api/prd/generate/stream
  - Returns Server-Sent Events (SSE)
  - Frontend receives progress updates + final PRD
  - Solves 524 timeout for long user stories
"""

import json
import asyncio
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
from backend.agents.prd_agent import generate_prd, generate_module_prd, merge_prds
from backend.utils.llm_client import LLMConfig, test_connection
router = APIRouter(prefix="/api/prd", tags=["PRD"])


# ─────────────────────────────────────────
# Helper
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
    """Format a Server-Sent Event message."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ─────────────────────────────────────────
# STREAMING endpoint (main — solves timeout)
# ─────────────────────────────────────────

@router.post("/generate/stream")
async def generate_stream(body: GeneratePRDRequest):
    """
    Streaming PRD generation via SSE.

    Events emitted:
      progress  — status updates shown to user
      complete  — final PRD content + saved record ID
      error     — error message

    Frontend usage:
      const es = new EventSource(...)  ← or use fetch with ReadableStream
    """

    async def event_stream():
        try:
            # ── Step 1: Analyze scope ─────────────────
            yield _sse("progress", {
                "step": 1,
                "total": 4,
                "message": "Analyzing user story scope...",
            })

            scope = await analyze_scope(body.user_story, body.config)

            if scope.is_complex:
                module_names = [m.name for m in scope.modules]
                yield _sse("progress", {
                    "step": 1,
                    "total": 4,
                    "message": f"Detected {len(scope.modules)} modules: {', '.join(module_names)}",
                    "modules": module_names,
                    "is_complex": True,
                })
            else:
                yield _sse("progress", {
                    "step": 1,
                    "total": 4,
                    "message": "Single module detected — generating PRD directly",
                    "is_complex": False,
                })

            # ── Step 2: Generate PRD(s) ───────────────
            final_content: str
            module_names_saved: list[str] = []

            if not scope.is_complex or not scope.modules:
                # Single module path
                yield _sse("progress", {
                    "step": 2,
                    "total": 4,
                    "message": "Generating PRD...",
                })

                final_content = await generate_prd(body.user_story, body.config)
                module_names_saved = []

            else:
                # Multi-module path: generate each module PRD
                all_module_names = [m.name for m in scope.modules]
                module_prds = []

                for idx, module in enumerate(scope.modules):
                    yield _sse("progress", {
                        "step": 2,
                        "total": 4,
                        "message": f"Generating PRD for module: {module.name} ({idx+1}/{len(scope.modules)})",
                        "current_module": module.name,
                        "module_index": idx + 1,
                        "module_total": len(scope.modules),
                    })

                    module_content = await generate_module_prd(
                        user_story   = body.user_story,
                        module_name  = module.name,
                        module_focus = module.focus,
                        all_modules  = all_module_names,
                        config       = body.config,
                    )

                    module_prds.append({
                        "name":    module.name,
                        "content": module_content,
                    })

                # ── Step 3: Merge module PRDs ─────────
                yield _sse("progress", {
                    "step": 3,
                    "total": 4,
                    "message": f"Merging {len(module_prds)} module PRDs into unified PRD...",
                })

                final_content = await merge_prds(
                    user_story  = body.user_story,
                    module_prds = module_prds,
                    config      = body.config,
                )
                module_names_saved = all_module_names

            # ── Step 4: Save to DB ────────────────────
            yield _sse("progress", {
                "step": 4,
                "total": 4,
                "message": "Saving PRD...",
            })

            # We need a DB session — use a context manager approach
            from backend.db.database import engine
            from sqlmodel import Session as SyncSession

            with SyncSession(engine) as session:
                prd = PRDRecord(
                    user_story = body.user_story,
                    content    = final_content,
                    modules    = json.dumps(module_names_saved),
                    is_complex = scope.is_complex,
                    status     = PRDStatus.draft,
                )
                session.add(prd)
                session.commit()
                session.refresh(prd)

                yield _sse("complete", {
                    "id":         prd.id,
                    "content":    final_content,
                    "modules":    module_names_saved,
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
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
        },
    )


# ─────────────────────────────────────────
# Standard (non-streaming) generate
# Kept for backward compatibility
# ─────────────────────────────────────────

@router.post("/generate", response_model=PRDResponse)
async def generate(
    body: GeneratePRDRequest,
    session: Session = Depends(get_session),
):
    """
    Non-streaming PRD generation.
    WARNING: May timeout (524) for complex user stories.
    Prefer /generate/stream for production use.
    """
    try:
        # Quick scope check
        scope = await analyze_scope(body.user_story, body.config)

        if scope.is_complex and scope.modules:
            all_module_names = [m.name for m in scope.modules]
            module_prds = []
            for module in scope.modules:
                mc = await generate_module_prd(
                    user_story   = body.user_story,
                    module_name  = module.name,
                    module_focus = module.focus,
                    all_modules  = all_module_names,
                    config       = body.config,
                )
                module_prds.append({"name": module.name, "content": mc})
            content = await merge_prds(body.user_story, module_prds, body.config)
            module_names = all_module_names
        else:
            content = await generate_prd(body.user_story, body.config)
            module_names = []

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

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
# Standard CRUD (unchanged logic)
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