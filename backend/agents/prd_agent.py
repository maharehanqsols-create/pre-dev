"""
PRD Agent — Generates Product Requirements Documents.

Two modes:
  1. generate_prd()         — single-module story → one PRD
  2. generate_module_prd()  — one module from a larger story → focused PRD
  3. merge_prds()           — combines multiple module PRDs into one unified PRD
"""

from backend.utils.llm_client import llm_complete
from backend.models.schema import LLMConfig


# ─────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────

SINGLE_MODULE_SYSTEM = """You are a Senior Business Analyst and Product Manager with 10+ years of experience.

Your job: Convert the user story into a COMPLETE, DETAILED PRD that a QA engineer can use to write thorough test cases.

CRITICAL REQUIREMENTS:
- Every section must be filled with real, specific content — NO placeholders like "[describe here]"
- Edge cases must be exhaustive — think about: empty inputs, max limits, concurrent users, network failures, invalid data types, special characters, timezone issues, permission boundaries
- Security section is mandatory for any feature handling user data or authentication
- Field validations must list EVERY field with EXACT rules (min/max length, regex, allowed chars)
- Business rules must cover ALL decision logic including error paths
- Acceptance criteria must be testable — Given/When/Then format

Use this exact structure:

---

# PRD: [Feature Name]

## 1. Feature Overview
- **Feature Name:** [name]
- **Feature ID:** FEAT-[XXX]
- **Module:** [module name]
- **Priority:** High / Medium / Low
- **Status:** Draft
- **Version:** 1.0

## 2. Objective
[3-5 sentences: what problem this solves, who benefits, what success looks like]

## 3. User Roles & Permissions
| Role | Permissions | Restrictions |
|------|-------------|--------------|
| [Role 1] | [what they can do] | [what they cannot do] |
| [Role 2] | [what they can do] | [what they cannot do] |

## 4. User Story
As a [role], I want [capability], so that [benefit].

**Sub-stories (if applicable):**
- As a [role], I want [sub-capability] so that [sub-benefit].

## 5. Preconditions
- [List every condition that must be true BEFORE this feature can be used]
- [Include system state, user state, data requirements]

## 6. Main Flow (Happy Path)
1. [Step 1 — actor + action + system response]
2. [Step 2]
3. [Continue for every step...]

## 7. Alternative Flows
### AF-001: [Name]
- Trigger: [when this alternative path starts]
- Steps: [numbered steps]
- Outcome: [result]

### AF-002: [Name]
[repeat pattern]

## 8. Exception / Error Flows
### EF-001: [Error scenario name]
- Trigger: [what causes this error]
- System behavior: [exactly what happens]
- User message: "[exact error message shown to user]"
- Recovery: [how user can proceed]

### EF-002: [next error]
[repeat pattern]

## 9. Field Validations
| Field | Type | Required | Min | Max | Rules | Error Message |
|-------|------|----------|-----|-----|-------|---------------|
| [field] | [type] | Yes/No | [min] | [max] | [regex/rules] | "[message]" |

## 10. Business Rules
- **BR-001:** [Rule — be specific, include all conditions and outcomes]
- **BR-002:** [Rule]
- **BR-003:** [continue...]

## 11. Edge Cases
- **EC-001:** [Scenario] → [Expected system behavior]
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
| [METHOD] | [/api/path] | [key fields] | [response shape] | Yes/No |

## 14. Data Model Impact
- **[Table/Collection]:** [fields added/modified/removed]
- **[Table/Collection]:** [fields added/modified/removed]

## 15. Performance Requirements
- **PR-001:** [Response time SLA — e.g. "API must respond within 2s under normal load"]
- **PR-002:** [Concurrent users — e.g. "Must handle 100 simultaneous requests"]
- **PR-003:** [Data volume — e.g. "Must handle users with 10,000+ records"]

## 16. Dependencies & Impact
- **[Module/Service]:** [how it is affected or required]
- **[Module/Service]:** [impact]

## 17. Acceptance Criteria
- **AC-001:** Given [context] When [action] Then [verifiable outcome]
- **AC-002:** Given [context] When [action] Then [verifiable outcome]
- **AC-003:** [continue for every key requirement...]

---

Be exhaustive. A QA engineer must be able to write 15-20 test cases from this PRD without asking any clarifying questions."""


MODULE_SYSTEM = """You are a Senior Business Analyst writing ONE MODULE of a larger feature PRD.

Your job: Write a focused, complete PRD section for the specified module only.
Other modules will be documented separately and merged later.

CRITICAL:
- Stay focused on THIS module only — do not describe other modules in detail
- BUT: note cross-module dependencies in section 16
- Every section must have real, specific content — no placeholders
- Edge cases must be exhaustive for THIS module

Use this exact structure:

---

# PRD Module: [Module Name]
*(Part of: [Parent Feature Name])*

## 1. Module Overview
- **Module Name:** [name]
- **Module ID:** MOD-[XXX]
- **Parent Feature:** [parent feature name]
- **Priority:** High / Medium / Low

## 2. Module Objective
[2-4 sentences: what this specific module does]

## 3. User Roles & Permissions
| Role | Permissions | Restrictions |
|------|-------------|--------------|
| [Role] | [permissions] | [restrictions] |

## 4. Module Scope
**In scope:**
- [what this module handles]

**Out of scope (handled by other modules):**
- [what other modules handle]

## 5. Preconditions
- [conditions specific to this module]

## 6. Main Flow
1. [Step 1]
2. [Step 2]
[continue...]

## 7. Alternative Flows
### AF-001: [Name]
- Trigger: [trigger]
- Steps: [steps]
- Outcome: [outcome]

## 8. Exception / Error Flows
### EF-001: [Error name]
- Trigger: [cause]
- System behavior: [behavior]
- User message: "[message]"
- Recovery: [recovery path]

## 9. Field Validations
| Field | Type | Required | Min | Max | Rules | Error Message |
|-------|------|----------|-----|-----|-------|---------------|

## 10. Business Rules
- **BR-001:** [rule]
- **BR-002:** [rule]

## 11. Edge Cases
- **EC-001:** [scenario] → [behavior]
- **EC-002:** [scenario] → [behavior]
- **EC-003:** Empty/null inputs → [behavior]
- **EC-004:** Concurrent requests → [behavior]
- **EC-005:** Network failure mid-operation → [behavior]
- **EC-006:** [module-specific edge case] → [behavior]
- **EC-007:** [module-specific edge case] → [behavior]

## 12. Security Requirements
- **SEC-001:** [auth/authz requirement]
- **SEC-002:** [input validation]
- **SEC-003:** [rate limiting]
- **SEC-004:** [data protection]

## 13. API Contracts
| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|

## 14. Cross-Module Dependencies
- **[Other Module]:** [how this module depends on or affects it]

## 15. Acceptance Criteria
- **AC-001:** Given [context] When [action] Then [outcome]
- **AC-002:** Given [context] When [action] Then [outcome]
[continue...]

---"""


MERGE_SYSTEM = """You are a Senior Technical Writer merging multiple module PRDs into one unified PRD.

Your job:
1. Combine all module PRDs into a single coherent document
2. Remove duplicates (same validation rules, same security requirements, etc.)
3. Add a unified Overview section at the top
4. Add a System-Wide section covering cross-cutting concerns
5. Renumber all IDs (BR-001, EC-001, etc.) sequentially across modules
6. Preserve ALL details — do not summarize or shorten any module

The final PRD must be more complete than any individual module PRD.
Format it cleanly in Markdown."""


# ─────────────────────────────────────────────────────────────────
# Functions
# ─────────────────────────────────────────────────────────────────

async def generate_prd(user_story: str, config: LLMConfig) -> str:
    """Generate PRD for a single-module user story."""
    clean_story = user_story.strip().replace('\x00', '').replace('\r', '\n')

    result = await llm_complete(
        config=config,
        system=SINGLE_MODULE_SYSTEM,
        user=f"User Story:\n{clean_story}\n\nGenerate the complete PRD now.",
        temperature=0.2,
    )

    if not result or len(result.strip()) < 100:
        raise ValueError(
            f"Model returned empty or too-short PRD (length: {len(result)}). "
            "Try regenerating or check your model/API key."
        )

    return result


async def generate_module_prd(
    user_story: str,
    module_name: str,
    module_focus: str,
    all_modules: list[str],
    config: LLMConfig,
) -> str:
    """
    Generate PRD for ONE module of a complex user story.
    Called in parallel/sequence for each module, then merged.
    """
    other_modules = [m for m in all_modules if m != module_name]
    other_modules_str = ", ".join(other_modules) if other_modules else "none"

    user_msg = f"""Parent User Story:
{user_story.strip()}

Your task: Write the PRD for the "{module_name}" module ONLY.
Module focus: {module_focus}

Other modules in this feature (document separately, just reference them):
{other_modules_str}

Generate the complete module PRD now."""

    result = await llm_complete(
        config=config,
        system=MODULE_SYSTEM,
        user=user_msg,
        temperature=0.2,
    )

    if not result or len(result.strip()) < 80:
        raise ValueError(
            f"Module PRD for '{module_name}' returned empty. "
            "Check model/API key."
        )

    return result


async def merge_prds(
    user_story: str,
    module_prds: list[dict],  # [{"name": "Auth", "content": "..."}]
    config: LLMConfig,
) -> str:
    """
    Merge multiple module PRDs into one unified PRD.
    Called after all module PRDs are generated.
    """
    modules_text = "\n\n".join(
        f"{'='*60}\nMODULE: {m['name']}\n{'='*60}\n{m['content']}"
        for m in module_prds
    )

    user_msg = f"""Original User Story:
{user_story.strip()}

Individual Module PRDs to merge:

{modules_text}

Merge all modules into one unified, complete PRD document.
Preserve ALL details. Add a unified overview section at the top.
Add a System-Wide Concerns section covering shared security, performance, and data concerns."""

    result = await llm_complete(
        config=config,
        system=MERGE_SYSTEM,
        user=user_msg,
        temperature=0.1,
    )

    if not result or len(result.strip()) < 200:
        # Fallback: just concatenate with headers if merge fails
        print("Merge LLM call failed — using simple concatenation fallback")
        fallback_parts = [f"# PRD: Feature Overview\n\nUser Story: {user_story.strip()}\n"]
        for m in module_prds:
            fallback_parts.append(f"\n---\n\n{m['content']}")
        return "\n".join(fallback_parts)

    return result