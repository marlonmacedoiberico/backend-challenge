---
name: ask-and-solve-missing-requirements
description: "Ask focused questions about MISSING-REQS.md and resolve the answers together by updating requirements and removing resolved gaps. Use when asked to work through missing requirements, normally within the requirements specialist workflow."
---

# Ask and solve missing requirements

Work with the user to turn unanswered decisions in MISSING-REQS.md into documented, testable requirements. This is the requirements specialist's normal skill for an interactive requirements interview.

## Read and reconcile

Resolve project paths from the root containing this skill, three directories above this file's directory. Read [AGENTS.md](../../../AGENTS.md), its steering documents, [requirements-specialist.md](../../requirements-specialist.md), [MISSING-REQS.md](../../../MISSING-REQS.md), and relevant requirements documents.

Compare each gap with confirmed decisions and conversation answers before asking. Record answers already given and remove resolved questions. Existing application behavior is not evidence of user approval. If MISSING-REQS.md is absent, identify gaps from available specifications and create it with only unresolved decisions.

## Ask and solve together

- Ask numbered, focused questions grouped by related behavior. Cover the requested scope across the interview. When asked for all questions, present all remaining questions in groups and allow answers in batches.
- Suggestions and defaults remain proposals until accepted. Do not invent answers to skipped or incomplete questions.
- Record clear portions immediately; ask targeted follow-ups for ambiguity, contradictions, and unanswered portions.
- Distinguish current from future functionality. Agreement on future behavior does not move a feature into the MVP without an explicit scope change.

## Update after each answer batch

Record confirmed behavior in the appropriate requirements document using EARS and the specialist's syntax reference. Preserve existing IDs, assign stable IDs to new requirements, and separate future requirements.

Update product.md for scope, audience, and future-functionality decisions. Update tech-stack.md for technology or platform decisions. Keep detailed behavior in requirements documents and maintain links.

In the same update, remove resolved questions from MISSING-REQS.md. Retain only unanswered portions of partly resolved items. Add follow-up gaps only to make agreed behavior testable or address concrete contradictions or consequential edge cases; avoid speculative features and design tasks. Label remaining gaps by current or future functionality.

Review affected documents for consistency, briefly state what was resolved, and ask the next relevant questions. Continue across replies until requested gaps are resolved, the user pauses, or a required answer is pending. Never claim completion while requested decisions remain unanswered.

## Completion

When all requested gaps are resolved, retain MISSING-REQS.md with a status stating no unresolved decisions remain in the reviewed scope and links to confirmed requirements. Retain gaps outside the requested scope and state that limitation explicitly.

Edit specifications and project documentation only. This skill does not authorize application implementation, commits, or pushes.
