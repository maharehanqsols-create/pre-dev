"""
PRD Agent — Generates Product Requirements Documents.

Single-document architecture:
  generate_prd(user_story, config, modules=None)
    - If modules is None/empty  → standard single-module PRD
    - If modules provided       → one flat PRD, modules referenced inline
      Section 14 (Module Dependencies) is the ONLY module-specific section.
      Sections 6-13 appear ONCE — never repeated per module.
"""

from backend.utils.llm_client import llm_complete
from backend.models.schema import LLMConfig


# ─────────────────────────────────────────────────────────────────
# System prompt
# ─────────────────────────────────────────────────────────────────

PRD_SYSTEM = """You are a Senior Business Analyst and Product Manager with 10+ years of experience.

Your job: Convert the user story into a single, complete PRD document that a QA engineer can use to write thorough test cases.

CRITICAL REQUIREMENTS:
- Every section must be filled with real, specific content — NO placeholders like "[describe here]"
- Edge cases must be exhaustive: empty inputs, max limits, concurrent users, network failures, invalid data types, special characters, timezone issues, permission boundaries
- Security section is mandatory for any feature handling user data or authentication
- Field validations must list EVERY field with EXACT rules (min/max length, regex, allowed chars)
- Business rules must cover ALL decision logic including error paths
- Acceptance criteria must be testable — Given/When/Then format
- OUTPUT ONLY ONE DOCUMENT — never repeat section headings
- NEVER create "Section X — ModuleName" headings — one flat structure only

Use this exact structure:

---

# PRD: [Feature Name]

## 1. Feature Overview
- **Feature Name:** [name]
- **Feature ID:** FEAT-[XXX]
- **Priority:** High / Medium / Low
- **Status:** Draft
- **Version:** 1.0

## 2. Objective
[3-5 sentences: what problem this solves, who benefits, what success looks like]

## 3. User Roles & Permissions
| Role | Permissions | Restrictions |
|------|-------------|--------------|
| [Role 1] | [what they can do] | [what they cannot do] |

## 4. User Story
As a [role], I want [capability], so that [benefit].

## 5. Preconditions
- [Every condition that must be true before this feature is used]
- [Include system state, user state, data requirements]

{module_sections_placeholder}

## 15. Data Model Impact
- **[Table/Collection]:** [fields added/modified/removed]

## 16. Performance Requirements
- **PR-001:** [Response time SLA]
- **PR-002:** [Concurrent user capacity]
- **PR-003:** [Data volume handling]

## 17. Dependencies & Impact
- **[Module/Service]:** [how it is affected or required]

## 18. Acceptance Criteria
- **AC-001:** Given [context] When [action] Then [verifiable outcome]
- **AC-002:** [continue for every key requirement...]

---

Be exhaustive. A QA engineer must be able to write 15-20 test cases from this PRD without asking clarifying questions."""


# ─────────────────────────────────────────────────────────────────
# Section blocks
# ─────────────────────────────────────────────────────────────────

CORE_SECTIONS = """## 6. Main Flow (Happy Path)
1. [Step 1 — actor + action + system response]
2. [Step 2]
3. [Continue for every step...]

## 7. Alternative Flows
### AF-001: [Name]
- Trigger: [when this path starts]
- Steps: [numbered steps]
- Outcome: [result]

## 8. Exception / Error Flows
### EF-001: [Error scenario name]
- Trigger: [cause]
- System behavior: [what happens]
- User message: "[exact message]"
- Recovery: [how user proceeds]

## 9. Field Validations
| Field | Type | Required | Min | Max | Rules | Error Message |
|-------|------|----------|-----|-----|-------|---------------|

## 10. Business Rules
- **BR-001:** [specific rule with all conditions and outcomes]
- **BR-002:** [rule]

## 11. Edge Cases
- **EC-001:** [Scenario] → [Expected behavior]
- **EC-002:** Empty/null input for required fields → [behavior]
- **EC-003:** Maximum allowed input exceeded → [behavior]
- **EC-004:** Concurrent requests (same user, multiple tabs) → [behavior]
- **EC-005:** Network timeout mid-operation → [behavior]
- **EC-006:** Session expiry during flow → [behavior]
- **EC-007:** Special characters / SQL injection attempts → [behavior]
- **EC-008:** [Feature-specific edge case] → [behavior]
- **EC-009:** [Feature-specific edge case] → [behavior]
- **EC-010:** [Feature-specific edge case] → [behavior]

## 12. Security Requirements
- **SEC-001:** [Authentication requirement]
- **SEC-002:** [Authorization / role check]
- **SEC-003:** [Input sanitization]
- **SEC-004:** [Rate limiting]
- **SEC-005:** [Data encryption / PII handling]
- **SEC-006:** [Audit logging]

## 13. API Contracts
| Method | Endpoint | Request Body | Response | Auth Required |
|--------|----------|-------------|----------|---------------|

## 14. Module Dependencies
[Populated only when multiple modules are involved — otherwise write "N/A"]"""


def _module_context(modules: list[dict]) -> str:
    """
    Produces a short context block injected between section 5 and section 6.
    Tells the LLM which modules exist and that they must NOT become
    repeated section headings — only referenced inline.
    """
    module_lines = "\n".join(
        f"  - **{m['name']}**: {m.get('focus', '')}" for m in modules
    )
    module_names = ", ".join(m["name"] for m in modules)

    return f"""
---
**Multi-Module Context (for author — do not reproduce this block in output)**

This feature involves {len(modules)} modules: {module_names}.

Rules:
1. Sections 6-18 appear EXACTLY ONCE — flat, unified, no per-module repetition.
2. Reference module names INLINE within steps, rules, and validations
   e.g. "The CourseAssignment module creates the record; EmailNotifications fires the email."
3. Section 14 (Module Dependencies) is the ONLY place to document per-module detail.
   For each module pair, describe what data or event flows between them.

Modules:
{module_lines}
---

"""


def _build_system_prompt(modules: list[dict] | None) -> str:
    if modules:
        sections = _module_context(modules) + CORE_SECTIONS
    else:
        sections = CORE_SECTIONS

    return PRD_SYSTEM.replace("{module_sections_placeholder}", sections)


# ─────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────

async def generate_prd(
    user_story: str,
    config: LLMConfig,
    modules: list[dict] | None = None,
) -> str:
    """
    Generate a single unified PRD document.

    Args:
        user_story: The raw user story text.
        config:     LLM provider config.
        modules:    Optional list of {"name": str, "focus": str} dicts from
                    scope_agent. When provided, modules are referenced inline
                    within the unified sections — never repeated as headings.
                    Section 14 covers cross-module dependencies.
    """
    clean_story = user_story.strip().replace('\x00', '').replace('\r', '\n')
    system = _build_system_prompt(modules)

    result = await llm_complete(
        config=config,
        system=system,
        user=f"User Story:\n{clean_story}\n\nGenerate the complete PRD now.",
        temperature=0.2,
    )

    if not result or len(result.strip()) < 100:
        raise ValueError(
            f"Model returned empty or too-short PRD (length: {len(result)}). "
            "Try regenerating or check your model/API key."
        )

    return result