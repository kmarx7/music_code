# TASKS.md — Phase 0 작업 및 MVP 추적

- 최종 갱신: 2026-11-11 (Claude Code 인수인계; 제품 기준은 아래 시간순 기록 참조)
- 작업 단위: `docs/PHASE_0_PLAN.md` P0-01 ~ P0-08
- 상태 표기: `Done` / `Partial` / `Pending` / `Blocked`
- 증거는 실제 실행 결과만 기록한다(추정 금지).

> Claude Code로 이어서 작업할 때는 [루트 안내](../CLAUDE.md)와
> [최신 인수인계](CLAUDE_HANDOFF.md)를 먼저 읽는다. 아래 상단 표는 과거 시점 수치를 포함한다.
> 최신 H-02 제품 기준은 45파일/706개 및 사용자 Mac Chromium57/57 기록이며, 이번 직접 재검증은 §6 참조.

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

## 2. 검증 명령 결과 (최신: 2026-11-09 H-01 긴 타이 지속시간 보완)

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run typecheck` | ✅ exit 0 | strict |
| `npm run lint` | ✅ exit 0 | eslint 9 + eslint-config-next |
| `npm run test` | ✅ exit 0 | 42 파일 / **642 테스트 통과**(기존 614 + H-01 회귀 28) |
| `npm run check:architecture` | ✅ exit 0 | 62 모듈·186 의존성, 경계 55파일 위반 0 |
| `npm run build` | ✅ exit 0 | Next 16.4.4, 정적 페이지 3개 |
| `npm run test:e2e` | ✅ 사용자 Mac Chromium **55/55 PASS** | 사용자가 수정된 H-01 직접 검증. Codex listen EPERM 기록은 아래 보존 |

## 3. MVP 기능 추적 (Phase 0 기반만 준비, 기능 완료 아님)

| ID | 기능 | 상태 | Phase 0에서 확보한 기반 |
|---|---|---|---|
| MVP-001 | 가상 피아노 | Partial | 88건반(A0–C8) 클릭 + 컴퓨터 키보드 매핑 → `planAppendNote` → `AddNote`. 입력 소리·ON/OFF·터치 및 마디/박 편집 커서 입력 구현. 커서·입력 E2E는 사용자 Mac 55/55 회귀 포함. 실제 오디오·실기기 인수는 별도 |
| MVP-002 | 허밍 녹음 | Pending | 런타임/음악 상태 분리 원칙만 정의 |
| MVP-003 | 단선율 채보 | Pending | 후보→명령 반영 계약(문서), 구현 없음 |
| MVP-004 | 악보 렌더링 | Partial | VexFlow 5 어댑터: 음자리표·조표·박자·마디·음표/쉼표, 연속 줄 음자리표, **점음표·붙임줄**(1-D) |
| MVP-005 | 기본 편집 | Partial | 음표·쉼표·타이·제목·기본 템포·조표·빈 악보 박자 편집 구현. 설정의 단위/통합 및 사용자 Mac Chromium 회귀 통과. 기존 이벤트의 박자 변경은 안전하게 제한 |
| MVP-006 | 선택·클립보드 | Pending | ID 기반 선택·상대 tick 계약(문서) |
| MVP-007 | 조옮김 | Partial | Phase 2-1~2-6 구현·통합 검증. 전체 단위·통합 614 및 사용자 Mac Chromium 55/55 통과. 감사 R1/R2 경계 결함·수동 인수로 무조건 인수 보류(PHASE2_ACCEPTANCE_REPORT 참조) |
| MVP-008 | 연습 속도 | Pending | Score와 분리 원칙(ADR-004) |
| MVP-009 | A–B 루프 | Pending | `[startTick, endTick)` 문서 계약 |
| MVP-010 | 음이름·고정도 | Partial | 기존 함수 기반 Unicode 표시, none/letter/fixed-do, VexFlow 라벨·타이 머리·후보 연동 구현/단위 검증 완료. 사용자 Mac Chromium 52/52 통과; 폰트·실기기 인수는 별도 |
| MVP-011 | 음역·조옮김 제안 | Partial | 전체/Part별 음역·이벤트/발음 수·공통 MIDI 목표·엔진 기반 유한 추천·부분 초과 설명·기존 미리보기/확정 연결 구현. 단위·통합 614/614 및 사용자 Mac Chromium 55/55 PASS. Safari·모바일 실기기/실제 오디오 등 수동 인수는 별도 |
| MVP-012 | 재생 | Partial | 커서·하이라이트·일시정지/재개·메트로놈 구현, 단위 검증 완료. 사용자 Mac Chromium 회귀 통과. 긴 타이 병합 결함·실제 청취는 별도이며 cursor 시작/loop/rate는 미구현 |
| MVP-013 | 로컬 악보함 | Partial | **IndexedDB 저장·자동/수동 저장·목록·열기·삭제**. 제목/JSON 백업·가져오기/실패 저장본 보호 유지. 사용자 Mac Chromium 저장 회귀 통과. 강제 종료 무손실 보장 없음, 실환경 이탈 인수 별도 |
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

### 4.4 Phase 1-D — 마디 경계 분할 + 타이 (2026-11-07)

**계약 (ADR-009, schemaVersion 2)**

- `Part.ties: TieLink[]` — `{ from, to }` note ID 참조. 불리언 플래그가 아니라 **연결 관계 자체**를 한 곳에 저장한다.
- 마디를 넘는 음은 **마디 경계에서 분할**하고 세그먼트 사이를 타이로 연결한다(개별 이벤트는 여전히 자기 마디 안에 있어야 한다).
- 세그먼트 길이는 **점 0~2개 음가로 표기가능**해야 한다(`NOTATABLE_DURATIONS`). 아니면 더 작은 음가로 분해한다.
- ID 규칙: 첫 세그먼트는 원래 ID, 이후 `${id}:tie1`, `${id}:tie2` … — 결정적이며 Command는 랜덤/시간을 쓰지 않는다.
- 재생은 체인 전체를 **하나의 어택 + 지속음**으로 처리한다(중복 어택 금지).
- v1 → v2 마이그레이션: 각 part에 `ties: []`를 추가하고 다시 저장한다.
- 검증 코드 추가: `TIE_INVALID_SHAPE`, `TIE_UNKNOWN_REF`, `TIE_SELF_REF`, `TIE_DUPLICATE`,
  `TIE_NOT_CONTIGUOUS`, `TIE_PITCH_MISMATCH`, `TIE_BRANCHING`, `TIE_CYCLE`.
- Command 계약 확장: `AddNote`(분할 허용), `ResizeNote`(체인 재구성 + 뒤 이벤트 리플로우),
  `DeleteEvent`(관련 링크 제거), `UpdateNote`(음높이는 체인 전체에 적용).

**구현 파일**

- `src/domain/score/tie.ts`(신규): `NOTATABLE_DURATIONS`, `splitNoteIntoMeasures`, `chainIdsOf`,
  `mergeTiedNotes`, `tiesTouching`, 이벤트 조회 헬퍼.
- `src/domain/score/{types,constants,create,validate,serialize,index}.ts`: `TieLink`/`Part.ties`,
  schemaVersion 2, 검증 규칙, v1 마이그레이션.
- `src/domain/commands/{types,apply}.ts`: 위 Command 계약 확장.
- `src/application/append-note.ts`: 시작 마디만 찾으면 되도록 완화(분할은 Command가 수행).
- `src/adapters/vexflow/renderScore.ts`: 점음표 길이 + `StaveTie`(행 경계는 부분 타이).
- `src/adapters/tone/playback.ts`: 체인 병합 재생.
- `src/app/editor/[scoreId]/page.tsx`: 음표 목록/패널에 붙임줄 표시.

**검증 결과 (2026-11-07)**

- 신규 테스트: `tests/unit/tie-split.test.ts`(8), `tie-validation.test.ts`(9), `tie-playback.test.ts`(6),
  `tie-commands.test.ts`(10), `serialize.test.ts`(+2, v2 round-trip·v1 마이그레이션) → **15 파일 / 101 테스트**.
- **기존 66개 테스트 회귀 통과**(모델 확장 후 전부 green).
- E2E: `npm run test:e2e` → **4/4 통과**. 신규 시나리오는 4/4 마지막 박 2박 음 입력 → 분할·⌒ 표시 →
  패널 “붙임줄 연결됨” → 새로고침 후에도 음표 5개·⌒ 유지.
- 아키텍처: 43 모듈·105 의존성 위반 0, check-boundaries 36 파일 위반 0.
- VexFlow 렌더 검증(DOM 경로 수 대조): 동일 음표 수 48 → 타이 1개 추가 시 **49**(타이 곡선 path 1개 추가).
- 구현 중 발견·수정: `buildPart`가 기존 마디 이벤트를 삭제하던 회귀(회귀 테스트 5건이 검출),
  React dev 경고(`border` 단축 + `borderColor` 혼용) 2곳.

### 4.5 Phase 1-E — 제목 변경·JSON 백업/가져오기

- 상태: **구현 및 단위/통합 검증 완료, 사용자 Mac 일반 터미널에서 Chromium E2E 5종 통과**(아래 최신 결과 참조).
- 재사용: schemaVersion 2, `Part.ties`, ScoreRepository, serialize/deserialize, Command/Undo/Redo,
  단일 scoreStore와 기존 자동 저장, 기존 악보함. 모델·아키텍처·패키지 변경 없음.
- 편집기: 제목 변경(RenameScore, 공백 제목 거부, Undo/Redo, 자동 저장), 현재 Score JSON 다운로드.
- 악보함: 각 저장 악보 JSON 다운로드, JSON 파일 가져오기(5MiB 이하), 진행/실패 상태.
- 가져오기는 검증 후 새 UUID의 악보로 저장하며 기존 악보를 덮어쓰지 않는다.
  음표 ID·마디·파트·타이 참조를 보존하며 v1 → v2 변환을 재사용한다.
- 중첩 구조 검증 보강: 잘못된 part/measure/event/pitch/tie/provenance를 안전하게 거부한다.
- 신규 파일: 최소 브라우저 다운로드 어댑터, 백업 단위/IndexedDB 통합 테스트 각 1개.
  기존 파일에는 Application use case·명령·화면·E2E를 추가했다.
- 검증: 17파일 **129 테스트 통과**(기존 101개 포함), typecheck/lint/architecture/build exit 0.
- **Codex 환경 실행 기록:** `npm run test:e2e`는 서버 시작 시 `listen EPERM 0.0.0.0:3010`으로 exit 1.
  기존 4종 및 새 1종은 해당 Codex 환경에서 실행되지 않았다. 이 오류 기록은 유지한다.
- **이후 Mac 일반 터미널 실행 결과(사용자 제공):** 사용자가 `npm run test:e2e`를 직접 실행하여
  Chromium **`5 passed (13.1s)`** 확인. 기존 기능 E2E 4개와 제목 변경·JSON 백업/복원 E2E 1개가 모두 통과했다.
  이 결과는 아래 `exact: true` 선택자 수정이 포함된 Phase 1-E에 대한 것이며, 진행 중인 쉼표 편집 검증을 뜻하지 않는다.
- 다중 탭 동시성·Safari/모바일 실기기는 추가 검증 필요. GitHub push 없음.

### 4.6 Phase 1-E — E2E 선택자 수정

- `tests/e2e/editor.spec.ts:43`의 “새 악보” 버튼 locator에 `exact: true`만 추가했다.
  같은 파일의 유사 locator를 점검했으며 추가 변경·테스트 삭제/skip·앱 변경은 없다.
- 검증: typecheck/lint/architecture exit 0, 단위·통합 17파일/129개 통과.
  E2E 전체 실행은 서버 시작 시 `listen EPERM 0.0.0.0:3010`으로 exit 1(5종 미실행).
- lint 최초 실행은 E2E가 정리 중인 `test-results` 탐색에서 ENOENT로 실패했다.
  E2E 종료 후 재실행해 exit 0을 확인했다.
- 선택자 수정 내용: `tests/e2e/editor.spec.ts:43`의
  `getByRole("button", { name: "새 악보", exact: true })`.
  이후 사용자 Mac 일반 터미널에서 Chromium E2E **5개 모두 통과(13.1s)**. Codex에서 재실행해 통과한 것으로 기록하지 않는다.

### 4.7 Phase 1-E — 쉼표 편집 (2026-11-08)

- 상태: **구현 및 실행 가능한 로컬 검사 완료 / 브라우저 E2E 미검증**.
- 선행 E2E 수정은 `a0a9646` (`test(e2e): fix new-score locator ambiguity`)으로 분리했다.
  해당 커밋은 기존 선택자와 검증 기록 2파일만 포함하며 쉼표 소스는 포함하지 않는다.
- 기존 쉼표 부분 구현을 보존하고 테스트·렌더 보정을 추가했다.
  기존 RestEvent/Score/schemaVersion 2/Part.ties/Repository/명령·히스토리/store·자동 저장 재사용.
- 쉼표는 기존 길이 버튼으로 끝에 삽입하며, 음표와 같은 목록/편집 패널에서 선택·삭제·길이 변경한다.
  마디/박 입력으로 위치를 변경하고, 다른 이벤트는 이동하지 않는다.
- 기존 InsertRest와 추가 UpdateRest는 표기 불가 길이·마디 초과·충돌을 거부한다.
  실패 시 원본/히스토리 보존, 성공 시 Undo/Redo와 저장·복원 지원.
- VexFlow 빈 구간은 렌더 전용 GhostNote로 유지하며, 낮은음자리표 쉼표 중앙 위치를 보정했다.
  모델·상태 관리·production 의존성·음표 리플로우 정책·아키텍처 변경은 없다.
- 검증: 기존 129 + 신규 41 = **170개/20파일 통과**, typecheck/lint/architecture/build exit 0.
  실제 VexFlow 객체·IndexedDB 대역을 사용하며 상세는 TEST_PLAN §9에 기록했다.
- E2E 2종 추가(총 7종). 전체 실행 시 `listen EPERM 0.0.0.0:3010`으로 서버 시작 실패,
  이번 환경에서는 7종 미실행. 앞선 사용자 Mac 5종 통과와 구분한다.
- 쉼표 자동 분할·자동 리플로우·자동 마디 추가는 하지 않는다. 기존 ResizeNote가 타이 연속성을
  깨뜨리는 배치를 만들면 검증으로 원자적으로 거부하며, 정책 변경은 사전 승인 대상이다.
- 남은 사항: Mac에서 7종 E2E 및 실제 SVG 배치·Safari/모바일 실기기 확인. GitHub push 없음.

#### 이후 사용자 검증 결과

- 사용자 제공: `d539a2f` 기준 Mac Chromium **E2E 7개 통과**.
  위 Codex EPERM 기록은 당시 결과로 유지한다. 다음 설정 기능의 검증 결과와 구분한다.

### 4.8 Phase 1-E — 악보 설정 (2026-11-08)

- 상태: **구현 및 실행 가능한 로컬 검사 완료 / 설정 추가 후 브라우저 E2E 미검증**.
- 시작점: `d539a2f`, clean 작업 트리. 기존 schemaVersion 2/Part.ties/ScoreRepository/Command/
  finalize·검증/Undo·Redo/scoreStore/자동 저장/재생·VexFlow를 재사용한다.
- SetTempo: 정수 20–400 BPM. SetKeySignature: 장조 15개·단조 15개 조표 선택,
  기존 MIDI와 Pitch 및 음표/쉼표·타이 보존. 조옮김·자동 이명동음 재표기는 수행하지 않는다.
- SetTimeSignature: UI 2/4·3/4·4/4·6/8, 빈 악보에서만 변경한다.
  이벤트 또는 타이 연결이 하나라도 있으면 UI/명령에서 거부한다. 이벤트 재배치나 타이 변경 없음.
- 기존 score-editor에 ScoreSettings UI와 music-theory에 조표 조합 목록/검증을 추가했다.
  기존에 없는 UI/조표 조합 검증을 위한 최소 추가이며 새 모델·상태 관리·의존성·아키텍처 변경은 없다.
- 설정 적용 시 재생을 정지하고 이후 재생에서 새 템포를 사용한다. 초기화 중인 이전 재생 요청도 취소한다.
- 검증: 기존 170 + 신규 66 = **236개/23파일 통과**, typecheck/lint/architecture/build exit 0.
  실패 시 상태/이력 보존, MIDI·타이 불변, 저장 복원, Tone 스케줄·VexFlow 임시표 검사 포함.
- 설정 E2E 2종 추가(전체 9종). `npm run test:e2e`는 서버 시작 시
  `listen EPERM 0.0.0.0:3010`으로 exit 1 → **이번 버전의 9종 미실행**.
- MODULE_CONTRACTS/TEST_PLAN 갱신. 구조 변경이 없어 ADR 추가·기준 아키텍처 수정은 필요하지 않았다.
- 남은 검증: Mac 전체 9종, 실제 SVG/오디오·Safari/모바일. GitHub push 없음.

### 4.9 Phase 1-E — 저장 완료 표시 회귀 수정 (2026-11-08)

- 조사 시작: `a4fc0ac`, clean. 사용자 Mac에서 9개 중 8개 통과(신규 설정 2개 통과),
  기존 저장/새로고침 시나리오만 1920 ticks 확인에 실패.
- trace/error-context에서 실제 클릭은 음표 칩이고 편집 패널도 열렸음을 확인했다.
  편집 전후 C4/960 → C#4/1920 → 새로고침 후 C4/960의 변화와,
  마지막 길이 변경 약 43ms 후 reload가 시작된 기록을 확인했다.
- 원인: 400ms 자동 저장 대기 중 이전 "저장됨" 표시가 유지되고 이전 저장 완료도 최신 편집을
  saved로 표시할 수 있었다. 악보 설정 버튼의 aria-pressed 충돌이 아니다.
- 기존 useAutosave만 최소 보완: 변경 즉시 saving, 최신 snapshot 저장 완료 시에만 saved,
  저장된 내용으로 Undo하면 중복 쓰기 없이 saved 복귀. 저장소/모델/명령/아키텍처 변경 없음.
- 실패 E2E의 DOM 순서 선택을 C4/C#4 정확한 접근성 이름으로 바꾸고,
  reload 전에 IndexedDB의 실제 음정/길이/위치를 검증한다. 기대값/timeout 유지, 삭제/skip 없음.
- 신규 자동 저장 4종 중 수정 전 2종 실패로 재현, 수정 후 기존 236 포함 **240개/24파일 통과**.
  typecheck/lint/architecture/build 통과. 자세한 분석은 TEST_PLAN §11.
- 이번 E2E 재실행은 Codex의 listen EPERM으로 9종 미실행. Mac 수정 버전의 통과는 아직 확인하지 않았다.
- 원래 실패 trace와 error-context는 `/tmp/music-score-e2e-a4fc0ac/`에 보존했다. GitHub push 없음.

### 4.10 이후 사용자 Mac 확인 (42e29bb 기준)

- 사용자 제공 결과: **240개 단위·통합 / Chromium E2E 9/9** 통과,
  typecheck/lint/architecture/build 통과, clean. 위 Codex EPERM 기록은 유지한다.

### 4.11 재생 커서·하이라이트·메트로놈 (2026-11-08)

- 시작점 `42e29bb`, clean. **구현·실행 가능한 로컬 검사 완료 / 신규 브라우저 검증 대기**.
- 절대 tick/AudioContext 시계 기준 커서, 진행 표시, SVG·음표 칩 하이라이트,
  Pause/Resume/Stop, 타이 단일 어택·전체 지속음, 쉼표/빈 구간 처리 구현.
- 메트로놈 ON/OFF, 분모 음가 클릭·마디 첫 박 강조, 2/4·3/4·4/4·6/8,
  빈 악보 연습과 템포/박자 편집 후 새 설정 재생을 지원한다.
- 재생/선택/메트로놈 상태는 Score에 저장하지 않는다. 편집/Undo/Redo와 화면 이탈은 재생을 취소한다.
- 기존 Tone adapter/mergeTiedNotes/960 PPQ/Score/Part.ties/store/Command/IndexedDB를 재사용한다.
  고빈도 상태를 격리하는 최소 playback feature와 읽기 전용 위치 투영 추가. 모델·레이어·의존성 변경 없음.
- 추가 저장 경합 재현: 느린 이전 쓰기가 최신 snapshot을 덮어씀. 기존 useAutosave 내부 쓰기 순서와
  cleanup 저장을 직렬화해 마지막 값을 보존한다. 저장 실패 후 후속 쓰기도 계속한다.
- 검증: **25파일 / 266개 통과**(기존 240 + 신규 26), typecheck/lint/architecture/build exit 0.
  아키텍처 50 modules / 128 deps, 경계 43파일 위반 0. 상세 목록 TEST_PLAN §12.
- 신규 E2E 2종, 기존 9종 유지, 총 11종 수집 확인.
  전체 `npm run test:e2e` 시도는 `listen EPERM 0.0.0.0:3010`, exit 1로 **11종 모두 미실행**.
  이는 assertion 실패가 아니며 이전 사용자 9/9를 이번 버전 통과로 간주하지 않는다.
- MODULE_CONTRACTS/TEST_PLAN 갱신. AGENTS/ARCHITECTURE/DECISIONS/Score 스키마는 변경하지 않음.
- 실제 오디오 출력·SVG 시각 배치, Safari/모바일 실기기는 미검증. GitHub push 없음.

### 4.12 E2E 오류 메시지 선택자 충돌 수정 (2026-11-08)

- 시작점 `0af8c15`, clean. 사용자 Mac Chromium 실행은 **9/11 통과**, 제목/JSON 시나리오와
  쉼표 편집 시나리오 2종 실패. 기존 Codex EPERM 기록은 유지한다.
- 두 `error-context.md`에서 `getByRole("status")`가 재생 위치 `<output>`의 암시적 status와
  오류 메시지 `<p role="status">`를 동시에 선택한 strict mode violation을 확인했다.
- `editor.spec.ts:174` 및 `rest.spec.ts:31,33`의 오류 메시지 검증 **3곳**을
  `page.locator('p[role="status"]')`로 한정한다. 기존 기대 문구/검증 방식/timeout은 유지한다.
- 같은 파일의 나머지 status 검증 2곳(editor.spec.ts:194,201)은 재생 output이 없는 악보함 화면의
  가져오기 성공/실패 메시지 확인이므로 유지한다. 테스트 삭제/skip 없음.
- 애플리케이션·재생 위치 UI·Score 모델·아키텍처 변경 없음. 테스트 2파일과 TASKS/TEST_PLAN만 변경한다.
- typecheck/lint/test/check:architecture/build exit 0, **25파일 / 266개 통과**,
  아키텍처 50 modules / 128 deps 및 경계 43파일 위반 0.
- 전체 `npm run test:e2e` 실행 시도: `listen EPERM 0.0.0.0:3010`, exit 1 → **수정 버전 11종 미실행**.
  `npm run test:e2e -- --list`는 11종/4파일 수집 확인. 수정 후 브라우저 통과를 뜻하지 않는다.
- 다음 검증: Mac 일반 터미널에서 `npm run test:e2e` 전체 11종 재실행. GitHub push 없음.

### 4.13 저장 전 악보함 이동 경합 수정 (2026-11-08)

- 시작점 `591e02e`, clean. 사용자 Mac Chromium **10/11 통과**, 제목/JSON E2E 1종 실패.
- trace/error-context: Redo 후 “백업 연습곡” 표시·JSON 파일명 검증은 통과했고,
  이동 후 `/editor/e2e-backup` 링크는 존재하지만 제목이 “새 악보”였다. ID/경로 오류가 아니다.
  Redo 클릭 시작(10083.440ms)에서 이동 클릭(10186.788ms)까지 약 103ms로 디바운스 400ms보다 빠르다.
- 원인: cleanup의 비동기 저장과 새 악보함의 일회성 list 조회 간 순서 보장 없음.
  fake-indexeddb 재현에서 cleanup 직후 list가 이전 제목을 반환했다. 과거 trace에는 실제 DB dump가 없으므로
  영구 데이터 유실을 단정하지 않는다. JSON 다운로드 자체도 영속 저장 완료 신호가 아니다.
- 별도 무결성 결함도 재현: put 요청 성공 후 transaction abort가 발생해도 이전 save는 성공으로 반환했다.
  요청 성공 대신 transaction.oncomplete를 기다리고 abort/error를 호출자에 전달하도록 수정한다.
- 기존 useAutosave의 쓰기 대기열에 선택적 ref/flush 제어 추가. 명시적 flush는 디바운스를 건너뛰고,
  in-flight 중 발생한 최신 편집까지 보존한다. 일반 400ms 정책 및 기존 SaveStatus 반환은 유지한다.
- 편집기 홈/악보함 Link는 flush 성공 후 이동한다. 실패 시 편집기에 남아 오류와 재시도/JSON 백업을 안내한다.
- 기존 JSON E2E에 ID·제목 및 실제 IndexedDB/다운로드 동등성 확인 추가.
  새 E2E 2종은 저장을 기다리지 않은 이동 및 transaction 실패·이동 차단·백업·재시도를 검사한다.
- **25파일 / 270개 통과**(기존 266 유지 + 신규 4). typecheck/lint/architecture/build exit 0,
  아키텍처 50 modules / 128 deps, 경계 43파일 위반 0.
- 수정 전 새 재현 테스트 2개가 실패했고 수정 후 통과했다(목록 제목 경합, 성공 요청 뒤 abort).
- 전체 `npm run test:e2e` 시도: listen EPERM 0.0.0.0:3010으로 **13종 미실행**.
  `--list`로 13종/5파일 수집 확인. Mac 수정 전 10/11을 수정 후 통과로 간주하지 않는다.
- MODULE_CONTRACTS/TEST_PLAN 갱신, Score/Part.ties/schemaVersion 2/Command/아키텍처 유지. GitHub push 없음.

### 4.14 Phase 1 인수 차단 — 실패 저장본 직접 열기 원본 보존 (2026-11-08)

- 기준 `8141c6b`, clean. 사용자 제공 기준선: 단위·통합 270개 및 Mac Chromium **13/13 통과**.
  과거 Codex EPERM 기록은 유지한다.
- 이전 load는 손상·미지원 레코드에도 null을 반환해 openOrCreateScore가 같은 ID로 빈 악보를
  저장할 수 있었다. 이제 null은 실제 미존재이며 나머지는 구분 가능한 ScoreReadError로 거부한다.
- Application은 읽기 실패를 전파한다. UI는 성공한 조회 뒤에만 편집 영역/scoreStore.init/자동 저장을
  연결하며, 실패 시 읽기 전용 오류 화면과 악보함 복귀 링크를 제공한다.
- save도 같은 transaction에서 기존 레코드 검증 후 put하므로 조회 후 손상 레코드가 생겨도 보존한다.
- 정상 v1은 메모리에서 v2로 변환·검증한다. 읽기/이동만으로 원본을 자동 재저장하지 않으며,
  정상 편집 후 기존 저장/Undo/Redo는 유지한다. 실패한 저장본은 자동 수정·삭제·마이그레이션하지 않는다.
- 원시 백업 방식은 MODULE_CONTRACTS에 검토 기록. 손상 자료를 정상 Score로 내보내지 않고,
  이번에는 원시 백업 UI/자동 복구를 추가하지 않는다.
- **26파일 / 284개 통과**: 기존 270개 + 신규 14개. 기존 손상/미지원 저장소 테스트 2개는
  null 기대 대신 명시적 오류 거부를 검증하도록 강화했다(삭제/skip 없음).
- typecheck/lint/architecture/build exit 0, 아키텍처 50 modules / 128 deps, 경계 43파일 위반 0.
- 실제 IndexedDB 레코드 주입 → 편집기 라우트 → 쓰기 0회·원본 불변 검사 E2E 7종 및
  정상 v1/v2 원본 보존·편집/Undo/Redo/새로고침 2종 추가. 이전 정상 세션 캐시가 남아 있는 같은 ID 재진입 1종도 추가. 기존 13종 유지, 총 23종/6파일 수집 확인.
- 전체 test:e2e는 **listen EPERM 0.0.0.0:3010**, exit 1로 **23종 미실행**.
  구현·실행 가능한 로컬 검사는 완료했으나 새 브라우저 원본 보존 검증 전 최종 인수 완료로 표시하지 않는다.
- DATA_MODEL/MODULE_CONTRACTS/TEST_PLAN 갱신. Score 모델·Part.ties·schemaVersion 2·아키텍처 유지.
  포트 서명과 레이어를 유지한 오류 처리 강화여서 구조 변경 ADR은 추가하지 않았다. GitHub push 없음.

### 4.15 E2E 오류 alert 선택자 범위 수정 (2026-11-08)

- 기준 `60a9e01`, clean. 사용자 Mac Chromium 결과 **15/23 통과, 8종 실패**.
- 8개 error-context 모두 실제 오류 `p[role="alert"]`와 Next.js `__next-route-announcer__`의
  전역 alert 선택자 충돌을 기록한다. 오류 메시지는 화면에 존재하며 원본 보존 assertion 실패가 아니다.
- score-open-preservation.spec.ts:70,137의 2곳을
  `page.getByTestId("score-open-error").locator('p[role="alert"]')`로 한정한다.
  첫 locator는 실패 7종에 공유되며 두 번째는 이전 정상 세션 차단 시나리오다.
- 전체 테스트의 같은 전역 alert locator는 이 2곳뿐임을 확인했다.
  2곳 외 테스트 내용은 동일: 오류 코드 기대값, 원시 레코드 전체 불변, readwrite/put/add/delete/clear 0회,
  편집/Staff 부재·기존 세션 차단·악보함 복귀·clock/timeout 모두 유지. 삭제/skip 없음.
- 애플리케이션·데이터 모델·아키텍처는 변경하지 않는다. 테스트 1파일과 검증 문서 2파일만 수정한다.
- 단위·통합 **26파일 / 284개 통과**, typecheck/lint/architecture/build exit 0.
  아키텍처 50 modules / 128 deps, 경계 43파일 위반 0.
- 전체 test:e2e 실행은 **listen EPERM 0.0.0.0:3010**, exit 1 → 수정 버전 23종 미실행.
  `--list`는 23종/6파일 수집 확인. 오류 선택자 이후의 브라우저 데이터 보존 검증은 아직 완료로 표시하지 않는다.
- 다음: Mac 일반 터미널 전체 E2E 23종 재검증. 이전 EPERM/사용자 15/23 결과는 별도 기록으로 유지한다.
  GitHub push 없음.

### 4.16 피아노 입력 즉시 미리듣기 (2026-11-08)

- 시작점 `e1e14bf`, clean. 사용자 제공 기준선은 단위·통합 **284개**, Mac Chromium **23/23 통과**다.
  이전 4.15의 EPERM/15개 통과 기록은 당시 결과로 유지한다.
- 기존 PianoKeyboard/음높이 매핑/입력 Command/저장을 유지하고 Tone 경계에 전용 단일 음성을 추가한다.
  기존 playScore는 전체 Score 재생용이므로 임시 Score 없이 입력음만 다루는 작은 어댑터가 필요하다.
- 마우스·터치 누름/컴퓨터 키/접근성 click에서 약 200ms 입력음, 기본 ON인 미리듣기 토글 제공.
  최신 음 우선·이전 gain 종료 취소·비동기 요청 무효화로 음성 누적과 오래된 종료 간섭을 방지한다.
  터치 호환 click은 음표를 한 번만 추가하고, 차단/대기 중인 미리듣기는 click에서 재시도한다.
- 오디오 활성화/초기화 실패는 안내하고 입력·저장을 계속한다. OFF/blur/숨김/언마운트 정리 포함.
  악보 재생/메트로놈 노드와 독립적이며 기존 Score 편집 시 재생 정지 정책은 유지한다.
- 단위 테스트 신규 **29개**(어댑터 20 + UI 9), 전체 **28파일 / 313개 통과**. 기존 284개 유지.
  typecheck/lint/check:architecture/build exit 0, 51 modules / 130 deps, 경계 44파일 위반 0.
- E2E 4종 추가: 빠른 입력·음소거/저장·복원, 오디오 실패/재시도, 재생 독립 제어, 모바일 터치.
  기존 23종 유지, 총 **27종/7파일** 수집 확인. 전체 실행은 **listen EPERM 0.0.0.0:3010**으로
  서버 시작 실패(exit 1), **27종 미실행**이다. 기존 Mac 23/23을 새 버전 통과로 간주하지 않는다.
- 실제 스피커·Safari·모바일 실기기/첫 활성화 지연은 미검증. 수동 절차는 TEST_PLAN §17.
  구현과 실행 가능한 검사는 완료했으나 브라우저/실제 청취 검증 전 완전 검증으로 표시하지 않는다.
- MODULE_CONTRACTS/TEST_PLAN 갱신. schemaVersion 2/Part.ties/Score 모델/기본 아키텍처/의존성 유지.
  GitHub push 없음.

### 4.17 미리듣기 요구사항 재점검·반복 입력 회귀 보완 (2026-11-08)

- 시작점 `47dc6cf`, clean. 이번 요청의 미리듣기 기능은 이 커밋에 이미 구현되어 있음을 확인했다.
  PianoKeyboard/전용 Tone 미리듣기 어댑터를 재사용하며 중복 구현이나 production 코드 변경은 하지 않는다.
- 단위 테스트 2개 추가: 동일 MIDI의 빠른 반복/무음 뒤 재입력에서도 한 음성을 재사용하고 최신 종료만 예약,
  같은 컴퓨터 키의 별도 누름은 각각 입력·미리듣기하며 held-key repeat만 무시.
- E2E 1종 추가: 오디오 초기화 실패 중 C4 세 번 입력 → 실제 저장 → Undo/Redo → 저장본 전체 동등성
  → 새로고침 → 오디오 복구·같은 음 추가. schemaVersion 2/Part.ties/고유 이벤트 ID도 확인한다.
- 전체 단위·통합 **28파일 / 315개 통과**(기존 313 유지). typecheck/lint/architecture/build exit 0.
  아키텍처 51 modules / 130 dependencies, 경계 44파일 위반 0.
- 기존 E2E 23종과 앞선 미리듣기 4종 유지. `--list` **28종/7파일** 수집 성공.
  전체 `npm run test:e2e` 시도는 **listen EPERM 0.0.0.0:3010**, exit 1 → **28종 미실행**.
  사용자 Mac 기존 23/23 결과 및 4.16의 과거 27종 미실행 기록과 구분한다.
- 실제 스피커 출력/빠른 반복 음질/Safari/모바일 실기기 및 첫 활성화 지연은 미검증이다.
  TEST_PLAN §17의 수동 절차 및 §18의 최신 검증 기록을 따른다.
- Score/Command/IndexedDB/Part.ties/schemaVersion 2/전체 악보 재생 정책/의존성/아키텍처 유지.
  문서·테스트만 보완하며 GitHub push, Vercel 접근·설정 변경·배포는 수행하지 않는다.

### 4.18 편집 커서 위치 입력 (2026-11-08)

- 기준 `3d7cfe8`, clean. 사용자 기준선: 단위·통합 315개 및 Mac Chromium **28/28 통과**.
  4.17의 Codex 28종 EPERM 기록은 과거 결과로 유지한다.
- 기본 끝 입력 유지. 마디/박 선택 → 절대 tick 커서 표시 → 피아노 입력을 지원한다.
  SVG 파란 커서 선은 VexFlow 좌표를 사용한다. 모바일은 줄바꿈 폼/터치로 위치를 조작한다.
- 기존 append-note 계획을 확장해 `planNoteAt`/`noteInputTick`을 추가하고 기존 AddNote를 dispatch한다.
  마디 초과는 기존 분할 타이, 이벤트 충돌·악보 길이 초과는 원본/이력/커서 유지로 거부한다.
  후속 타이 세그먼트에서 충돌해도 앞부분을 부분 삽입하지 않는다. 이벤트 자동 밀기/자동 마디 추가 없음.
- 성공 시에만 음표 끝으로 커서 전진. 커서/모드는 UI 상태로 저장·Undo 이력 대상이 아니다.
  Undo/Redo는 cursor tick을 유지하고 새로고침은 끝 입력 모드다. 쉼표 삽입은 기존 끝 입력 유지.
- 단위 33개(위치 변환·삽입/거부·히스토리·타이), SVG 4개, IndexedDB 통합 1개 추가.
  전체 **30파일 / 353개 통과**(기존 315 유지). typecheck/lint/architecture/build exit 0.
  아키텍처 52 modules / 136 dependencies, 경계 45파일 위반 0.
- 신규 E2E 3종: 중간 삽입/커서 전진/충돌/Undo/Redo/복원/끝 입력,
  기존 타이/쉼표 충돌/전체 경계, 모바일 6/8/끝 tick/마디 추가. 기존 28종 모두 유지.
  `--list` **31종/8파일** 수집 성공. 전체 실행은 **listen EPERM 0.0.0.0:3010**, exit 1로 **31종 미실행**.
- 실제 SVG 위치/모바일 실기기/빠른 입력 체감은 미검증이며 Mac 전체 E2E 및 TEST_PLAN §19 수동 절차가 필요하다.
  구현과 실행 가능한 검사는 완료했으나 브라우저 검증 완료로 표시하지 않는다.
- MODULE_CONTRACTS/TEST_PLAN 갱신. Score/schemaVersion 2/Part.ties/기존 Command·VexFlow·Tone·저장 경계 유지.
  신규 음악 모델/상태 라이브러리/production 의존성/구조 변경 없음. GitHub push/Vercel 접근·변경·배포 없음.

### 4.19 명시적 수동 저장 (2026-11-08)

- 기준 `e89ac0d`, clean. 사용자 기준선: 단위·통합 353개 및 Mac Chromium **31/31 통과**.
  4.18의 과거 Codex EPERM 기록은 유지한다. 이번 작업은 GitHub/Vercel에 접근·변경·배포하지 않는다.
- 상단 저장 버튼/진행·완료·실패 안내, 실패 후 재시도와 JSON 백업 안내 추가. 모바일 최소 높이 44px.
  기존 score-library의 useAutosave/AutosaveHandle/SaveStatus/쓰기 대기열과 ScoreRepository를 재사용한다.
- 수동 저장은 400ms 디바운스를 건너뛰고 진행 중 자동 저장 뒤에서 최신 편집까지 저장한다.
  같은 렌더의 연속 클릭은 ref로 차단하고 버튼만 비활성화한다. 편집·Undo/Redo·자동 저장은 계속 동작한다.
  동시 명시적 flush(수동/이동)는 같은 Promise를 공유하고 완료/실패 후 재시도할 수 있다.
- 최신 Score 일치와 transaction 커밋을 확인한 기존 saved 상태로만 완료 표시한다.
  이전 쓰기가 완료되어도 추가 편집이 남으면 저장 중이며, 이전 완료 문구는 즉시 숨긴다.
- 단위 9개 추가: 버튼 6개 및 저장 훅 3개(중복/경합/실제 fake-indexeddb 실패·재시도).
  put 성공 후 transaction abort를 주입해 기존 원시 레코드 전체 및 메모리 Score/이력 불변을 확인한다.
  전체 **31파일 / 362개 통과**, 기존 353개 유지. typecheck/lint/architecture/build exit 0.
  아키텍처 53 modules / 139 dependencies, 경계 46파일 위반 0.
- 신규 E2E 4종: 디바운스 중 수동 저장/Undo/Redo/복원, 실제 transaction 지연 중 연속 클릭·추가 편집,
  실패 원본 보존·재시도, 모바일 터치/복원. 기존 31종 유지, **35종/9파일** 수집 성공.
  전체 test:e2e는 **listen EPERM 0.0.0.0:3010**, exit 1 → **35종 미실행**.
  신규 테스트의 타입/린트 오류는 수정 후 typecheck/lint/build를 재검증했다.
- MODULE_CONTRACTS/TEST_PLAN 갱신. Score/schemaVersion 2/Part.ties/Command/Undo/Redo/저장소·production 의존성·배포 설정 유지.
  실제 브라우저·모바일 실기기 검증 전 완전 검증으로 표시하지 않는다. 수동 절차는 TEST_PLAN §20.

### 4.20 ADR-010 저장 안전성 (2026-11-08)

- 기준 `8d570b0`, clean 확인. 사용자 기준선 단위·통합 362개 및 Mac Chromium **35/35 통과**.
  4.19의 과거 Codex EPERM 기록은 유지한다.
- 사용자 승인에 따라 ADR-010 Accepted, ARCHITECTURE/DATA_MODEL/MODULE_CONTRACTS 갱신.
  Score 외부 revision CAS, atomic create/update/delete, 영속 Tombstone, BC 알림 후 DB 확인,
  useAutosave 단일 저장 상태/충돌 중지, dirty beforeunload/hidden 조기 저장/focus·pageshow 재확인 구현.
- DB version 2로 구버전 writer 차단. blocked/versionchange 안내/연결 폐쇄, legacy revision 0 지연 전환.
  손상/미지원 원본은 보존하고 정상 음악 v1→v2 읽기 지원 유지. 사용자의 실제 DB는 건드리지 않았다.
- 충돌 시 메모리 Score·Undo 보존, JSON 백업/새 ID 저장/확인 후 최신본 열기. 강제 덮어쓰기/병합/재시도 없음.
  동시 최초 열기는 편집 세션 초기화 전에 승자의 저장본을 읽기만 한다.
- **32파일 / 391개 통과**(기존 362 + 신규 29). typecheck/lint/architecture/build 결과는 위 최신 표.
  기존 테스트 setup/spy만 새 생성·수정 계약으로 전환했으며 핵심 검증/기존 시나리오 유지.
- 기존 35개 + 신규 실제 두 탭/삭제/충돌·보존/상태/이탈 E2E 6개, 총 **41종/10파일 수집 성공**.
  전체 실행은 **listen EPERM 0.0.0.0:3010**, exit 1로 **41종 미실행**.
- 상태: **구현·단위/통합 검증 완료, Mac 새 버전 E2E·실기기 인수 대기**. 완전 검증으로 표시하지 않는다.
- Web Locks/강제 종료 복구 저널은 범위 제외. 강제 종료/SPA 뒤로가기의 최종 비동기 저장과
  브라우저 데이터 삭제는 무손실 보장하지 않는다. DB2를 모르는 구버전 빌드로 롤백하지 않는다.
- GitHub push/Vercel 접근·설정 변경·배포 없음.

### 4.21 ADR-010 Mac 이탈 취소 E2E 대기 수정 (2026-11-08)

- 기준 `c24bc0a`, clean. 사용자 Mac **40/41 통과**. 실패는 storage-concurrency.spec.ts:122 시나리오다.
- trace의 beforeunload 발생/type 검증/dismiss 완료와 오류 snapshot의 변경 제목·기존 편집기 유지 확인.
  실제 timeout은 `await page.reload()`의 새 document/load 대기였다. 이후 catch가 timeout을 삼켜
  heading expect가 teardown 때 시작됐다. 제목 locator나 앱 저장 기능의 결함으로 확인된 것이 아니다.
- 해당 E2E만 location.reload 요청+dialog 처리 대기로 변경하고 오류 삼키기 제거.
  동일 document/제목/원시 baseline 유지, hidden commit revision +1 및 새로고침 원시 동등성 검증을 추가했다.
- 단위·통합 **391개/32파일**, typecheck/lint/architecture/build 통과. 앱 및 ADR-010 계약 변경 없음.
- 단독 E2E와 전체 E2E 모두 **listen EPERM 0.0.0.0:3010**으로 미실행.
  전체 최초 시도의 build 잠금 오류는 build 종료 후 재시도했으며, 최종 차단 원인은 포트 권한이다.
  기존 **41종/10파일** 수집 유지. 당시 수정 후 브라우저 통과는 확인하지 못했다.
- 자세한 trace 시간/원본 증거 보존 위치/검증은 TEST_PLAN §22. GitHub push/Vercel 작업 없음.
- **이후 사용자 Mac 확인:** 수정된 테스트를 포함한 Chromium E2E **41/41 통과**.
  위 수정 전 40/41 및 Codex EPERM 기록은 유지하며, 최신 성공은 사용자 실행 결과로 구분한다.
  최종 검토 결과 변경은 E2E/TEST_PLAN/TASKS 3파일이며 기존 검증 의미를 유지·강화했다.

### 4.22 Phase 2-1 조옮김 순수 도메인 엔진 (2026-11-08)

- 기준 `c0e3951`, clean 확인. 사용자 기준선 단위·통합 391개 및 Mac Chromium **41/41 통과**.
- 승인된 음악 정책으로 intervalBetweenKeys/transposePitch/transposeKeySignature/transposeScore 추가.
  기존 music-theory/조표 목록/Score 검증을 재사용한다. 기존 피아노 고정 샵 매핑은 호출하지 않는다.
- 실제 반음과 음이름 이동량을 분리하고 모든 Part에 같은 음정을 적용한다. 장/단조 각각 지원,
  장단조 변환/미지원 조표/음역·표기 불가 결과는 전체 거부한다. nearest ±6은 상행 우선이다.
- 자동 선택: 표현 가능성→목표 조성 철자→모든 Part 조표 단순성→기존 샵/플랫 성향→고정 목록 순서.
  지정한 목표 철자는 바꾸지 않는다. 0/옥타브 이동은 원래 조표 철자 유지. 상세 계약 MODULE_CONTRACTS 마지막 절.
- 타이/ID/쉼표/리듬/메타데이터 보존. updatedAt도 엔진에서는 변경하지 않는다.
  UI/Command dispatch/저장 연결은 미구현이며 MVP-007 전체 완료로 표시하지 않는다.
- 신규 **79개**, 전체 **33파일 / 470개 통과**, 기존 391개 유지. 1개 테스트 내부에서 조표/방향 **1,350 조합** 추가 점검.
  typecheck/lint/architecture/build는 최신 표 참조. 검증 내역 TEST_PLAN §23.
- 기존 E2E **41종 무변경·미실행**: 브라우저 연결 없는 순수 도메인 작업이다. 기존 사용자 Mac 41/41 및 EPERM 기록은 유지한다.
- schemaVersion 2/Part.ties/SetKeySignature/ADR-010/라이브러리/아키텍처 레이어 유지. 별도 구조 변경 ADR 없음.
  GitHub push/Vercel 접근·배포·설정 변경 없음.

### 4.23 Phase 2-2 TransposeScore Command / Undo·Redo (2026-11-08)

- pwd/Git 상태/최근 이력/show로 기준 `1c74de4`, clean, 현재 브랜치 포함 확인.
- 기존 snapshot 이력/호출자 timestamp/store 구독/훅 소유 revision을 조사했다.
  성공 전부를 기록하던 경계에 동일 Score 결과의 session/알림 유지 규약을 최소 추가했다.
- 기존 TransposeSpec/엔진을 호출하는 단일 Command 및 오류 코드 추가.
  실제 조표/Pitch 값 비교 후 변경에만 updatedAt 주입. no-op/실패는 Score/past/future/time/저장 상태 유지.
  MIDI 0인 이명동음 변경은 실제 편집이다. 기존 SetKeySignature·다른 명령 정책 유지.
- 10 Part·500음표의 호출 1회/알림 1회/Undo 1회 및 혼합 이력 검증.
  신규 Command **30개** + autosave **7개**, 전체 **34파일 / 507개 통과**(기존 470 유지).
  Phase 2-1 엔진/79개 테스트 무변경. typecheck/lint/architecture/build 통과, 경계 위반 0.
- 기존 IndexedDB adapter + fake-indexeddb로 CAS/Tombstone/abort 원시 불변·revision 확인.
  저장 구현/스키마/ADR-010 변경 없음. 상세 계약 MODULE_CONTRACTS, 증거 TEST_PLAN §24.
- 전체 E2E 시도는 **listen EPERM 0.0.0.0:3010**, exit 1로 **41종 미실행**.
  E2E 무변경. 기존 사용자 Mac 성공을 이번 버전 통과로 간주하지 않는다.
- Phase 2-2 및 실행 가능한 검사 완료. UI dispatch/미리보기/취소는 미구현이며 실제 화면 경합은 Phase 2-4 대상.
  GitHub push/Vercel 작업 없음.

### 4.24 Phase 2-3 조옮김 미리보기 / 확정 / 취소 (2026-11-08)

- 기준 `848b7c8`, clean 및 1c74de4/848b7c8 현재 브랜치 포함 확인. 사용자 기준선 507개/Mac E2E 41/41 유지.
- 기존 도메인 엔진/TransposeSpec/지원 조성 목록/Command/Store/StaffView를 재사용한 인라인 패널 추가.
  같은 모드 목표 선택·nearest/up/down·엔진 이동 정보·오류 설명·읽기 전용 후보·확정/취소/Escape 제공.
- 미리보기는 로컬 후보만 계산한다. Store/이력/timestamp/저장/revision 무변경.
  불변 session 참조와 저장 revision 포착 후 확정 직전 동기 재검사, stale/conflict/deleted/error 차단.
  후보를 Store에 대입하지 않고 기존 Command 1회만 dispatch한다. no-op/실패 및 Undo/Redo 계약 유지.
- useAutosave의 기존 소유 상태를 동기 조회하는 선택적 getSnapshot만 추가. 조회는 DB IO를 하지 않는다.
  IndexedDB 쓰기/스키마/OCC/Tombstone/BC 정책은 변경하지 않는다.
- 기존 renderer는 첫 Part만 표시하며 화면에 이 제한을 알린다. 계산/확정은 모든 Part에 적용한다.
  열 때 기존 PlaybackControls 정리 경로로 원본 재생을 정지하고 메트로놈 선택을 유지한다.
  원본 하이라이트 DOM 범위와 후보를 분리한다. Tone/VexFlow 어댑터 변경 없음.
- 신규 단위·통합 **27개**(패널 23 + autosave getter 2 + 재생 정리 2), 전체 **36파일/534개 통과**.
  기존 507개/Phase 2-1 79개/ADR-010 시나리오 유지. React 훅/element tree 대역 검증과 실제 DOM을 구분한다.
  typecheck/lint/architecture 통과, production build 결과는 최신 표. 세부 증거 TEST_PLAN §25.
- 기존 E2E 41종 무변경 + 신규 5종 = **46종/11파일 수집 성공**.
  전체 실행은 build 후 **listen EPERM 0.0.0.0:3010**, exit 1 → **브라우저 46종 미실행**.
  과거 사용자 Mac 성공을 이번 버전 검증으로 간주하지 않는다.
- 당시 **구현 및 실행 가능한 검사 완료, E2E/수동 인수 대기**로 로컬 커밋을 보류했다.
- **이후 사용자 Mac 검증:** 기존 41개 + 신규 조옮김 미리보기 5개, Chromium **46/46 통과**.
  단위·통합 534/534 및 typecheck/lint/architecture/build 통과 확인. 위 Codex EPERM은 당시 결과로 보존한다.
  최종 검토에서 12파일의 범위·원본/이력 보존·단일 Command·stale/충돌/삭제 차단·OCC 유지를 확인했다.
  이번 최종 검토에서도 단위·통합 534/534 재실행 통과.
  로컬 커밋을 위한 git add는 `.git/index.lock: Operation not permitted`로 실패했다.
  실행 환경의 .git 읽기 전용 제한으로 스테이징·커밋을 완료하지 못했고 12파일을 그대로 보존했다.
  MODULE_CONTRACTS/TEST_PLAN/TASKS 갱신. schemaVersion 2/Part.ties/JSON/DB2/저장 모델/의존성 유지.
  GitHub push/Vercel 작업 및 Phase 2-4 구현 없음.

### 4.25 Phase 2-4 기보·재생·저장 통합 검증 (2026-11-08)

- main/HEAD `45c15f8`, clean에서 시작. 기존 단위·통합 534 및 사용자 Mac E2E 46/46 기준선 보존.
- TransposeScore→EditSession/Undo/Redo→VexFlow/Tone→IndexedDB/JSON 경로 조사.
  새 결함이 재현되지 않아 **제품 코드 무변경**, 테스트와 검증 문서만 추가/갱신했다.
- 신규 통합 9개 + 재생 제어 회귀 1개. 실제 VexFlow 음표/임시표·오선 위치와 Tone MIDI/어택 인자,
  타이 단일 지속음·쉼표·템포·Undo/Redo·DB 재열기·JSON 가져오기/백업 데이터 동등성 확인.
  알림 없이 동시 CAS 한 승자/패자 이력·원시 레코드/영속 Tombstone 보존 및 DB2 검증.
- 복수 Part는 변환·저장 보존되나 기존 renderer/playScore는 첫 Part만 표시·재생한다.
  이 제한을 명시적으로 검사했다. 다중 Part 동시 기보·재생을 구현하거나 검증했다고 보고하지 않는다.
- 전체 **37파일/544개 통과**, typecheck/lint/architecture/build 통과. 아키텍처 경계 위반 0.
  Tone/DOM 그리기/React 훅/IndexedDB 대역과 실제 브라우저·오디오 검증을 구분한다(TEST_PLAN §26).
- 기존 46종 E2E 무변경 + 신규 3종 = **49종/12파일 수집 성공**.
  전체 실행은 build 후 **listen EPERM 0.0.0.0:3010**, exit 1 → **브라우저 49종 미실행**.
  실제 SVG 기보·원본/후보 하이라이트·재생 중 확정·브라우저 저장 경합은 Mac 재검증 대기다.
- **부분 검증: 자동 데이터/정적 검사 완료, 브라우저/수동 인수 미완료**. 사용자 지시에 따라 커밋 보류/변경 보존.
  schemaVersion2/Part.ties/DB2/ADR-010/라이브러리/기존 Command·음악 엔진·UI/배포 설정 무변경.
  GitHub push/Vercel 및 Phase 2-5/2-6 구현 없음.

### 4.26 Phase 2-4 E2E 열기 링크 선택자 수정 (2026-11-08)

- 사용자 Mac Chromium **48/49 통과**, transpose-integration.spec.ts의 동일 href 제목/열기 링크 중복으로 1개 실패.
- 해당 클릭만 link 역할 + 정확한 이름 `열기` + 정확한 href의 교집합으로 한정했다. 기존 assertion/제품 코드/저장 계약 유지.
  다른 href 선택자는 이름 교집합 또는 목록 has 필터 용도임을 확인했으며 추가 수정하지 않았다.
- typecheck/lint 및 git diff --check 통과. 초기 lint의 test-results ENOENT는 E2E 종료 후 재실행하여 통과했다.
  해당 E2E 파일 실행은 **listen EPERM 0.0.0.0:3010**으로 미실행. 수정 후 Mac 전체 49개 통과 전 커밋 보류.
- 기존 Phase 2-4 변경 보존. GitHub push/Vercel 및 Phase 2-5 작업 없음.

### 4.27 Phase 2-5 음이름·고정도법 표시 (2026-11-08)

- main/HEAD `1437418`, clean. 사용자 단위·통합 544 및 Mac Chromium **49/49 통과** 확인을 기준선으로 유지한다.
- 기존 letterName/koreanFixedDo를 재사용하는 순수 formatNoteLabel/NoteLabelMode 추가.
  Pitch의 완전한 철자를 그대로 Unicode ♯/♭/𝄪/𝄫로 표시하며 조표 중복 적용/MIDI 재표기 없음.
- 기존 표시 UI 자리에 none 기본 선택(표시 안 함/음이름/계이름)과 Annotation 기반 악보 라벨 연결.
  기존 목록 식별은 보존, 첫 Part/타이 머리만/쉼표 제외. StaffView와 후보에 동일 mode를 전달한다.
- label 모드의 마디 폭/행 간격/viewBox를 확보하고 실제 조표 note-start inset을 반영한다.
  비제로 글자 폭/큰 조표 여백 경계 테스트로 새 라벨의 마디 우측 초과를 재현 후 수정했다.
  pointer 비간섭·ID 연결/현재 하이라이트 보존. 실제 기기 폰트·다중 행 시각 인수는 남긴다.
- 모드 변경은 로컬 UI만 변경한다. Score/Command/Undo·Redo/updatedAt/dirty/revision/저장/JSON/BC 불변.
  conflict/deleted 저장 중지 및 후보 baseline 계약 유지. 음악 엔진/Tone/IndexedDB/useAutosave 구현 무변경.
- 신규 **30개**, 전체 **39파일/574개 통과**. typecheck/lint/architecture/build 통과(59모듈/170의존성, 경계 52파일 위반 0).
  기존 544개 및 49종 E2E assertion 유지. 상세 대역/검증 경계는 TEST_PLAN §27.
- 신규 E2E 3종 포함 **52종/13파일 수집 성공**. 전체 실행은 **listen EPERM 0.0.0.0:3010**, exit 1로 **52종 미실행**.
  당시 **구현 및 자동 데이터 검증 완료, 브라우저/실기기 인수 대기**로 Mac 검증 전 커밋을 보류했다.
- **이후 사용자 Mac 직접 확인:** Chromium E2E **52/52 PASS**, 단위·통합 **574/574 PASS**,
  typecheck/lint/architecture/build PASS. 위 Codex EPERM은 당시 실행 결과로 보존한다.
  최종 검토에서 추적 11개/신규 5개, 총 16파일이 Phase 2-5 범위임을 확인했다.
  Score/schemaVersion2/Command/Undo·Redo/DB2/ADR-010/저장 경로 보존. 실제 오디오 청취·Safari/모바일 실기기는 별도다.
- MODULE_CONTRACTS/TEST_PLAN 갱신. schemaVersion2/Part.ties/DB2/ADR-010/새 라이브러리 없음/첫 Part 제한 유지.
  GitHub push/Vercel 및 Phase 2-6 구현 없음.

### 4.28 Phase 2-6 음역 분석 및 조옮김 추천 (2026-11-09)

- main/HEAD `cbac282`, clean. 기존 574개 및 사용자 Mac E2E 52/52 통과를 기준선으로 유지한다.
- analyzeScoreRange는 전체/Part별 MIDI/원래 음이름/반음 폭/표기 이벤트 수와 타이 제외 발음 수를 순수 계산한다.
  빈 결과는 null, 같은 MIDI의 철자는 Score 순서의 첫 표기를 유지한다. 화음/음악 모델 확장 없음.
- recommendTranspositions는 기존 엔진으로 같은 모드 15조성×3방향 + -127~127반음 255개를 검사한다.
  성공을 반음·문자 이동량으로 중복 제거, 전체 적합→최소 이동→상행→엔진 자동 철자→고정 순서로 정렬한다.
  옥타브 이동 지원, 부분 위반 발음·초과량/실패 spec·사유 기록. 임시 Score는 저장/Store에 넣지 않는다.
- 기존 TransposeTool 안에 목표 입력/명시적 계산/추천 미리보기 연결. 목표 변경은 결과·선택을 무효화하고
  원본 session/revision/충돌·삭제 재검사로 오래된 선택·확정을 차단한다. 확정만 기존 Command 1회다.
- 신규 **40개**, 전체 **41파일/614개 통과**, typecheck/lint/architecture/build 통과.
  아키텍처 62모듈/186의존성, 경계 55파일 위반 0. 신규 UI/데이터/실제 fake-indexeddb 무쓰기 증거 TEST_PLAN §28.
- 기존 52종 E2E 무변경 + 신규 3종 = **55종/14파일 수집 성공**.
  전체 실행은 **listen EPERM 0.0.0.0:3010**, exit 1로 **브라우저 55종 미실행**.
  **구현·자동 데이터 검증 완료, 브라우저/수동 인수 대기**이며 커밋 보류/변경 파일 유지.
- Score v2/Part.ties/DB2/ADR-010/Command/Undo·Redo/기존 조옮김/저장·복원·기보·재생 구현 유지.
  분석은 모든 Part, 기보·재생은 첫 Part 한정. 목표 MIDI0의 이름 C-1은 표시 전용이며 저장 octave 제약은 완화하지 않는다.
  악기 프리셋/실제 연주 가능성/운지/라이브러리/모바일 전면 개편 없음. GitHub push/Vercel 작업 없음.

### 4.29 Phase 2-6 악보 요약 E2E Locator 충돌 수정 (2026-11-09)

- 사용자 Mac **36/55 PASS, 19 FAIL**(신규 추천 3/3 PASS). 실제 trace/context 19개 모두에서
  getByText(/음표 N개/)가 요약 span과 score-range를 동시에 찾는 strict mode 오류를 확인했다.
- 요약 span에 score-summary test ID만 추가하고 테스트 공통 scoreNoteCount 헬퍼로 범위를 한정했다.
  E2E 8파일의 33지점 수정. 실제 실패 19종과 후속 잠재 충돌 지점을 구분한다.
  역변환 비교로 8파일의 헬퍼 import/선택자 외 변경 없음, 기대 숫자/가시성/저장 assertion 그대로임을 확인했다.
  BPM/쉼표/편집 문구·새 음역 검사는 유지한다. 원본 trace는 TEST_PLAN §28의 임시 경로에 보존했다.
- 단위·통합 614/614, typecheck/lint/architecture/build 및 diff 검사 PASS.
  전체 E2E는 listen EPERM 0.0.0.0:3010으로 수정 후 55종 미실행. 55종/14파일 수집 유지.
- 기존 Phase 2-6 13파일 보존. 제품 동작 변경은 없으며 test ID 1개만 추가했다.
  Mac 전체 55/55 성공 확인 전 스테이징/커밋 보류. GitHub push/Vercel 및 범위 밖 기능 없음.

### 4.30 Phase 2-6 최종 검토 및 사용자 Mac 검증 (2026-11-09)

- 사용자가 Locator 수정 후 전체 Chromium E2E **55/55 PASS**를 Mac에서 직접 확인했다.
  기존 52개 및 신규 음역·추천 3개를 포함한다. 앞선 Mac 36/55·19 FAIL 및 Codex listen EPERM은 당시 기록으로 유지한다.
  위 커밋 보류 기록은 Mac 재검증 전 상태이며, 이번 사용자 확인으로 브라우저 자동화 검증 조건을 충족했다.
- 단위·통합 **614/614 PASS**(기존 574 + 신규 40), typecheck/lint/architecture/build PASS.
  추적 변경 16개와 신규 7개, 총 **23파일**을 최종 검토했다. 신규 도메인/UI/단위·E2E와 score-summary 테스트 헬퍼를 포함한다.
- 분석·추천·미리보기는 읽기 전용, 확정만 기존 TransposeScore Command 1회이며 stale/revision/충돌·삭제 차단을 유지한다.
  기존 음표 개수 assertion은 요약 영역으로 한정했으며 기대값을 약화하지 않았다.
  Score schemaVersion 2/Part.ties/Command/Undo·Redo/IndexedDB DB2/ADR-010/저장·복원 계약 및 의존성 변경 없음.
- 이번 작업은 검토·검증 기록 갱신·선별 로컬 커밋에 한정한다. 실제 오디오 청취·Safari·모바일 실기기·큰 악보 응답성은 별도다.
  GitHub push/Vercel 작업 및 Phase 3 구현 없음.

### 4.31 Phase 2 최종 인수 감사 및 Phase 3 계획 (2026-11-09)

- 기준 main `5d43471`, clean. 제품/모델/저장 계약 변경 없이 실제 구현과 테스트를 검토했다.
- 이번 재실행: 단위·통합 **614/614 PASS**, architecture **62모듈/186의존성/경계55파일 위반0**.
  사용자 Mac Chromium **55/55 PASS**와 기존 typecheck/lint/build PASS 기록을 유지한다.
  이번 문서 감사에서 브라우저·정적 검사·build를 다시 실행한 것으로 표기하지 않는다(architecture 제외).
- 최종 무조건 인수는 보류: JSON에서 허용된 66세그먼트 타이가 병합 시 63360→62400ticks로 누락되는 결함,
  1000ticks 음가가 VexFlow에서 canonical 960ticks로 근사되는 결함을 임시 진단으로 확인했다.
  기존 614개 테스트의 PASS와 미포함 경계 결함을 구분하며 제품 수정은 하지 않았다.
- Apple M2/Node 벤치마크: 1024음표 추천 중앙값101.541ms, 255타이 포함610.022ms.
  브라우저/모바일 SLA가 아니며 코드·합성 fixture·원시3회·한계는 아래 보고서에 보존한다.
- [인수 보고서](PHASE2_ACCEPTANCE_REPORT.md), [Phase 3 마스터 플랜](PHASE3_MASTER_PLAN.md),
  [실행 백로그](PHASE3_BACKLOG.md) 작성. 미검증 청취/Safari/실기기와 강제 종료 위험을 유지한다.
  Phase 3는 경계 정책·회귀 보완 후 속도→A–B→선택/클립보드를 권고한다. PDF는 Phase5 유지.
  MusicXML 입력/다중 Part 확대/전면 UI 개편은 별도 승인 대상이다. 계획을 구현 완료로 처리하지 않는다.
- 문서만 변경하며 GitHub push/Vercel/DB migration 및 제품 기능 구현 없음.
- 로컬 커밋 시도는 `git add`의 `.git/index.lock: Operation not permitted`로 실패했다.
  공식 권한 상승 요청도 실행 환경의 `sandbox_approval: false` 정책으로 거부되었다.
  스테이징/커밋은 미완료이며 문서 5개를 보존한다. HEAD는 `5d43471` 그대로다. 우회 권한 변경은 하지 않았다.

### 4.32 H-01 긴 타이 지속시간 보완 (2026-11-09)

- 감사 문서 5개를 별도 커밋 **ccf73a7** (`docs: audit phase 2 and plan phase 3 development`)으로 보존했다.
  이번 Git 쓰기는 정상 수행되었으며 과거 권한 오류 기록은 삭제하지 않았다.
- JSON/Score는66세그먼트를허용하지만 tie.ts의 고정64링크순회가 끝1개를 놓쳐63360→62400ticks가 되는 경로를 확인했다.
  먼저 회귀 테스트 실패를 확인하고 제품 코드는 tie.ts만 수정했다.
- 기존 검증을 재사용해 오류 체인을 거부하고 방문 ID 집합으로 유효 체인을 끝까지 순회한다.
  chainIdsOf/mergeTiedNotes/긴순환검사 일치. splitNoteIntoMeasures의64세그먼트 생성 제한은 유지한다.
- 신규28개/전체 **642/642 PASS**, typecheck/lint/architecture/build PASS.
  66체인63360ticks/120BPM33초·어택1회, 67/128체인, 명령·Undo/Redo·JSON·DB2/OCC 저장 회귀를 검증했다.
- E2E 전체는 **listen EPERM 0.0.0.0:3010**으로 **55개 미실행**. Mac 재검증 전 H-01 완료 커밋 보류/변경 보존.
  schemaVersion2/Part.ties/ADR-010/DB2/기존Command·조옮김·Tone/VexFlow 구현·저장 경로는 유지한다.
- MODULE_CONTRACTS/TEST_PLAN 및 감사·백로그 진행 상태 갱신. H-02는 미해결이며 이번에 수정하지 않는다.
  실제 오디오/Safari/모바일 미검증. GitHub push/Vercel 및 Phase3 제품 기능 구현 없음.

### 4.33 H-01 최종 검토 및 사용자 Mac 검증 (2026-11-09)

- 사용자가 H-01 변경 후 Mac Chromium **55/55 PASS**를 확인했다. 위 Codex EPERM/보류 기록은 당시 결과다.
- 단위·통합642/642, typecheck/lint/architecture/build 및 diff 검사 PASS 기록 유지.
  제품 tie.ts 1개, 신규 long-tie.test.ts를 포함한 테스트4개, 관련 문서5개로 총10파일의 범위를 확인했다.
  66세그먼트63360ticks·오류 체인 차단·생성64한계 및 Score v2/Part.ties/DB2/ADR-010 계약 유지.
- 검증된 H-01 변경만 선별하여 로컬 커밋한다. H-02와 Phase3 기능은 구현하지 않는다.
  실제 청취/Safari/모바일 인수는 별도이며 GitHub push/Vercel 작업 없음.
- 최종 스테이징은 `.git/index.lock: Operation not permitted`로 실패했고 공식 권한 상승 요청도
  실행 정책의 `sandbox_approval: false`로 거부되었다. H-01 커밋 미생성, 관련10파일 보존,
  HEAD `ccf73a7` 유지. 이번 재실행 단위·통합642/642 PASS. 권한 우회는 하지 않았다.

### 4.34 H-02 음가 정책 조사 (2026-11-09)

- 기준 main/HEAD `2d7c776`, clean. H-01 제품 커밋이 존재함을 확인했다. 과거 커밋 권한 오류 기록은 당시 이력이다.
- [H02_DURATION_POLICY](H02_DURATION_POLICY.md)에 JSON 검증→기보/재생 경로, 설치 VexFlow5 API,
  정확 분해/명시 표시/새 입력 제한/혼합 대안, 원본 보존·파일 호환성·H-01 경계·테스트/승인 사항을 정리했다.
- 임시 Node 진단: note/rest의1/120/150/210/300/960/1000/1920/3840ticks,
  JSON/조옮김/Undo·Redo 및 Tone 대역 인자 보존, 마디 경계 분할과 그리디300 거부를 확인했다.
  fake-indexeddb DB2/revision1의1000ticks 복원 후 원시row/json 불변. 실제 사용자 DB에는 접근하지 않았다.
- 원인은 vexDurationOf의 fallback이다. 1000→960, 1→120으로 기보하며 원본 duration은 유지한다.
  Tone gate0.9/타이gate1/최소1ms는 별도 기존 정책이다. 실제 SVG 그리기·청취를 검사한 것으로 보고하지 않는다.
- 권고는 D 혼합 정책: broad read 유지, 정확한 렌더 projection 분해, 불가 시 기보 오류/원래tick 안내.
  기존 Score·저장본 자동수정/거부·migration 없음. 구체 정책은 구현 전 승인 대상이다.
- 제품 코드/기존 테스트/저장 계약/ADR/라이브러리는 변경하지 않았다. 기존642/55 기준 기록은 유지하되
  이번 조사에서 전체 회귀/typecheck/lint/architecture/build/E2E를 재실행했다고 주장하지 않는다.
  등록된 새 테스트가 아니라 분석용 임시 진단이다. H-02와 Phase3 제품 구현/GitHub push/Vercel 작업 없음.
- 문서2파일의 로컬 스테이징은 `.git/index.lock: Operation not permitted`로 실패했고,
  공식 권한 상승 요청도 `sandbox_approval: false` 정책으로 거부되었다. 커밋 미생성/변경 보존,
  HEAD `2d7c776` 유지. 권한 우회는 하지 않았다.

### 4.35 H-02 정확한 렌더 전용 음가 구현 (2026-11-09)

- 사용자 승인 혼합 정책 구현: notation.ts의 제한 DP/읽기 전용 계획, renderScore의 근사 제거,
  실제 점/가상 타이/전체 마디 strict tick, 원본 ID 선택·하이라이트·단일 라벨 유지.
  300=180+120, 1000은 명시적 기보 오류로 전체 첫 Part SVG를 제거하고 원본 재생·저장·백업은 유지한다.
- 렌더 요청 취소/최신 요청 확인 및 오류 후 복구를 추가했다. 불가 후보는 조옮김 확정을 차단한다.
  Score v2/Part.ties/DB2/ADR-010/Command·Tone·저장·조옮김 엔진 변경 없음.
- 기존642+신규62=**704/704 PASS**, typecheck/lint/architecture/build PASS.
  H-01의66세그먼트63360ticks 유지. 실제 repository+fake-indexeddb 원시 row/revision/JSON,
  Undo·Redo/updatedAt/저장 상태 불변 및 Tone 인자를 검증했다.
- 신규 E2E2개 작성, 기존55 유지. 전체 실행은 **listen EPERM 0.0.0.0:3010**으로 서버 시작 실패,
  **57개 미실행**. Mac `npm run test:e2e` 재검증 전 제품 커밋 보류.
  실제 브라우저 기보 육안/오디오 청취/Safari/모바일 실기기 미검증.
- 정책2파일의 사전 stage는 성공했으나 commit은 `.git/index.lock: Operation not permitted`,
  공식 승인은 `sandbox_approval: false`로 거부되었다. 원래 policy index와 후속 변경을 보존했다.
  HEAD2d7c776 유지, GitHub push/Vercel/H-02 외 제품 기능 구현 없음.
  상세 정책/예산/측정 경계는 H02_DURATION_POLICY §11, 검증은 TEST_PLAN의 H-02 절을 참조한다.

### 4.36 H-02 점 glyph E2E 선택자 조사 (2026-11-09)

- 사용자 Mac **56/57 PASS**를 기록한다. 기존 Codex EPERM 기록은 당시 결과로 유지한다.
- 실제 Mac trace와 error-context, 설치 VexFlow5 소스를 대조했다. 점음표·점쉼표 모두
  `.vf-notehead > text`의 U+E1E7 점이 있고 `.vf-dot` 그룹은 없다. Locator를 정확 문자로 수정하고
  총2개 기대값과 note/rest 각각 가시성 검증을 유지·추가했다.
- SVG 루트 pointer-events=none 상속도 확인했다. 기존 H-02 클릭 위임을 위해 이벤트 그룹에만
  visiblePainted를 설정했다. 포인터 회귀1개를 추가해 전체 **705/705 PASS**.
  기존 하이라이트/원본 ID·길이·타이/저장 보호 검증을 유지한다. typecheck/lint/architecture/build PASS.
- 수정 후 Codex 전체 E2E는 listen EPERM 0.0.0.0:3010으로 **57개 미실행**. Mac 재검증 필요.
- 기존 정책2파일만 staged인 상태를 확인했다. 구현/후속 문서 변경은 unstaged/untracked로 보존하며
  Mac 수정 후 전체 E2E 통과 확인 전 제품 커밋은 만들지 않는다. GitHub/Vercel 작업 없음.

### 4.37 H-02 SVG pointerRect 조사 및 클릭 테스트 보강 (2026-11-09)

- 실제 후속 Mac trace에서 차단 rect는 exact-note 두 번째 fragment의 자식임을 확인했다.
  StaveNote.draw가 getBoundingBox→SVGContext.pointerRect로 만드는 정상 투명 선택 영역이다.
  rect는 notehead 뒤의 형제이며 auto를 명시한다. 그룹 visiblePainted 반영도 확인했다.
- 제품 코드는 추가 변경하지 않았다. fragment 그룹에 일반 click/tap하도록 E2E를 수정했다.
  클릭 중심의 hit 그룹 일치, 첫·둘째 조각/인접 D4/쉼표/라벨 후 선택, Undo·Redo/원시 row/복원,
  모바일 에뮬레이션 tap을 기존57개 안에 보강했다. force/timeout 증가/rect 비활성화 없음.
- rect 클릭 위임 단위1개 추가. 관련41개/전체706개 PASS, typecheck/lint/architecture/build PASS.
  전체 E2E는 listen EPERM 0.0.0.0:3010으로 **57개 미실행**, 수정 후 실제 클릭·터치 통과 미확인.
  기존 정책 문서2개의 staged 상태와 H-02 전체 미커밋 변경을 보존한다.
  수정 후 전체 E2E 검증 전 제품 커밋 보류. GitHub/Vercel 작업 없음.

### 4.38 H-02 최종 사용자 Mac 인수 및 로컬 커밋 검토 (2026-11-09)

- 사용자가 수정된 전체 Mac Chromium **57/57 PASS**를 직접 확인했다. 앞선 EPERM/56·57 실패 기록은 보존한다.
- 단위·통합 **706/706 PASS**, typecheck/lint/architecture/build 및 diff 검사 PASS.
  H-01의63360ticks, H-02의300/960/1000ticks, 정확 glyph/타이/fragment·인접·쉼표 선택과
  라벨·하이라이트·저장·Undo/Redo 보호 검증 유지. 실제 청취/Safari/모바일 실기기는 별도 인수다.
- Score v2/Part.ties/DB2/ADR-010/Command·Tone·조옮김·저장/JSON 계약 유지.
  staged 이후 추가된 정책 문서/TASKS 기록까지 첫 문서 커밋 대상으로 검토했다.
  나머지 H-02 구현/신규 테스트·헬퍼/검증 문서는 두 번째 제품 커밋 대상으로 분리한다.
  실제 커밋 성공 여부는 Git 결과로 확인한다. GitHub/Vercel/Phase3 기능 구현 없음.

## 5. 다음 작업

1. H-01은 사용자 Mac Chromium55/55까지 확인했다. [백로그](PHASE3_BACKLOG.md)의 H-02는 Mac E2E57/57까지 검증했으며 로컬 커밋과 별도 수동 인수 상태를 확인한다.
2. H-03의 브라우저 성능 측정/지원 범위를 합의한다. Node 결과만으로 실기기 응답성을 인수하지 않는다.
3. 감사 §7의 Chrome/Safari·실제 오디오·모바일·이탈/두 탭 수동 인수를 실행하고 증거를 남긴다.
4. [마스터 플랜](PHASE3_MASTER_PLAN.md)의 제안 계약(C-08, rate/loop 경계)을 확정한 뒤 작은 기능 단계로 진행한다.
5. 기존 Phase 2 자동 검증 614/55는 유지하되 경계 결함·미검증 항목 해소 전 최종 무조건 인수로 표시하지 않는다.
   강제 종료 저널·다중 Part 확대·MusicXML 입력·PDF 선행·UI 전면 개편은 별도 승인 범위다.

## 6. HANDOFF-01 — Claude Code 인수인계 (Done, 2026-11-11)

- 요청: Codex 사용량 제한에 따라 현재 진행 내용과 남은 작업을 로컬 Markdown으로 상세 전달한다.
- 기준: main `e69ab20`, 문서 작성 전 clean. 로컬 `origin/main` 대비15커밋 ahead이며 fetch는 수행하지 않았다.
  H-01 `2d7c776`, H-02 정책 `a4d9a47`, 제품 `e69ab20` 커밋 존재를 확인했다.
  과거 커밋 보류/권한 오류는 이력이며 현재 미커밋 제품 작업으로 해석하지 않는다.
- 추가: 루트 `CLAUDE.md`, `docs/CLAUDE_HANDOFF.md`, `docs/CLAUDE_START_PROMPT.md`.
  기존 문서·모듈·공개 API를 근거로 구현 상태/저장 보호/회귀/미검증/Phase3~6/시작 프롬프트를 정리했다.
  기존 계획의 낡은 상태와 제안 정책을 구분하고, 같은 로컬 폴더를 열어야 미push 구현을 이어갈 수 있음을 명시했다.
- 이번 실제 재실행: `npm run test` **45파일/706개 PASS**, `npm run typecheck` PASS,
  `npm run lint` PASS, `npm run check:architecture` **63모듈/192의존성/경계56파일 위반0**,
  `npm run build` PASS. 모두 exit0.
- 이번 E2E는 문서 변경만 하므로 재실행하지 않았다. 사용자 Mac57/57은 §4.38의 기존 제품 검증 기록이다.
  청취/Safari/모바일 실기기/대형 브라우저 성능은 별도 미검증으로 유지한다.
- 제품 코드/패키지/Score v2/DB2/ADR-010/아키텍처 변경 없음. commit/push/deploy/사용자 DB 조작 없음.
- 다음: Claude에서 인수인계 확인 후 새 사용자 요청에 따라 H-03/D-01부터 범위를 정한다.
  Phase3 계획을 구현 완료 또는 기존 승인으로 간주하지 않는다.

## 7. P3-01~03 — 비파괴 연습 속도 (구현·자동 검증 완료, 로컬 커밋 `277a0e7`, 2026-11-11)

- 요청: Claude Code 첫 세션. 사용자가 문서 확인 후 "연습 속도 구현까지" 범위를 선택했고,
  D-01 중 **재생 중 rate 변경 = 현재 위치 즉시 재예약**, **C-08 클립보드 = 제안안 그대로**를 승인했다.
  A–B loop 경계/설정 유지 정책은 미확정으로 남겼다(MODULE_CONTRACTS D-01 절).
- 기준: main `e69ab20`. 시작 시 baseline 45파일/706개, typecheck/lint/architecture PASS를 재확인했다.
- 재사용: `domain/score/playback.ts`, `adapters/tone/playback.ts`의 pause→resume 수명(release/start),
  `PlaybackControls`의 로컬 state/ref와 요청 토큰. 새 모듈/의존성/상태 시스템/저장 필드 없음.
- 변경 제품 파일 3개: `src/domain/score/playback.ts`(rate 범위·검증·실효 템포·tick 초 계산),
  `src/adapters/tone/playback.ts`(`options.rate`, `PlaybackHandle.setRate`),
  `src/features/playback/PlaybackControls.tsx`(슬라이더 25–150%/5%, 프리셋 50/75/100/125%, 실효 BPM 표시).
- 신규 테스트: `tests/unit/practice-rate.test.ts` 53개(실패 확인 후 구현), `tests/e2e/practice-rate.spec.ts` 2개.
  기존 테스트는 삭제·skip·기대값 변경 없음.
- 실제 실행: `npm run test` **46파일/759개 PASS**, `npm run typecheck` PASS, `npm run lint` PASS,
  `npm run check:architecture` 63모듈/192의존성/경계56파일 위반0, `npm run test:e2e` 상당
  (`npx playwright test`, 프로덕션 build+start, 출력 경로만 분리) **Chromium 59/59 PASS**(기존57+신규2).
  build는 E2E webServer의 `npm run build`로 성공했다. `git diff --check` PASS.
- 미검증: 실제 스피커 청취(속도 변경 순간의 끊김·재어택 체감 포함), Safari/WebKit/Firefox,
  iPhone/Android 실기기. 단위 테스트의 Tone은 대역이며 모바일은 hasTouch 에뮬레이션이다.
- 구현 기본값으로 정한 것(승인 요청 대상): 연습 속도는 Stop/편집/Undo 후에도 편집기 세션 동안 유지, 새로고침 시 100%.
- Score v2/Part.ties/DB2/ADR-010/Command/의존성/레이어 변경 없음. commit/push/deploy 없음.
- 다음: (1) 이 변경과 인계 문서의 로컬 커밋 여부 결정, (2) P3-04 전 A–B loop 경계 정책 확정,
  (3) H-03 브라우저 성능 측정, (4) 실제 청취 인수.

## 8. P3-04~05 — A–B 반복 (구현·자동 검증 완료, 로컬 커밋 `a5d1965`, 2026-11-11)

- 요청: 사용자가 "문서 커밋과 기능 커밋 분리해서 커밋하고 A–B 반복 진행"을 지시했다.
  로컬 커밋 2개 생성: `8a7d8f1`(인계 문서), `277a0e7`(연습 속도+D-01 기록). push/deploy 없음.
- 정책: loop 끝 경계 예약 방식과 설정 유지/무효화/hidden 정책은 개별 질의 없이 구현 기본값으로 정하고
  MODULE_CONTRACTS "Phase 3 — A–B 반복" 절에 명시했다. 사용자 명시 승인 항목과 구분한다.
- 재사용: `domain/score/playback.ts`, `adapters/tone/playback.ts`의 기존 예약/정지 수명과 `mergeTiedNotes`,
  `PlaybackControls`의 로컬 state/ref/요청 토큰. 새 모듈·의존성·상태 시스템·저장 필드 없음.
- 변경 제품 파일 3개: `src/domain/score/playback.ts`(PlaybackLoop 검증·마디→tick·wrap 계산),
  `src/adapters/tone/playback.ts`(`options.loop`, `setLoop`, pass 단위 rolling 예약; setRate와 재예약 수명 공유),
  `src/features/playback/PlaybackControls.tsx`(A–B 체크박스·첫/마지막 마디 입력·상태/오류 표시·hidden 정지).
- 테스트: `tests/unit/ab-loop.test.ts` 38개, `tests/e2e/ab-loop.spec.ts` 2개 신규.
  `tests/e2e/storage.ts`에 원시 row 조회 `storedRow`를 추가하고 practice-rate.spec의 동일 헬퍼를 이것으로 교체했다
  (assertion 변경 없음). 기존 테스트 삭제·skip·기대값 약화 없음.
  loop 단위 테스트는 구현과 함께 작성해 첫 실행에서 통과했다(실패 선확인 절차는 연습 속도 때와 달리 수행하지 않음).
- 실제 실행: `npm run test` **47파일/797개 PASS**, typecheck/lint PASS,
  `npm run check:architecture` 63모듈/192의존성/경계56파일 위반0,
  `npx playwright test`(프로덕션 build+start) **Chromium 61/61 PASS**(기존59+신규2), `git diff --check` PASS.
- 미검증: 실제 스피커 청취(경계 잔음·중복 어택·장시간 drift 체감), Safari/WebKit/Firefox, 모바일 실기기,
  메인 스레드 장시간 정지 시 다음 pass 예약 지연. Tone은 단위 테스트에서 대역이다.
- Score v2/Part.ties/DB2/ADR-010/Command/의존성/레이어 변경 없음. 작성 시점에는 미커밋이었고,
  2026-11-12 사용자 요청으로 `a5d1965`에 로컬 커밋했다(push 없음).
- 다음: (1) A–B 변경 커밋 여부, (2) 실제 청취 인수(UAT-A), (3) P3-06 연속 구간 선택(C-08 확정됨),
  (4) H-03 브라우저 성능 측정.

## 9. P3-06 — 연속 구간 선택 projection (구현·자동 검증 완료, 로컬 커밋 `f869d78`, 2026-11-12)

- 요청: 사용자가 "A–B 반복 커밋하고 P3-06 연속 구간 선택 진행"을 지시했다. A–B는 `a5d1965`로 로컬 커밋했다.
- 정책 근거: D-01의 C-08 확정안(첫 Part, 연속 `[start,end)`, 타이 체인을 자르는 선택 거부).
  UI 입력 단위(마디)·거부 시 선택 해제·단일 이벤트 선택과의 관계는 구현 기본값으로 정해
  MODULE_CONTRACTS "Phase 3 — 연속 구간 선택" 절에 사용자 명시 승인 항목과 구분해 기록했다.
- 재사용: `playbackLoopIssue`/`measureRangeLoop`(범위·마디→tick 검증), `chainIdsOf`(타이 체인),
  Editor 로컬 state, StaffView의 `data-event-id` DOM. 새 의존성·전역 Store·Command·저장 필드 없음.
- 신규 제품 파일 2개: `src/domain/score/selection.ts`(`selectScoreRange`, `selectMeasureRange`),
  `src/features/score-editor/RangeSelect.tsx`(마디 범위 폼·상태·오류).
  변경 제품 파일 5개: `domain/score/index.ts`·`score-editor/index.ts`(export),
  `StaffView.tsx`(선택적 `rangeEventIds`, SVG 재렌더 없는 DOM 표시), `app/editor/[scoreId]/page.tsx`(로컬 선택 state·무효화·목록 표시),
  `app/globals.css`(`data-range-selected` 스타일).
- 테스트: `tests/unit/range-selection.test.ts` 14개(구현 전 14개 실패 확인 후 구현),
  `tests/e2e/range-selection.spec.ts` 2개. E2E 첫 실행에서 1건 실패했는데 원인은 테스트의 잘못된 가정
  (쉼표 삽입이 그 쉼표를 단일 선택하는 기존 동작)이었고, 제품 코드가 아니라 신규 테스트 기대를 실제 동작에 맞췄다.
  기존 테스트 삭제·skip·기대값 변경 없음.
- 회귀 1건 발견·수정: StaffView 첫 구현(두 번째 `useRef`와 `.then().catch()`)이 기존
  `tests/unit/staff-notation-error.test.ts` 2개를 깨뜨렸다. 테스트는 그대로 두고 제품 코드를 고쳤다
  (선택 ID를 요소별 WeakMap에 보관, 렌더 effect를 마지막에 두고 `.then(ok, fail)`로 오류 안내 시점 유지).
- 실제 실행(수정 후 재실행): `npm run test` **48파일/811개 PASS**, typecheck/lint PASS,
  `npm run check:architecture` 65모듈/201의존성/경계58파일 위반0,
  `npx playwright test`(프로덕션 build+start) **Chromium 63/63 PASS**(기존61+신규2).
- 미검증: Safari/WebKit/Firefox, 모바일 실기기(hasTouch 에뮬레이션만), 하이라이트 색의 실제 시인성·색각 접근성,
  스크린리더 낭독. 대형 악보에서의 선택 계산 성능은 측정하지 않았다(H-03 미수행).
- Score v2/Part.ties/DB2/ADR-010/Command/의존성/레이어 변경 없음. 작성 시점에는 미커밋이었고,
  같은 날 사용자 요청으로 `f869d78`에 로컬 커밋했다(push 없음).
- 다음: (1) P3-06 커밋 여부, (2) P3-07 읽기 전용 Copy·원자 Paste 엔진(새 Command 추가 포함),
  (3) 실제 청취 인수(UAT-A), (4) H-03 브라우저 성능 측정.

## 10. P3-07 — 읽기 전용 Copy와 원자 Paste 엔진 (구현·자동 검증 완료, 미커밋, 2026-11-12)

- 요청: 사용자가 "커밋 해주고 다음 진행"을 지시했다. P3-06은 `f869d78`로 로컬 커밋했다.
- 범위: 도메인/애플리케이션 엔진만. Copy/Paste 버튼·clipboard 보관·저장 통합은 P3-08이며 **화면에서는 아직 쓸 수 없다.**
- 정책 근거: D-01의 C-08 확정안. 확정안에 없는 세부(대상 범위 전체가 비어야 함, 경계 넘는 음표만 재분할,
  경계 넘는 쉼표 거부, 이벤트 없는 구간 복사 거부, updatedAt 미변경)는 구현 기본값으로 정해
  MODULE_CONTRACTS "Phase 3 — Copy/Paste 엔진" 절에 사용자 명시 승인 항목과 구분해 기록했다.
- 재사용: `selectScoreRange`(복사 시 재검증), `splitNoteIntoMeasures`/`mapSplitFailure`, `mergePlacements`,
  `finalize`(validateScore), 기존 edit-session 이력. `store.dispatch` 반복 없이 Command 하나로 적용한다.
- 신규 제품 파일 2개: `src/domain/score/clipboard.ts`(`ClipboardPayload`, `copyScoreRange`, `cloneScoreEvent`),
  `src/application/clipboard.ts`(`planPaste`). 변경 제품 파일 4개: `domain/commands/types.ts`(`PasteEvents` Command,
  오류 코드 `NOTHING_TO_PASTE`/`PASTE_TARGET_OCCUPIED` 추가), `domain/commands/apply.ts`(`pasteEvents`),
  `domain/score/index.ts`·`application/index.ts`(export). 기존 Command 형태·오류 코드는 그대로다(추가만).
- 테스트: `tests/unit/clipboard.test.ts` 14개(구현 전 14개 실패 확인 후 구현, 구현 후 첫 실행에서 통과).
  기존 테스트 삭제·skip·기대값 변경 없음.
- 실제 실행: `npm run test` **49파일/825개 PASS**, typecheck/lint PASS,
  `npm run check:architecture` 67모듈/211의존성/경계60파일 위반0,
  `npx playwright test`(프로덕션 build+start) **Chromium 63/63 PASS**(UI 변경 없음, 회귀 확인용).
- 미검증: 화면을 통한 실제 복사·붙여넣기(UI 없음), IndexedDB 저장/재열기·두 탭 OCC와의 통합(P3-08 범위),
  대형 악보에서의 붙여넣기 성능(H-03 미수행).
- Score v2/Part.ties/DB2/ADR-010/의존성/레이어 변경 없음. P3-07 변경분은 commit하지 않았다.
- 다음: (1) P3-07 커밋 여부, (2) P3-08 Copy/Paste UI 및 저장 통합, (3) P3-09 원자 Cut,
  (4) 실제 청취 인수(UAT-A), (5) H-03 브라우저 성능 측정.
