# TASKS.md — Phase 0 작업 및 MVP 추적

- 최종 갱신: 2026-11-07
- 작업 단위: `docs/PHASE_0_PLAN.md` P0-01 ~ P0-08
- 상태 표기: `Done` / `Partial` / `Pending` / `Blocked`
- 증거는 실제 실행 결과만 기록한다(추정 금지).

## 1. Phase 0 작업 상태

| ID | 작업 | 상태 | 증거 / 비고 |
|---|---|---|---|
| P0-01 | 계약 문서 4종 작성 | **Done** | `DATA_MODEL.md`, `MODULE_CONTRACTS.md`, `TASKS.md`, `TEST_PLAN.md` 작성. C-02·C-04 확정 |
| P0-02 | 도구·패키지 호환성 및 도입 목록 | **Done** | next 16.4.4, react 19.3.0, typescript ^5, eslint ^9, vitest ^5.1.0, dependency-cruiser ^18.7.2 설치. 미도입 목록 문서화(MODULE_CONTRACTS §7) |
| P0-03 | 최소 Next.js 골격 + 검사 명령 | **Done** | `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`, `src/app/{layout,page,globals.css}`. 5개 script 동작 |
| P0-04 | canonical 모델 + 검증 | **Done** | `src/domain/score/{types,constants,create,validate,index}.ts`, `src/domain/music-theory/pitch.ts`. 정상/오류 fixture 8종 판정 |
| P0-05 | Command 파이프라인 + Undo/Redo | **Done (기본 4종)** | `AddNote`, `UpdateNote`, `DeleteEvent`, `InsertRest`. Transpose/Paste는 Phase 2/3 (계약만 준비) |
| P0-06 | 상태·port·조립 경계 | **Done** | `ScoreRepository` 포트, 단일 Score 소유자 `src/store/score-store.ts`(React 비의존) + `useScoreStore`(useSyncExternalStore). 새 상태 라이브러리 미도입 |
| P0-07 | 아키텍처 검사기 + 자기검증 | **Done** | depcruise 6규칙 + check-boundaries 3규칙. 의도적 위반 6종 탐지 확인 후 fixture 제거(TEST_PLAN §4) |
| P0-08 | 통합 검증·인수 기록 | **Partial** | 직렬화 round-trip·손상/미지원 버전 거부 구현·테스트 완료. E2E(Playwright) 미도입·미실행 |

## 2. 검증 명령 결과 (2026-11-07 실행)

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run typecheck` | ✅ exit 0 | strict |
| `npm run lint` | ✅ exit 0 | eslint 9 + eslint-config-next |
| `npm run test` | ✅ exit 0 | 11 파일 / **66 테스트 통과** |
| `npm run check:architecture` | ✅ exit 0 | 42 모듈·97 의존성, 위반 0 |
| `npm run build` | ✅ exit 0 | Next 16.4.4, 정적 페이지 3개 |

## 3. MVP 기능 추적 (Phase 0 기반만 준비, 기능 완료 아님)

| ID | 기능 | 상태 | Phase 0에서 확보한 기반 |
|---|---|---|---|
| MVP-001 | 가상 피아노 | Partial | 88건반(A0–C8) 클릭 + 컴퓨터 키보드 매핑 → `planAppendNote` → `AddNote` |
| MVP-002 | 허밍 녹음 | Pending | 런타임/음악 상태 분리 원칙만 정의 |
| MVP-003 | 단선율 채보 | Pending | 후보→명령 반영 계약(문서), 구현 없음 |
| MVP-004 | 악보 렌더링 | Partial | VexFlow 5 어댑터: 음자리표·조표·박자·마디·음표/쉼표, 연속 줄 음자리표 |
| MVP-005 | 기본 편집 | Partial | 추가·삭제·Undo/Redo + **음정/길이 수정·마디 추가**(1-B). 마디 넘김/타이, 제목·조표·박자 편집 미구현 |
| MVP-006 | 선택·클립보드 | Pending | ID 기반 선택·상대 tick 계약(문서) |
| MVP-007 | 조옮김 | Pending | `midiFromSpelling`/표기 일관성 검증 |
| MVP-008 | 연습 속도 | Pending | Score와 분리 원칙(ADR-004) |
| MVP-009 | A–B 루프 | Pending | `[startTick, endTick)` 문서 계약 |
| MVP-010 | 음이름·고정도 | Partial | `letterName`, `koreanFixedDo` (순수 함수) |
| MVP-011 | 음역·조옮김 제안 | Pending | Pitch/MIDI 범위 검증 |
| MVP-012 | 재생 | Partial | Tone.js 스케줄 재생(원 Score 템포 기준). 시작/자동 종료 확인, 메트로놈·하이라이트 미구현 |
| MVP-013 | 로컬 악보함 | Partial | **IndexedDB 저장·자동 저장·목록·열기·삭제**(1-A). 이름 변경·백업/복구 미구현 |
| MVP-014 | 내보내기 | Pending | 미착수 |

## 4. Phase 1 진행 (2026-11-07)

- **ADR-008 승인** 후 VexFlow 5.0.0 / Tone.js 15.1.22 도입(클라이언트 어댑터 전용, 동적 import).
- 구현 슬라이스: `/editor/[scoreId]` — 88건반 + 컴퓨터 키보드 입력 → 명령 → VexFlow 악보 → Undo/Redo → 재생 → 음표 목록/라벨.
- 1차 구현에서 **아키텍처 검사기가 실제 위반을 검출**했다(`feature-private-import`: 편집기가 feature 내부 파일 직접 import).
  공개 진입점(`features/*/index.ts`)을 추가해 수정했고, 이후 위반 0.
- 브라우저 검증(수동/agent-browser): 악보 SVG 렌더, 건반 클릭으로 음표 추가(C4/E4), Undo→0개, Redo→1개,
  Play 클릭 시 Stop 전환 후 약 0.8초 뒤 자동 종료. **오디오 실제 출력은 헤드리스에서 미검증.**
- 남은 Phase 1 작업: IndexedDB 저장/불러오기·악보함, 음표 수정 UI, 마디 추가, 마디 넘김(타이) 정책, 모바일/접근성.

### 4.1 Phase 1-A — 데이터 저장 (Done, 2026-11-07)

- `src/adapters/indexeddb/scoreRepository.ts`: `ScoreRepository`의 IndexedDB 구현.
  저장은 `serializeScore`, 읽기는 `deserializeScore`로 검증하며 손상/미지원 버전 레코드는 무시(덮어쓰지 않음).
- `src/application/score-library.ts`: `openOrCreateScore`, `createNewScore`, `listScores`.
- `src/features/score-library/useAutosave.ts`: 400ms 디바운스 자동 저장 + 상태(`idle|saving|saved|error`), 언마운트 시 flush.
- `/library`: 악보 생성·목록·열기·삭제(확인 후).
- `/editor/[scoreId]`: 저장본 로드(없으면 생성) + 자동 저장 + 저장 상태 표시.
- 테스트: `tests/integration/score-repository.test.ts`(6), `tests/unit/score-library.test.ts`(4), `tests/fixtures/memory-repository.ts`.
- **dev 의존성 추가**: `fake-indexeddb` — Node에 IndexedDB가 없어 어댑터를 테스트하기 위한 테스트 전용 대역. 프로덕션 번들 영향 없음.
- 브라우저 검증: 새 악보 생성 → 음표 입력 → "저장됨" → **새로고침 후 음표 유지** → 목록/열기 → 삭제.

### 4.2 Phase 1-B — 악보 편집 (Done, 2026-11-07)

- 재사용: `UpdateNote`(음높이), `DeleteEvent`(삭제), 편집 세션/히스토리, `midiToPitch`.
- **명령 추가(기존 파이프라인 유지)**: `AddMeasure`, `ResizeNote`(뒤 이벤트 리플로우, 마디 넘김 없음).
- 편집기 UI: 음표 칩 선택 → 편집 패널(반음 ↑/↓, 길이 4종, 삭제), 툴바 “마디 추가”.
- 테스트: `tests/unit/commands-resize.test.ts`(7) — 추가/중복/리플로우/용량 초과/단축/잘못된 길이/없는 음표.
- 브라우저 검증: 입력 2개 → 선택 → 반음 ↑(C#4) → 2분음표(1920 ticks, 음표 2개 유지) → 삭제(1개) → 마디 추가(9개).

**마디 경계·타이 정책 (분석 결과, 구현 보류)**

- 현재 모델: 이벤트는 소속 마디 범위를 벗어날 수 없다(`EVENT_OUT_OF_MEASURE`). 타이 표현이 없다.
- 대안 1(권장, 모델 소폭 확장): `NoteEvent`에 `tieToNext`/`tieFromPrev` 같은 **명시적 타이 플래그**를 추가하고,
  렌더러가 마디 경계에서 음표를 분할해 타이로 연결. 재생은 하나의 지속음으로 처리.
- 대안 2: 이벤트가 마디를 넘도록 검증을 완화 → 렌더러가 자동 분할. 검증·렌더 복잡도 증가.
- 대안 3: 타이 없이 **마디 자동 확장**(append 시 마디가 차면 `AddMeasure` 자동 발행). 모델 변경 없음.
- **결론**: Phase 1은 대안 3의 수동 버전(마디 추가 버튼)만 제공한다. 타이/자동 확장은
  모델 변경(대안 1) 또는 자동 명령(대안 3)에 대한 **사용자 승인 후** 진행한다.

### 4.3 Phase 1-C — 품질 검증 (Done, 2026-11-07)

- 도입: `@playwright/test` 1.65.0 + Chromium. `npm run test:e2e`, `playwright.config.ts`
  (`webServer`는 `npm run build && npm run start`, Chromium 단일 프로젝트).
- E2E 3종(모두 통과): ① 생성→입력→편집→저장→**새로고침 복구**→불러오기→재생/정지,
  ② 모바일 390×844 가로 스크롤 없음+입력/저장, ③ 키보드 입력·포커스·`aria-pressed`.
- 재생 토글 보강: 재생 중이면 `playbackRef`가 없어도 정지하고, 오디오 시작 실패 시 상태를 복구한다.
- `.gitignore`에 `test-results/`, `playwright-report/`, `blob-report/` 추가.
- 전체 검사 재실행: typecheck/lint/test(66)/check:architecture/build 전부 exit 0.

## 5. 다음 작업 (Phase 1 착수 전)
1. P0-06 마무리: React store 도입 여부·형태를 ADR로 확정(승인 필요) 후 단일 Score 소유자 연결.
2. 직렬화/역직렬화 + 버전 검증(P0-08 잔여) 구현 및 round-trip 테스트.
3. Playwright 도입은 E2E가 실제로 필요한 시점(Phase 1 렌더링)에 승인 후 추가.
4. Phase 1: 가상 피아노 → 편집 → VexFlow 렌더링 → 재생 → IndexedDB 저장.
