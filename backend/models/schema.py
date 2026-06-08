# backend/models/schema.py
from typing import Optional, List
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field
from pydantic import BaseModel
import json


# ─────────────────────────────────────────
# Enums
# ─────────────────────────────────────────

class PRDStatus(str, Enum):
    draft    = "draft"
    approved = "approved"
    dropped  = "dropped"


class TestCaseStatus(str, Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"


class Priority(str, Enum):
    high   = "HIGH"
    medium = "MEDIUM"
    low    = "LOW"


class ScenarioCategory(str, Enum):
    functional  = "functional"
    negative    = "negative"
    boundary    = "boundary"
    edge_case   = "edge_case"
    security    = "security"
    performance = "performance"


class LLMProvider(str, Enum):
    openai      = "openai"
    ollama      = "ollama"
    openrouter  = "openrouter"
    gemini      = "gemini"
    custom      = "custom"


# ─────────────────────────────────────────
# Database Tables
# ─────────────────────────────────────────

class PRDRecord(SQLModel, table=True):
    __tablename__ = "prds"

    id:           Optional[int] = Field(default=None, primary_key=True)
    user_story:   str
    content:      str
    modules:      str = "[]"
    is_complex:   bool = False
    status:       PRDStatus = PRDStatus.draft
    created_at:   datetime = Field(default_factory=datetime.utcnow)
    updated_at:   datetime = Field(default_factory=datetime.utcnow)

    def modules_list(self) -> List[str]:
        return json.loads(self.modules)


class TestCaseRecord(SQLModel, table=True):
    __tablename__ = "test_cases"

    id:                Optional[int] = Field(default=None, primary_key=True)
    prd_id:            int = Field(foreign_key="prds.id")
    scenario_id:       str
    scenario_title:    str
    scenario_category: str
    title:             str
    priority:          Priority
    tags:              str = "[]"
    preconditions:     str = "[]"
    gherkin_steps:     str = "[]"
    risks:             str = "[]"
    edge_notes:        str = "[]"
    limitations:       str = "[]"
    status:            TestCaseStatus = TestCaseStatus.pending
    reject_reason:     Optional[str] = None
    hash_key:          str = ""
    created_at:        datetime = Field(default_factory=datetime.utcnow)
    updated_at:        datetime = Field(default_factory=datetime.utcnow)

    def tags_list(self)         -> List[str]:  return json.loads(self.tags)
    def preconditions_list(self)-> List[str]:  return json.loads(self.preconditions)
    def steps_list(self)        -> List[dict]: return json.loads(self.gherkin_steps)
    def risks_list(self)        -> List[dict]: return json.loads(self.risks)
    def edge_notes_list(self)   -> List[str]:  return json.loads(self.edge_notes)
    def limitations_list(self)  -> List[str]:  return json.loads(self.limitations)


# ─────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────

class LLMConfig(BaseModel):
    provider:  LLMProvider
    api_key:   Optional[str] = None
    model:     Optional[str] = None
    base_url:  Optional[str] = None


class GeneratePRDRequest(BaseModel):
    user_story: str
    config:     LLMConfig


class UpdatePRDRequest(BaseModel):
    content: str


class PRDResponse(BaseModel):
    id:         int
    user_story: str
    content:    str
    modules:    List[str]
    is_complex: bool
    status:     PRDStatus
    created_at: datetime
    updated_at: datetime


class GherkinStep(BaseModel):
    keyword: str
    text:    str


class RiskDetail(BaseModel):
    severity:    str
    description: str
    mitigation:  str

class LimitDetail(BaseModel):        
    type:        str = ""
    description: str = ""

class TestCaseResponse(BaseModel):
    id:                int
    prd_id:            int
    scenario_id:       str
    scenario_title:    str
    scenario_category: str
    title:             str
    priority:          Priority
    tags:              List[str]
    preconditions:     List[str]
    gherkin_steps:     List[GherkinStep]
    risks:             List[RiskDetail]
    edge_notes:        List[str]
    limitations:       List[str]
    status:            TestCaseStatus
    reject_reason:     Optional[str]
    created_at:        datetime
    updated_at:        datetime


class GenerateTestsRequest(BaseModel):
    prd_id: int
    config: LLMConfig


class UpdateTestCaseRequest(BaseModel):
    title:          Optional[str]             = None
    priority:       Optional[Priority]        = None
    tags:           Optional[List[str]]       = None
    preconditions:  Optional[List[str]]       = None
    gherkin_steps:  Optional[List[GherkinStep]] = None


class RejectTestCaseRequest(BaseModel):
    reason: str


class RegenerateTestCaseRequest(BaseModel):
    config:            LLMConfig
    scenario_id:       str
    scenario_title:    str
    scenario_category: str
    prd_content:       str