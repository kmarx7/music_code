# DECISIONS.md — Architecture Decision Records

**Project:** Music Score Platform  
**Baseline:** 2026-11-07  
**Status legend:** Proposed · Accepted · Superseded · Rejected

This file records **architectural choices**, their trade-offs and change history. The existing baseline is not altered merely because a new Codex session suggests a different implementation.

## Decision governance

1. Before proposing a change, inspect `docs/ARCHITECTURE.md`, `docs/PRD.md`, existing contracts and code.
2. Record a new **Proposed** ADR with problem, options, impact, migration and tests.
3. Obtain explicit user approval of the structural change.
4. Only then mark the ADR **Accepted**, change `docs/ARCHITECTURE.md` and implement.
5. When an ADR is replaced, preserve it and mark it **Superseded by ADR-XXX**.
6. Do not treat an automatically written document or an AI recommendation as user approval.

> The records below capture the architectural baseline agreed for initial implementation. Concrete library versions and optional integrations still need Phase 0 verification.

---

## ADR-001 — Modular monolith with layered domain boundary

- **Status:** Accepted (MVP baseline)
- **Date:** 2026-11-07
- **Context:** A solo developer using Codex needs maintainable modules without microservice complexity.
- **Decision:** Use Next.js/React/TypeScript in one repository; separate Domain, Application, feature/public interfaces, Adapters and Presentation.
- **Rejected alternatives:** Multiple independent backends; a monolithic page component with music logic embedded in UI.
- **Consequences:** Requires explicit boundaries and import checks; reduces deployment complexity; future extraction remains possible.
- **Guardrail:** No alternate framework, server or architecture without a new approved ADR.

## ADR-002 — Single canonical Score model

- **Status:** Accepted (MVP baseline)
- **Date:** 2026-11-07
- **Context:** Independent editor, playback, export and transcription modules can accidentally disagree about what the notes are.
- **Decision:** One versioned domain `Score` with pitches, notation spelling, 960-PPQ positions and events; update via domain commands. Read-only projections allowed; second writable music model not allowed.
- **Alternatives considered:** Renderer-native objects as canonical data; feature-local note arrays.
- **Consequences:** Requires adapters and schema migrations; ensures consistent transformations and exports.
- **Validation:** Cross-feature consistency tests, schema validation, Undo/Redo regression tests.

## ADR-003 — Local-first persistence with IndexedDB

- **Status:** Accepted (MVP baseline)
- **Date:** 2026-11-07
- **Context:** MVP should work without signup, cloud database or network connectivity after asset load.
- **Decision:** Implement a `ScoreRepository` port with IndexedDB adapter; provide backup/restore and make browser-storage deletion risks clear.
- **Deferred alternative:** Supabase authentication, synchronization and version conflict resolution after MVP.
- **Consequences:** Simpler initial deployment; user backup is important; repository abstraction allows future cloud adapter.
- **Validation:** Save/load, migration, data integrity and recovery tests.

## ADR-004 — Non-destructive practice state

- **Status:** Accepted (MVP baseline)
- **Date:** 2026-11-07
- **Context:** Practice tempo and loop boundaries should not alter the composition's intended tempo or notes.
- **Decision:** Keep `practiceSpeed`, loop ticks and transport states outside the canonical music content. Only explicit score-edit commands change score tempo/notes.
- **Consequences:** Export defaults to original score tempo; separate playback and persistence concerns.
- **Validation:** Playback speed/loop tests and checks that Score remains unchanged.

## ADR-005 — Browser-first monophonic transcription

- **Status:** Accepted (MVP baseline)
- **Date:** 2026-11-07
- **Context:** General polyphonic audio-to-score transcription is too complex for the first product.
- **Decision:** Capture microphone locally, derive confidence-rated monophonic note candidates, then review/commit them as edits. Use recording-after-analysis as the first reliable path; live estimated pitch display is allowed.
- **Consequences:** Limited audio scope, lower operational cost and improved privacy; device/browser testing needed.
- **Validation:** Controlled note-level evaluation, silence/repeated-note/octave tests, mic-permission failure handling.

## ADR-006 — MVP feature additions are part of the baseline

- **Status:** Accepted (MVP baseline)
- **Date:** 2026-11-07
- **Context:** User confirmed transposition and five high-value music education/practice/editor features in addition to core transcription/editing.
- **Decision:** Include whole-score transpose, practice speed, A–B loop, fixed-Do/letter labels, range analysis with feasible transpose suggestions, and monophonic selection/copy/paste in the MVP. Full list and criteria are in `docs/PRD.md`.
- **Consequences:** More implementation increments, but no reduction in confirmed scope; leverage canonical Score and playback engine.
- **Validation:** Separate feature acceptance and cross-feature integration tests.

## ADR-007 — Enforce architecture through tooling and explicit review

- **Status:** Accepted (MVP baseline)
- **Date:** 2026-11-07
- **Context:** Documentation alone does not prevent Codex from introducing duplicated types or forbidden imports.
- **Decision:** Configure `typecheck`, `lint`, `test`, `check:architecture`, and `build` commands during Phase 0; test forbidden-import detection. Require user approval for structural revisions.
- **Consequences:** Initial setup cost; long-term consistency gains. Tools cannot prove all semantic duplication, so code review remains necessary.
- **Validation:** Negative fixture for forbidden import, architecture checks in CI when configured.

---

## ADR proposal template

```markdown
## ADR-XXX — Short title

- **Status:** Proposed
- **Date:** YYYY-MM-DD
- **Requested by:**
- **Problem:**
- **Current contract / affected modules:**
- **Options:**
  1. Keep current structure:
  2. Smallest viable adjustment:
  3. Alternative:
- **Recommendation and reasons:**
- **Breaking changes / migration:**
- **Tests and rollback:**
- **User approval:** Pending (do not implement structural change)
- **Decision date:**
- **Supersedes:** None
```

## Change log

| Date | Change | Approval status |
|---|---|---|
| 2026-11-07 | Created baseline ADR-001–007 | Captures approved project direction; implementation details pending Phase 0 |
