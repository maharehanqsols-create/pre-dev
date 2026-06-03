from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from backend.db.database import get_session
from backend.db.models import PRDRecord
from backend.models.schema import (
    GeneratePRDRequest,
    UpdatePRDRequest,
    PRDResponse,
    PRDStatus,
)
from backend.agents.prd_agent import generate_prd

router = APIRouter(prefix="/api/prd", tags=["PRD"])


def _to_response(prd: PRDRecord) -> PRDResponse:
    return PRDResponse(
        id=prd.id,
        user_story=prd.user_story,
        content=prd.content or "",
        status=prd.status,
        created_at=prd.created_at,
        updated_at=prd.updated_at,
    )


@router.post("/generate", response_model=PRDResponse)
async def generate(
    body: GeneratePRDRequest,
    session: Session = Depends(get_session),
):
    try:
        content = await generate_prd(body.user_story, body.config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        error_msg = str(e)
        print(f"PRD GENERATION ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=f"LLM error: {error_msg}")

    # Ensure content is a plain string
    if not isinstance(content, str):
        content = str(content)

    print(f"SAVING PRD: length={len(content)}, preview={content[:80]}")

    prd = PRDRecord(
        user_story=body.user_story,
        content=content,
        status=PRDStatus.draft,
    )
    session.add(prd)
    session.commit()
    session.refresh(prd)

    print(f"SAVED PRD ID={prd.id}, content_len={len(prd.content or '')}")
    return _to_response(prd)


@router.get("/{prd_id}", response_model=PRDResponse)
def get_prd(prd_id: int, session: Session = Depends(get_session)):
    prd = session.get(PRDRecord, prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    return _to_response(prd)


@router.get("/", response_model=list[PRDResponse])
def list_prds(session: Session = Depends(get_session)):
    prds = session.exec(select(PRDRecord)).all()
    return [_to_response(p) for p in prds]


@router.put("/{prd_id}", response_model=PRDResponse)
def update_prd(
    prd_id: int,
    body: UpdatePRDRequest,
    session: Session = Depends(get_session),
):
    prd = session.get(PRDRecord, prd_id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    prd.content = body.content
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
    prd.status = PRDStatus.approved
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
    prd.status = PRDStatus.dropped
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
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

    prd.content = content
    prd.status = PRDStatus.draft
    prd.updated_at = datetime.utcnow()
    session.add(prd)
    session.commit()
    session.refresh(prd)
    return _to_response(prd)