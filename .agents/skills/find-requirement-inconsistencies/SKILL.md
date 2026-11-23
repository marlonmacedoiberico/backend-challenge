---
name: find-requirement-inconsistencies
description: "Find and resolve conflicts and inconsistencies in project requirements, acceptance test cases, and related specifications. Use for /find-requirement-inconsistencies or a requirements consistency review, normally within the requirements specialist workflow."
---

# Find requirement inconsistencies

Usage: `/find-requirement-inconsistencies [feature or document scope]` or `$find-requirement-inconsistencies`.

This is the requirements specialist's command for analyzing and resolving requirement conflicts. If no scope is supplied, review the project's feature requirements and their related documentation. Creating this skill does not invoke the review.

## Establish scope and authority

Resolve paths from the project root containing this skill, three directories above its directory. Read [AGENTS.md](../../../AGENTS.md), its steering documents, and [requirements-specialist.md](../../requirements-specialist.md). Inspect relevant requirements, acceptance test cases, design and decision documents, the repository's unresolved-requirements tracker, and confirmed conversation decisions.

Keep current and future functionality separate. Existing application behavior and proposed design choices are not approved requirements. Preserve explicit user decisions; if authoritative decisions conflict, ask which outcome is intended rather than silently choosing one.

## Analyze consistency

Compare requirements applying to the same entity, trigger, or state. Examine obligations versus prohibitions, limits and defaults, validation versus normalization, timing, persistence, shared references, deletion and replacement, active operations, failure outcomes, and scope status. Walk through concrete success, failure, and boundary scenarios, including concurrent activity when consequential.

Check acceptance test cases against their referenced requirements and check product scope, design, and technical decisions for drift. Verify IDs, references, and requirement-to-design mappings where present.

Distinguish contradictions from ambiguity, missing behavior, duplication, and technical proposals awaiting review. A documented exception is not a conflict. Avoid inventing speculative features or treating ordinary design tasks as missing user requirements.

For each finding, identify the category, affected IDs or passages, a concrete triggering scenario, the incompatible or unclear outcomes, and the decision needed. State whether the issue concerns current or future functionality.

## Resolve and synchronize

- Correct stale wording when confirmed user decisions already determine the answer. Do not ask again about resolved decisions.
- If an answer is needed, record a stable consistency-question ID in the unresolved-requirements tracker and ask a focused question. Mark suggested resolutions as proposals. Use the [ask-and-solve-missing-requirements skill](../ask-and-solve-missing-requirements/SKILL.md) to work through the answers together.
- Record confirmed resolutions in EARS without changing unrelated behavior. Preserve requirement IDs and existing acceptance test case IDs; use ATC- for new acceptance test cases.
- Update affected requirements, acceptance test cases, product scope, design, and decision documents together. Update tech-stack.md only when a technology or platform decision changes.
- Remove resolved questions from the tracker in the same update. Retain unanswered portions; if none remain, keep a clear resolved status and links to the confirmed requirements.
- Recheck dependent requirements and the triggering scenarios after each resolution. Do not mark a conflict resolved merely because it was removed from the question list.

## Report

State the reviewed scope, findings, corrections made, remaining questions, and checks performed. Cite affected documents and IDs. If no inconsistencies are found, say so within the reviewed scope without claiming all possible behavior has been specified. Continue resolution across user replies until requested conflicts are resolved, the user pauses, or required input is pending.

Edit specifications and project documentation only. This command does not authorize implementation, commits, pushes, or approval-state changes.
