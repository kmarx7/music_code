# AGENTS.md — Music Score Platform

> Project-level instructions for Codex. **Read before every code-changing task.**
> Version: 2.0 · Baseline: 2026-11-07 · Language for reports: Korean

## 0. Instruction precedence and scope

- Follow system/developer instructions first, then this repository's applicable `AGENTS.md` files and the approved project documents.
- This root file governs the entire repository. Do not add nested `AGENTS.md` files merely to circumvent these rules.
- `docs/PRD.md` defines **what** is in the MVP; `docs/ARCHITECTURE.md` defines **how it is structured**; `docs/DECISIONS.md` records architectural decisions. Read the current files from disk, not remembered summaries.
- If a document is missing, inconsistent, or materially underspecified, report the gap. Do not invent a contradictory architecture.

## 1. Product mission and MVP boundary

Build a local-first web app for monophonic humming transcription, virtual piano input, score editing, transposition, practice, note labels, range analysis, clipboard editing, playback, and PDF/MIDI/MusicXML export.

The **approved MVP scope** and acceptance criteria are in [`docs/PRD.md`](docs/PRD.md). Do not silently remove a confirmed feature or add deferred features to the MVP.

Deferred: authentication/cloud sync, polyphonic transcription, commercial-song separation, piano roll editor, chord recommendation, MP3/WAV import, mandatory external MIDI input, Jeongganbo/Gayageum special techniques, payments.

## 2. Required reading before work

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DECISIONS.md`
4. If present: `docs/DATA_MODEL.md`, `docs/MODULE_CONTRACTS.md`, `docs/TASKS.md`, `docs/TEST_PLAN.md`
5. Read implementation files and tests relevant to the requested feature.

Before writing code, review `git status`, identify affected modules and relevant interfaces, and search for existing implementations.

## 3. Architectural contract

- Use **Next.js App Router + React + TypeScript**, organized as a **modular monolith** with Domain / Application / Adapters / Presentation boundaries.
- `src/domain` owns the **one canonical Score model**, music theory, music timing, and edit invariants. Never introduce parallel writable `Score`, `NoteEvent`, `Pitch`, `Measure`, or beat/tick models.
- `src/domain` MUST NOT import React, Next.js, Web Audio/browser APIs, VexFlow, Tone.js, IndexedDB, Supabase or other runtime integrations.
- Persistent score mutations pass through the approved edit-command/application flow; UI and external adapters do not mutate Score directly.
- Notation rendering, playback, analysis, storage and export consume the canonical model or derived **read-only projections**, never a second source of truth.
- Separate music-content state, UI selection/preview state, and high-frequency recording/playback state.
- Feature modules expose stable public entrypoints. Do not reach into another feature's internal files.
- Prevent circular dependencies, especially domain-to-outer-layer imports.
- Practice speed and A–B looping are **non-destructive session state**, not modifications to original score tempo/notes.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for ownership, flow, module boundaries and dependency rules.

## 4. Reuse before creating (mandatory)

Before adding a type, hook, store, service, engine, component, module or dependency:

1. Search the repository for matching functionality, types, APIs and tests.
2. Prefer reuse or extension of the established module/public interface.
3. State why existing code cannot reasonably satisfy the requirement if a new module is necessary.
4. Add the **smallest coherent change** without unrelated refactoring.
5. Add or update tests for the affected contract.

A different file location, naming preference, or alternative library is **not** sufficient justification for duplicating a working module.

## 5. Architecture change approval gate

Without explicit user approval, **DO NOT**:

- Replace the framework, package manager, core stack, architecture pattern or storage engine.
- Introduce a second state management system or canonical Score representation.
- Move a module to a different architectural layer or change public contracts incompatibly.
- Add new backends, services, microservices, databases or new production dependencies.
- Redesign working screens, delete tests, or change functionality beyond the requested task.
- Edit architectural docs to retroactively justify an unapproved structural change.

If a change is necessary:

1. **Pause only the blocked structural change.**
2. Present a change request with problem, existing behavior, alternatives, impact, migration and tests.
3. Request explicit approval before changing the structure.
4. Once approved, add a new ADR in `docs/DECISIONS.md`, update `docs/ARCHITECTURE.md` and relevant contracts, then implement.
5. Continue unrelated safe work where possible.

Routine implementation details within existing public contracts do not require architecture approval. Document material decisions proportionately.

## 6. Per-task execution protocol

**Inspect → Plan → Implement → Validate → Report**

### Inspect
- Read the mandatory docs and `git status`.
- Identify code already performing the task or part of it.
- Flag conflicting local changes; do not overwrite user work.

### Plan
- State the requested behavior, modules to reuse, files expected to change, contract impact, tests and acceptance criteria.
- For a structural deviation, use the approval gate instead of implementation.

### Implement
- Maintain TypeScript strict typing.
- Write pure domain logic where possible.
- Keep modifications scoped, preserve exported APIs, and never fabricate success.
- Follow the lockfile and project conventions; justify new runtime packages.

### Validate
Run the commands **when configured**:

```bash
npm run typecheck
npm run lint
npm run test
npm run check:architecture
npm run build
```

`check:architecture` is a **custom project script** to be implemented and tested in Phase 0; do not claim it exists until configured. Include regression tests for music-domain invariants and integration behavior. Record any command not run and why.

### Report
Report in Korean:
- Task ID / summary and feature status
- Reused modules and new modules with rationale
- Changed files
- Actual commands run and pass/fail results
- Architectural deviations or approval references
- Remaining issues and next task

Update `docs/TASKS.md` if it exists. Do not commit, push, deploy or perform destructive operations unless requested/authorized by the current workflow.

## 7. Definition of Done

- Requested workflow works in the supported environment.
- Domain invariants and public interfaces remain valid.
- Relevant unit/integration/E2E tests pass or limitations are explicitly reported.
- Typecheck, lint, architecture checks and production build pass where applicable.
- No new forbidden dependency or duplicate mutable source of truth appears.
- Documentation and task status accurately reflect implementation.

A feature with unrun or failed critical tests is **not fully verified**.

## 8. Implementation ordering

- **Phase 0:** documents, app skeleton, canonical model, commands, test and architecture guardrails.
- **Phase 1:** virtual piano → score editing/rendering → playback → local persistence.
- **Phase 2:** transposition → note names → range and transposition suggestions.
- **Phase 3:** playback-speed control → A–B looping → selection and clipboard.
- **Phase 4:** humming capture → pitch detection → segmentation → quantization → editable Score.
- **Phase 5:** PDF/MIDI/MusicXML exports and compatibility tests.
- **Phase 6:** integration, mobile, accessibility, recovery, privacy and beta deployment.

The final **MVP** includes all phases 0–6. Earlier milestones are independently testable development increments, not reductions in approved MVP scope.

## 9. Working conventions

- Explain code and architectural decisions in **Korean**; use clear English names for source symbols.
- Do not assume prior Codex conversation context is accurate; inspect repository files.
- Never claim a microphone, export, data recovery or multi-browser feature was tested unless actual evidence exists.
- Use licensed test audio or synthetic fixtures; do not embed copyrighted commercial recordings without permission.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
