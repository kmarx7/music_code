# MIDI 읽기 (악보 올리기 3단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/import`가 `.mid`·`.midi`(SMF 형식 0·1)를 MusicXML과 같은 흐름으로 받는다.

**Architecture:** MIDI 바이트를 Adapter에서 바로 Domain `ImportedScore`로 읽고, 기존 `extractMelody` → `buildImportedScore` → `ImportFlow`를 그대로 쓴다. 리듬 규칙만 `extractMelody` 옵션으로 갈린다.

**Tech Stack:** TypeScript, Vitest, Playwright. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-16-midi-import-design.md` (1·2단계 설계 `2026-11-16-score-import-design.md` 위에 더함)

## Global Constraints

- Domain은 브라우저 API·React를 쓰지 않는다. application은 adapters를 import하지 않는다.
- 파일 5 MB 상한, 기기 밖 전송 없음, 새 런타임 의존성 없음.
- 오류 문구(정확히): "지원하지 않는 MIDI 형식(형식 2)입니다.", "지원하지 않는 MIDI 시간 형식(SMPTE)입니다.", "MIDI 파일로 읽을 수 없습니다."
- 커밋은 사용자 요청 시에만.

## Review Focus

1. 같은 채널·같은 음이 겹쳐 켜짐 — 먼저 켠 것부터 짝짓는다. (Task 1 `pairs overlapping same notes first in, first out`)
2. 연주 기록(±10 tick) — 파트 전체가 16분음표 격자로, 보고 1줄. (Task 2 `performance MIDI snaps the whole part`)
3. 앱이 내보낸 MIDI 왕복 — 음·시작·길이·템포·박자·조가 같다. (Task 1 `round trip of the app's own MIDI`)
4. 형식 0 여러 채널 + 드럼 — 채널마다 파트, 채널 10 제외·보고. (Task 1)
5. 소수 템포(예: 60,000,000/µs가 나누어떨어지지 않음) — 잘못된 "범위로 맞춤" 보고가 없다. (Task 2 `fractional tempo is rounded without a clamp notice`)

---

### Task 1: MIDI → ImportedScore (Adapter)

**Files:** Create `src/adapters/midi/reader.ts`, `tests/fixtures/smf-builder.ts`, `tests/unit/midi-reader.test.ts`; Modify `src/adapters/midi/index.ts`, `src/domain/score/import-model.ts`(`ignored.drums?: number`).

**Interfaces — Produces:** `readMidiImport(bytes: Uint8Array): { ok: true; score: ImportedScore } | { ok: false; code: "NOT_MIDI" | "FORMAT_2" | "SMPTE" | "CORRUPT"; message: string }`. 테스트 도우미 `makeSmf({ format, division, tracks: number[][] })`(트랙은 delta·이벤트 바이트 나열, 트랙 끝 메타 자동).

- [ ] Tests: round trip of the app's own MIDI(`writeMidi` 25현·조표·템포), running status·velocity 0 off, pairs overlapping same notes first in first out, format 0 channels become parts and drums are counted, key meta spells (F# vs Gb), no key meta → part.keys 빈 배열, track/instrument names and title, rejects format 2 / SMPTE / truncated / not MIDI with the exact messages.
- [ ] Run → FAIL; implement (spec §3.1–3.4); run → PASS; typecheck·architecture.

### Task 2: 리듬 규칙과 새 보고 (Domain + 문구)

**Files:** Modify `src/domain/score/melody-extract.ts`, `src/features/score-import/notices.ts`, tests `melody-extract.test.ts`, `import-notices.test.ts`.

**Interfaces:** `extractMelody(score, { partIndex?, fallbackTitle?, rhythm?: "exact-or-grid" | "grid-all-if-any-off" })`(기본 앞의 것). 새 코드 `PERFORMANCE_QUANTIZED`(그 규칙에서 바뀐 음 수), `DRUMS_IGNORED`(`ignored.drums`), `KEY_ASSUMED`(파트에 조표가 하나도 없을 때). 템포 보고는 반올림 전 값이 [20,400] 밖일 때만.

- [ ] Tests: performance MIDI snaps the whole part, notation MIDI stays exact, drums/key notices, fractional tempo is rounded without a clamp notice; sentences for new codes.
- [ ] Run → FAIL; implement; run → PASS.

### Task 3: 파일 판별·화면·E2E·문서

**Files:** Modify `src/adapters/file-import/read-score-file.ts`(`MThd`/확장자 → MIDI, 결과에 `format: "musicxml" | "midi"`), `src/features/score-import/ImportFlow.tsx`(accept `.mid,.midi`, 안내 문구, `rhythm` 전달), `src/app/page.tsx` 문구; tests `score-import.test.ts`, `tests/e2e/import-flow.spec.ts`; docs TASKS §62, TEST_PLAN, MODULE_CONTRACTS, PRD, UAT U-04.

- [ ] Tests: readScoreFile routes `.mid` and `MThd` bytes, MIDI error messages; E2E `MIDI → 25현, one score`.
- [ ] Run → FAIL; implement; full validation (typecheck, lint, test, architecture, build, test:e2e); docs.
