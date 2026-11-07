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

## ADR-008 — Phase 1 렌더링·재생 의존성 도입 (VexFlow, Tone.js)

- **Status:** Accepted
- **Date:** 2026-11-07
- **Requested by:** 사용자 (Phase 1 착수 승인)
- **Problem:** 악보 렌더링(MVP-004)과 스케줄된 재생(MVP-012)에 검증된 라이브러리가 필요하다. 자체 구현은 리스크와 검증 부담이 크다.
- **Current contract / affected modules:** ARCHITECTURE §2 기준선, `src/adapters/vexflow`, `src/adapters/tone`, `src/features/score-editor`, `src/features/playback`
- **Options:**
  1. 자체 SVG 렌더러/오디오 스케줄러 구현 — 통제력은 높지만 기간·정확도 리스크 큼
  2. **VexFlow + Tone.js 도입** — 아키텍처 기준선과 일치
  3. VexFlow만 도입, 재생은 네이티브 Web Audio — 의존성은 줄지만 스케줄러 직접 구현
- **Recommendation and reasons:** 2안. 기준선과 일치하고, 어댑터 경계 뒤에 격리할 수 있다.
- **Breaking changes / migration:** 없음(신규 어댑터만 추가). 두 라이브러리는 **클라이언트 어댑터에서만** 초기화하며 SSR/서버 컴포넌트에서 import 하지 않는다. 번들 크기 증가는 어댑터 청크로 국한한다.
- **Tests and rollback:** 렌더 스모크, 재생 스케줄 단위 테스트, 빌드, 이후 E2E. 문제 시 어댑터 구현만 교체(도메인 불변).
- **User approval:** **Approved (2026-11-07)** — VexFlow + Tone.js, Playwright는 렌더링 구현 후로 연기
- **Decision date:** 2026-11-07
- **Supersedes:** None

---

## ADR-009 — 마디 경계 분할 + 명시적 타이 연결 (Phase 1-D)

- **Status:** Accepted
- **Date:** 2026-11-07
- **Requested by:** 사용자 (Phase 1-D 승인 — "①번 조건부 승인")
- **Problem:** 마디를 넘는 음(예: 4/4 마지막 박에서 시작하는 2박 음)을 표현할 수 없다. 현재는
  `EVENT_OUT_OF_MEASURE`로 거부한다. 올바른 기보(분할 + 붙임줄), 정확한 재생(중복 어택 없음),
  Undo/Redo 일관성, 저장·출력 확장 가능성이 필요하다.
- **Current contract / affected modules:** `Part`(ties 없음), `NoteEvent`(타이 메타데이터 없음), `schemaVersion = 1`,
  `src/domain/score/{types,create,validate,serialize}`, `src/domain/commands/apply.ts`,
  `src/application/append-note.ts`, `src/adapters/{vexflow,tone}`, `/editor`
- **Options:**
  1. `NoteEvent.tieTo?: string` 단일 플래그 — 관계가 음표마다 흩어지고, 불일치·중복 검증이 필요하다
  2. **`Part.ties: TieLink[]` 명시적 연결 목록** — 관계를 한 곳에 저장, 체인/분기 검증이 단순, 음표 타입 불변
  3. 이벤트가 마디를 넘도록 검증 완화 — 모델이 기보 불가능한 상태를 허용하고 렌더러·재생이 매번 분할해야 한다
- **Recommendation and reasons:** 2안. 사용자가 "단순 tie 플래그보다는 음표 간 연결 관계를 명시적으로 표현"을 요구했다.
  `TieLink { from, to }`는 ID 참조이므로 복사/이동에도 관계가 명시적이고, 단일 출처라 불일치가 생기지 않는다.
  `NoteEvent`를 건드리지 않아 기존 커맨드·검증·어댑터의 변경 범위가 최소다.
- **Breaking changes / migration:** `Part.ties` 추가로 **schemaVersion 2**. v1 문서는 읽을 때
  각 part에 `ties: []`를 추가해 v2로 마이그레이션한다(원본 거부·손실 없음). 그 외 버전은 계속 거부한다.
  새 Command 에러 코드 `NOT_NOTATABLE`, `TIE_EDIT_UNSUPPORTED`가 추가된다(기존 코드 유지).
- **Tests and rollback:** 분할·검증·체인 병합·재생·Undo/Redo·저장/복원 단위 테스트 + E2E 회귀.
  문제 시 `Part.ties`를 제거하고 schemaVersion을 1로 되돌리며, 도메인 함수(`tie.ts`)만 삭제하면 된다.
- **User approval:** **Approved (2026-11-07)** — 조건: 단순 플래그 대신 명시적 연결 관계 모델
- **Decision date:** 2026-11-07
- **Supersedes:** None

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
| 2026-11-07 | ADR-008 Accepted — VexFlow 5.0.0 / Tone.js 15.1.22 도입 (사용자 승인) | Approved |
| 2026-11-07 | ADR-009 Accepted — 마디 경계 분할 + `Part.ties` 명시적 연결, schemaVersion 2 (사용자 조건부 승인) | Approved |


## ADR-010 — 저장 revision/OCC 및 영속 삭제 보호

- 상태: **Accepted**, 2026-11-08 사용자 명시 승인.
- 문제: 탭 간 오래된 쓰기/삭제, 삭제 ID 재생성, 저장 상태 불일치, 페이지 이탈 위험.
- 결정: Score 외부 envelope revision, 원자적 create/update/delete CAS, 영속 Tombstone,
  BroadcastChannel 알림 후 DB 재확인, useAutosave 단일 상태 소유, dirty beforeunload/hidden flush/focus 재확인.
- DB 버전 1→2는 구버전 unconditional writer를 차단한다. blocked는 오류로 안내하고
  versionchange는 연결을 닫고 이후 쓰기를 거부한다. 정상 legacy revision은 0으로 읽으며 정상 수정 때만 지연 전환한다.
- 충돌/삭제 후 자동 재시도·병합·덮어쓰기 없음. 메모리/Undo 보존, JSON 백업·새 ID 저장·확인 후 최신본 열기 제공.
- 대안: 알림 단독은 유실 시 보호 불가. Web Locks 단독은 구버전 writer/삭제 정책을 대체하지 못한다.
- 제외: Web Locks, 강제 종료 복구 저널, 자동 Tombstone 정리, cloud sync.
- 영향: Repository 공개 쓰기 계약 변경. Score schemaVersion 2/Part.ties/Command/음악 모델은 그대로다.
- 한계: dirty 안내/hidden 조기 저장은 강제 종료 무손실을 보장하지 않는다. 구버전 탭은 백업 후 닫아야 업그레이드 가능하다.
- 롤백: DB v2를 이해하는 빌드만 사용. v1 코드로 다운그레이드하거나 DB를 삭제하지 않는다.
- 검증: 동시 CAS/삭제/abort/legacy/blocked/versionchange, 훅 상태/이탈, 실제 같은 context 두 탭 E2E.
