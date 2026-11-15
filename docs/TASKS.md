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

## 10. P3-07 — 읽기 전용 Copy와 원자 Paste 엔진 (구현·자동 검증 완료, 로컬 커밋 `635cd37`, 2026-11-12)

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

## 11. P3-08 — Copy/Paste UI 및 저장 통합 (구현·자동 검증 완료, 로컬 커밋 `3a6fbc8`, 2026-11-12)

- 요청: 사용자가 "커밋해주고 다음 진행"을 지시했다. P3-07은 `635cd37`(`feat(score): add copy payload and atomic paste command`)로
  로컬 커밋했다(push 없음). 위 §10의 "미커밋" 서술은 이 커밋으로 해소됐다.
- 범위: 화면의 "구간 복사"/"커서에 붙여넣기" 제어와 기존 autosave 경로 통합. Cut은 P3-09다.
- 신규 제품 파일 1개: `src/features/score-editor/ClipboardControls.tsx`. 변경 제품 파일 2개:
  `src/features/score-editor/index.ts`(export), `src/app/editor/[scoreId]/page.tsx`(clipboard 지역 상태, `pasteCommand`, 배치).
  도메인/애플리케이션/store/저장소/autosave 코드는 변경하지 않았다. 새 의존성·저장 경로·상태 시스템 없음.
- 동작: Copy는 현재 Score에서 유효한 구간 선택이 있을 때만 가능하고 `copyScoreRange`로 다시 계산한다(무쓰기).
  Paste는 편집 커서 tick에 `planPaste` → `scoreStore.dispatch` 1회. 성공하면 커서를 붙여넣은 구간 바로 뒤로 옮긴다.
  실패(대상 점유·마디 부족·표기 불가·append 모드)는 Score/이력/저장을 그대로 두고 버튼 옆에 사유를 보여 준다.
  clipboard는 EditorWorkspace 지역 상태라 편집·Undo/Redo 후에도 유지되고 새로고침·다른 악보 이동 시 비워진다.
- 구현 기본값(사용자 명시 승인 아님): (1) append 모드에서는 붙여넣지 않고 커서 모드 전환을 안내, (2) 성공 후 커서 자동 이동,
  (3) 저장 충돌/삭제 상태에서도 다른 편집과 동일하게 메모리 붙여넣기는 허용(저장은 기존 차단 그대로),
  (4) 키보드 단축키(Ctrl/⌘+C/V)는 추가하지 않음 — 건반 입력 단축키·브라우저 기본 복사와 충돌 검토가 필요해 버튼만 제공.
- 테스트: `tests/integration/paste-persistence.test.ts` 1개, `tests/e2e/copy-paste.spec.ts` 4개 신규.
  E2E는 UI 구현 전에 작성했으나 **구현 전 실패 실행은 하지 않았고** 구현 후 첫 실행에서 4/4 통과했다.
  통합 테스트는 P3-07 엔진만으로 통과하는 저장 통합 회귀다. 기존 테스트 삭제·skip·기대값 변경 없음.
- 실제 실행: `npm run test` **50파일/826개 PASS**, typecheck/lint PASS,
  `npm run check:architecture` 68모듈/217의존성/경계61파일 위반0,
  `npx playwright test`(프로덕션 build+start) **Chromium 67/67 PASS**(기존63+신규4).
- 미검증: Safari/WebKit/Firefox, 모바일 실기기, 스크린리더, 대형 악보에서의 붙여넣기 성능(H-03 미수행),
  사람이 직접 써 본 사용감(특히 "대상 범위 전체가 비어야 함" 규칙).
- Score v2/Part.ties/DB2/ADR-010/의존성/레이어 변경 없음. P3-08 변경분은 commit하지 않았다.
- 다음: (1) P3-08 커밋 여부, (2) P3-09 원자 Cut, (3) P3-10 통합 인수, (4) 실제 청취 인수(UAT-A), (5) H-03.

## 12. P3-09 — 원자 Cut (구현·자동 검증 완료, 로컬 커밋 `adca21e`, 2026-11-12)

- 요청: 사용자가 "커밋해주고 다음 진행"을 지시했다. P3-08은 `3a6fbc8`(`feat(editor): add copy and paste controls`)로
  로컬 커밋했다(push 없음). 위 §11의 "미커밋" 서술은 이 커밋으로 해소됐다.
- 범위: 타이가 닫힌 구간 선택의 원자 삭제와 clipboard 교체. 자동 타이 절단·뒤 이벤트 당기기·마디 삭제 없음.
- 변경 제품 파일 5개: `domain/commands/types.ts`(`CutEvents` Command, 오류 코드 `INVALID_SELECTION`/`NOTHING_TO_CUT` 추가),
  `domain/commands/apply.ts`(`cutEvents`), `application/clipboard.ts`(`planCut`, `CutPlan`),
  `features/score-editor/ClipboardControls.tsx`("구간 잘라내기" 버튼, prop `onPaste`→`onCommand`),
  `app/editor/[scoreId]/page.tsx`(`clipboardCommand`). 신규 제품 파일 없음. 기존 Command·오류 코드는 그대로다(추가만).
- 동작: `planCut`이 `copyScoreRange`로 payload를 만들고 `CutEvents` Command 하나를 계획한다. Command는 적용 시
  `selectScoreRange`로 현재 Score에서 구간을 다시 검증한다. UI는 dispatch가 성공한 뒤에만 clipboard를 교체한다.
  `DeleteEvent` 반복 dispatch는 쓰지 않는다. Undo 1회로 모든 이벤트와 타이가 돌아온다.
- 구현 기본값(사용자 명시 승인 아님): (1) 이벤트가 없는 구간은 잘라내기 거부, (2) Undo는 악보만 되돌리고 clipboard는
  잘라낸 내용 그대로 유지(clipboard는 이력 밖), (3) 잘라내기 후 편집 커서는 움직이지 않음, (4) `updatedAt` 미변경.
- 테스트: `tests/unit/cut.test.ts` 6개(구현 전 6개 실패 확인), `tests/e2e/cut.spec.ts` 2개(UI 구현 전 2개 실패 확인).
  신규 단위 테스트 1곳에서 `validateScore` 반환형을 잘못 써 구현 직후 1개가 실패했고 그 신규 기대식을 바로잡았다.
  기존 테스트 삭제·skip·기대값 변경 없음.
- 실제 실행: `npm run test` **51파일/832개 PASS**, typecheck/lint PASS,
  `npm run check:architecture` 68모듈/219의존성/경계61파일 위반0,
  `npx playwright test`(프로덕션 build+start) **Chromium 69/69 PASS**(기존67+신규2).
- 미검증: Safari/WebKit/Firefox, 모바일 실기기, 스크린리더, 대형 악보 성능(H-03), 사람의 수동 사용 확인.
  Cut 전용 두 탭 OCC/Tombstone E2E는 추가하지 않았다(같은 dispatch·autosave 경로인 Paste에서 검증).
- Score v2/Part.ties/DB2/ADR-010/의존성/레이어 변경 없음. P3-09 변경분은 commit하지 않았다.
- 다음: (1) P3-09 커밋 여부, (2) P3-10 Phase 3 통합 인수, (3) 수동 UAT(청취·Safari·실기기), (4) H-03.

## 13. P3-10 — Phase 3 통합 인수 (자동 검증 완료·수동 UAT NOT RUN, 로컬 커밋 `39c636f`, 2026-11-12)

- 요청: 사용자가 "커밋해주고 다음 진행"을 지시했다. P3-09는 `adca21e`(`feat(editor): add atomic cut`)로
  로컬 커밋했다(push 없음). 위 §12의 "commit하지 않았다" 서술은 이 커밋으로 해소됐다.
- 범위: Phase 3 기능을 한 흐름으로 묶는 자동 인수 테스트와 문서. 제품 코드 변경 없음, 신규 기능 없음.
- 신규 파일 1개: `tests/e2e/phase3-integration.spec.ts`(테스트 1개). 한 악보에서 순서대로
  입력(온음표 + 마디를 넘는 타이) → 조옮김 C→D 확정 → 라벨(letter) → 2–3마디 선택·복사 → 5마디 붙여넣기 →
  1마디 잘라내기 → 7마디 붙여넣기 → 연습 속도 150% + A–B 반복(5–6마디) 재생 → JSON 백업 →
  Undo 4회/Redo 4회 → 새로고침 → 악보함에서 재열기를 수행한다.
- 확인한 것: 각 단계의 IndexedDB 저장 Part(시작 tick·길이·MIDI), 조표 fifths 2, 타이 2개, 이벤트 ID 5개 고유,
  schemaVersion 2, 반복 재생 중 재생 tick이 반복 구간 [15360, 23040) 안에 머무름(12회 표본), 라벨·선택·clipboard·
  rate·loop 조작 후 **원시 row 불변**(revision 포함), tempoBpm 120 불변, JSON 백업 = 저장 Score이며
  연습·UI 상태 키 없음, Undo가 붙여넣기→잘라내기→붙여넣기→조옮김을 1회씩 되돌리고 Redo 후 저장 Score 동일,
  새로고침 후 라벨/rate/loop/선택/clipboard 기본값 복귀와 악보 유지, 재열기 후 저장 Score 동일.
- 재현된 결함: 없음. 따라서 제품 수정 없음. 이 테스트는 이미 구현된 기능의 인수 테스트라 실패 선확인 단계가 없고
  첫 실행에서 통과했다(회귀 감지력을 변이로 따로 확인하지는 않았다).
- 이 통합 흐름에 넣지 않은 것: 두 탭 OCC·Tombstone·손상 row·거부/no-op 경로. 각 기능의 기존 E2E
  (`copy-paste`, `cut`, `transpose-integration`, `ab-loop` 등)가 그대로 통과하는 것으로 유지를 확인했다.
- 실제 실행: `npm run test` **51파일/832개 PASS**, typecheck/lint PASS,
  `npm run check:architecture` 68모듈/219의존성/경계61파일 위반0,
  `npx playwright test`(프로덕션 build+start) **Chromium 70/70 PASS**(기존69+신규1), `git diff --check` PASS.
  기존 테스트 삭제·skip·기대값 변경 없음.
- **인수 상태: 자동 검증 부분만 완료.** BACKLOG의 수동 UAT-C/S/A/T/R는 전부 NOT RUN이므로 P3-10 전체 인수는
  완료가 아니다. 실제 스피커 청취(속도·반복 경계), Mac Safari, iPhone/Android 실기기, hidden/강제 종료 복구,
  스크린리더, 대형 악보 성능(H-03)은 검증하지 않았다.
- 사용자 확인 대기: 연습 속도·반복·구간 선택·붙여넣기·잘라내기의 구현 기본값(§7~§12, 사용자 명시 승인 아님).
- Score v2/Part.ties/DB2/ADR-010/의존성/레이어 변경 없음. P3-10 변경분은 commit하지 않았다.
- 다음: (1) P3-10 커밋 여부, (2) 수동 UAT 실행(사용자), (3) 구현 기본값 확정, (4) H-03, (5) Phase 4 이후는 별도 승인.

## 14. H-03 — 대형 악보 브라우저 측정 (측정 완료·수용 조건 미합의, 로컬 커밋 `9bc3631`, 2026-11-12)

- 요청: 사용자가 "커밋해주고 다음 진행"을 지시했다. P3-10은 `39c636f`(`test(e2e): add phase 3 integration acceptance flow`)로
  로컬 커밋했다(push 없음). 위 §13의 "commit하지 않았다" 서술은 이 커밋으로 해소됐다.
- 범위: BACKLOG H-03의 **측정**만. 최적화·캐시·Worker·지원 상한 공표는 하지 않았다. 제품 코드 변경 없음.
- 신규 비제품 파일 2개: `playwright.perf.config.ts`, `tests/perf/browser-scale.spec.ts`. `package.json`에 스크립트
  `perf:browser` 1줄 추가(의존성 변경 없음). `npm run test:e2e`·`npm run test`에는 포함되지 않으며 임계값 단언이 없다
  (PASS/FAIL 게이트가 아님). 결과 JSON은 `PERF_OUT`(기본 `test-results/perf`, gitignore 대상)에 쓴다.
- 방법: 감사와 같은 합성 fixture 5종(8/64/256마디, 64마디×4Part, 256마디+타이 255개)을 실제 악보함 JSON 가져오기로
  넣고 편집기에서 열기·라벨 전환·마디 추가·Undo·추천 계산(넓은 목표 62–74, 좁은 목표 60–62, 더블클릭)을 각 5회 측정했다.
  CPU 1배와 CDP 4배 감속 두 조건. 지표는 wall 시간, Event Timing 입력 지연, long task, 20ms 타이머 지연, heap, DOM 노드 수.
- 결과 요약(중앙값, 상세 표는 TEST_PLAN "H-03"): 64마디까지는 1배에서 long task가 거의 없다. 256마디(음표 1024개)는
  **모든 편집·Undo마다 악보 전체를 다시 그려** 1배 약 140ms, 4배 약 620–660ms 동안 메인 스레드가 멈춘다.
  라벨 전환은 1배 약 170ms, 4배 약 750–790ms. 추천 계산은 타이 없는 1024음표 1배 86–96ms / 4배 385–415ms,
  타이 255개 1배 431–441ms / 4배 약 1.9초. 추천 버튼 더블클릭은 계산이 두 번 실행되어 시간이 약 2배다
  (타이 4배 조건 약 3.7초). 타이머 지연은 long task 길이와 같아 자동 저장 타이머가 그만큼 늦게 실행된다(유실은 관찰되지 않음).
  heap은 열기 직후 약 7–8MB, 추천 후 최대 약 22MB.
- 측정 중 확인한 사실: 타이로 이어진 뒷 세그먼트에는 악보 라벨이 붙지 않는다(1024개 중 769개 표시). 측정 스크립트의
  기대값을 이에 맞췄다. 제품 결함으로 분류하지 않았다.
- 한계: Apple M2 한 대, Chromium 한 종, 합성 데이터, 표본 5회(백분위·SLA 근거로 부족), 4배 감속은 저사양 기기의
  근사일 뿐 실기기가 아니다. Safari/Firefox, 실제 모바일, 재생(Tone) 중 부하, 256마디 초과, 긴 단일 타이 체인,
  무제한 Undo 메모리 누적은 측정하지 않았다. select 변경은 Event Timing에 잡히지 않아 라벨 전환의 입력 지연은 0으로 기록됐다.
- 실제 실행: `npm run perf:browser` 상당 명령으로 5종 측정 완료(4종 1회차 + tied는 기대값 수정 후 별도 재실행),
  `npm run test` 51파일/832개 PASS, typecheck/lint PASS, architecture 위반0, `playwright test --list` 70개(기존 E2E 불변).
  전체 E2E는 제품 코드가 바뀌지 않아 다시 돌리지 않았다(마지막 실행 70/70, `39c636f` 기준).
- **미결(사용자 결정 필요)**: (1) 기준 기기와 지원할 최대 악보 크기, (2) 수용 가능한 편집 지연, (3) 개선 작업 승인 여부.
  개선 후보(미구현, 별도 승인 대상): 추천 중복 제출 차단, 타이 검증의 ID 조회 인덱스, 악보 부분 재그리기 또는 보이는 마디만 그리기.
- 다음: (1) H-03 커밋 여부, (2) 위 미결 3건 결정, (3) 수동 UAT, (4) 구현 기본값 확정, (5) Phase 4 이후는 별도 승인.

## 15. H-03 — 256마디급 개선 (구현·자동 검증 완료, 로컬 커밋 `6b70db9`, 2026-11-13)

- 요청: 사용자가 "256 마디급으로 가자 / 개선 작업 해줘 / 커밋해줘"를 지시했다. §14 측정은 `9bc3631`
  (`test(perf): add H-03 browser scale measurement`)로 로컬 커밋했다(push 없음). 이 절의 개선 변경은 **커밋하지 않았다**.
- 사용자 결정: 지원 목표 규모는 **256마디급**(음표 약 1000개), §14의 개선 후보 3건 승인. 기준 기기와 허용 지연 수치는 여전히 미합의다.
- 구현 A — 추천 중복 제출 차단: `RangeRecommendations`는 목표가 바뀌지 않은 재제출에서 기존 target 객체를 그대로 써서
  다시 계산하지 않는다(더블클릭 1회 계산).
- 구현 B — 추천·타이 검증 비용: `tie.ts`의 ID 조회를 호출당 1회 만드는 Map으로 바꿨다(캐시 아님, 호출 사이에 남지 않음).
  추천 엔진은 같은 입력 Score를 300번 다시 검증하지 않는다. 내부 모듈 `domain/score/transpose-core.ts`의
  `transposeValidatedScore`를 쓰며 공개 index에는 노출하지 않았다. **후보 300개 각각의 결과 검증과 순위·안전 판정,
  최종 Command 검증·OCC는 그대로다.** `transposeScore`의 공개 동작(입력 검증 포함)은 변하지 않았다.
- 구현 C — 악보 부분 재그리기: `renderScoreInto`가 줄(4마디) 단위로 서명을 비교해 바뀐 줄만 다시 그리고 기존 SVG에
  제자리 교체한다. 캐시 키·무효화·메모리 상한은 MODULE_CONTRACTS "악보 줄 캐시(H-03)"에 기록했다.
  Worker·새 의존성·저장/상태 구조 변경은 없다. Score/schemaVersion/Command/Repository 계약 변경 없음.
- 측정 스크립트 수정: 프로브가 `getByRole`/`getByLabel` 대신 미리 잡은 요소 핸들을 쓴다. 기존 방식은 클릭 직전에
  Playwright가 페이지 전체의 접근성 이름을 계산해(256마디에서 약 115ms, CPU 프로파일로 확인) 타이머 지연과 wall에
  섞였다. **§14와 TEST_PLAN 1차 표의 타이머 지연·wall 값은 그만큼 과대였다**(long task·입력 지연 값은 영향 없음).
  CDP 메인 스레드 시간(script/style/layout/task) 열도 추가했다.
- 결과(중앙값, 5회, 상세는 TEST_PLAN "H-03 개선"): 256마디 마디 추가·Undo가 1배에서 long task 약 225ms → 0,
  입력 지연 232ms → 24ms, 4배 감속에서 long task 약 1.1초 → 약 70ms. 타이 255개 추천은 1배 725ms → 120ms,
  4배 3.1초 → 0.5초, 더블클릭은 1회 계산 비용과 같다. **열기와 라벨 전환은 설계상 전체를 그리므로 그대로다**
  (256마디 1배 열기 long task 약 135ms, 라벨 전환 약 290ms / 4배 약 0.56초, 약 1.2–1.3초).
- 신규 테스트: `tests/unit/staff-row-reuse.test.ts` 5개, `tests/e2e/staff-row-reuse.spec.ts` 1개,
  `range-recommendations-ui.test.ts`에 재제출 1개. 기존 테스트 삭제·skip·기대값 약화 없음.
- 실제 실행(최종 코드): typecheck PASS, lint PASS, `npm run test` 52파일/838개 PASS, architecture 위반 0
  (69모듈/221의존성, 경계 62파일), build PASS, Chromium E2E 71/71 PASS, `git diff --check` 통과, `npm run perf:browser` 5종 완료.
- 한계·미검증: Apple M2 한 대·Chromium headless·합성 데이터·표본 5회. 기준선 재측정 회차는 기기 부하로 전반적으로
  느렸다(변경하지 않은 열기 값도 약 1.7배). Safari/Firefox, 실제 모바일·저사양 기기, 실제 청취, 재생 중 부하,
  256마디 초과, 수동 UAT는 NOT RUN. 한 줄 안의 편집은 그 줄 4마디를 다시 그리며, 줄 수가 바뀌는 편집은 SVG 크기를 바꾼다.
- **미결(사용자 결정 필요)**: (1) 이 개선의 커밋 여부, (2) 기준 기기와 허용 지연 수치(H-03 인수 조건),
  (3) 열기·라벨 전환까지 줄일지(보이는 줄만 그리기 등은 구조 변경이라 별도 승인 대상), (4) 수동 UAT, (5) 구현 기본값 확정.

## 16. H-03 종료 및 수동 UAT 사전 점검 (WebKit 자동 실행 완료·수동 UAT NOT RUN, 2026-11-13)

- 요청: 사용자가 H-03 인수 기준에 동의했고("CPU 4배 감속에서 256마디 편집·Undo long task 100ms 이하, 추천 600ms 이하"),
  열기·라벨 전환 개선은 보류하고 수동 UAT(청취·Safari·실기기)를 먼저 하라고 지시했다. §15 개선은 `6b70db9`로 로컬 커밋했다(push 없음).
- H-03: 위 기준으로 종료했다(BACKLOG H-03에 기록). Apple M2·Chromium 합성 측정 기준이며 Safari·실기기 성능 인수가 아니다.
- **에이전트가 할 수 없는 것:** 실제 청취(UAT-A), 실제 Mac Safari 수동 조작(UAT-S), 실제 iPhone/Android(UAT-T)는
  사람과 실기기가 필요하다. 이 항목들은 여전히 **NOT RUN**이며 아래 자동 실행으로 대체하지 않는다.
- 수행한 사전 점검: Playwright WebKit 27.2(build 2388)로 기존 E2E 71개를 "Desktop Safari"와 "iPhone 15" 에뮬레이션
  두 조건에서 실행했다(임시 설정 파일, 저장소에 남기지 않음, 제품·테스트 코드 변경 없음). 결과 142개 중 **138 PASS / 4 FAIL**.
- 실패 4건은 같은 원인 1가지(2개 테스트 × 2조건): JSON 백업 다운로드 파일명이 WebKit에서 한글 **NFD(자모 분해)**로
  전달되어 NFC 기대값과 문자열 비교가 달랐다(`백업 연습곡.json` 11자 vs 21자, NFC 정규화 후 동일함을 확인).
  다운로드 자체와 이후 흐름의 실패는 관찰되지 않았다(단언에서 중단되어 그 뒤 단계는 WebKit에서 미실행).
  테스트 기대값은 바꾸지 않았다. 실제 Safari에서도 같은지, 다른 OS로 옮겼을 때 파일명이 깨져 보이는지는 UAT-S에서 확인할 항목이다.
- 그 밖의 67개 테스트(편집·커서·조옮김·라벨·추천·저장/OCC/Tombstone·연습 속도·A–B 반복·복사/잘라내기/붙여넣기·
  줄 재사용)는 두 조건 모두 PASS. 단 WebKit 엔진 자동 실행일 뿐 실제 Safari 앱, 실제 터치, 실제 소리가 아니다.
- 실기기 주의(코드 확인, 실기기 미실행): 앱은 새 악보·가져오기·쉼표/마디 추가·붙여넣기에서 `crypto.randomUUID()`를 쓴다.
  이 API는 보안 컨텍스트(HTTPS 또는 localhost)에서만 있으므로 휴대폰에서 `http://<Mac IP>:3010`으로 접속하면
  이 동작들이 실패할 것으로 예상된다. 실기기 UAT-T에는 HTTPS 주소(배포 미리보기 또는 터널)가 필요하며 배포·터널은 별도 승인 대상이다.
  HTTPS로 배포되는 실제 서비스에서는 해당하지 않는다. 마이크 입력 코드는 현재 저장소에 없다.
- 다음: (1) 사용자의 수동 UAT-S/A/T 실행과 결과 기록(절차는 PHASE2_ACCEPTANCE_REPORT §7의 M/A/T 항목),
  (2) NFD 파일명 처리 여부 결정, (3) 이 문서 변경의 커밋 여부, (4) 구현 기본값 확정, (5) Phase 4 이후는 별도 승인.
- **후속(같은 날, 사용자 지시 "지금 원해"): NFD 파일명 처리.** `exportScoreBackup`이 제목을 NFC로 정규화한 뒤 금지 문자 치환과
  80자 제한을 적용한다(분해형 한글 제목이 음절 중간에서 잘리지 않음). 저장되는 Score의 제목과 JSON 내용은 바꾸지 않는다.
  E2E 2곳(`editor.spec.ts`, `storage-concurrency.spec.ts`)은 받은 파일명을 NFC로 맞춘 뒤 **같은 문자열**과 비교한다.
  기대 문자열 자체는 그대로이며 유니코드 표현형만 통일했다. 단위 테스트 1개 추가(NFD 제목 → NFC 파일명, 제목 보존, 80음절 유지).
  **macOS WebKit이 다운로드 파일명을 NFD로 바꾸는 것 자체는 브라우저·OS 동작이라 앱이 막을 수 없다.**
- 재실행(최종 코드): typecheck/lint PASS, `npm run test` 52파일/840개 PASS, architecture 위반 0, Chromium E2E 71/71 PASS(빌드 포함).
  WebKit 2조건 142개 중 141 PASS / 1 FAIL. NFD 실패 4건은 해소됐다.
- **새로 관찰된 WebKit 간헐 실패(미해결):** `piano-preview.spec.ts:70`(오디오 실패 중 같은 건반 3회 연속 클릭)이
  WebKit Desktop에서 전체 실행 중 1회, 단독 8회 반복 중 1회 실패했다(저장된 음표 3개 기대, 2개). 1차 WebKit 실행에서는 통과했고
  Chromium에서는 재현되지 않았다. 이번 변경과 무관한 코드 경로다. 원인은 조사하지 않았다(페이지 준비 전 클릭 유실 가능성은 추정일 뿐).
  UAT-S에서 "편집기를 연 직후 같은 건반을 빠르게 3번 누르면 음표 3개가 들어가는지"를 확인 항목으로 추가한다.
- 실기기 UAT용 Vercel 미리보기 배포를 사용자가 승인했다(운영 배포 아님).

## 17. WebKit 간헐 실패 원인 조사와 수정 (구현·자동 검증 완료, 로컬 커밋 `9a8b3dc`, 재배포 완료, 2026-11-13)

- 사용자 지시: §16의 WebKit 간헐 실패를 조사한다. `.gitignore`의 `.vercel` 한 줄은 `18fe679`로, NFD 처리와 §16 기록은
  `d13a19f`로 로컬 커밋했다(push 없음).
- **원인(재현으로 확인, 추정 아님):** 저장 문제가 아니라 클릭 유실이었다. 화면의 음표 수도 2개였다.
  악보 영역(`StaffView`)은 VexFlow 모듈을 동적 import한 뒤에야 SVG를 그리는데, 그 전까지 높이가 0에 가까웠다.
  편집기를 연 직후 건반을 누르는 순간(`pointerdown`)과 떼는 순간(`pointerup`) 사이(약 40ms)에 첫 악보가 그려지면서
  문서 높이가 1422→1725px로 303px 늘었고, 건반이 그만큼 아래로 밀렸다. 뗌이 건반이 아닌 악보 영역에 떨어져
  브라우저가 `click`을 공통 조상(`editor-content`)으로 보냈고 건반의 `onClick`이 실행되지 않아 음표 1개가 빠졌다.
  WebKit에서만 보인 것은 첫 그리기 시점이 누름과 겹칠 만큼 늦었기 때문이며, 다른 브라우저·느린 기기에서도 같은 조건이면 생길 수 있다.
- **수정:** `renderScoreInto`가 동적 import를 기다리기 전에, 그려질 높이(줄 수 × 줄 높이 + 위 여백)를 악보 요소의
  `min-height`로 잡아 두고 그리기가 끝나거나 실패하면 해제한다. 이미 그려진 SVG를 유지하는 재그리기(H-03 줄 캐시)에서는 잡지 않는다.
  Score·Command·저장·줄 캐시 계약은 바뀌지 않았다. 새 의존성 없음. 테스트 삭제·skip·기대값 변경 없음.
- 단위 테스트 1개 추가(`staff-row-reuse.test.ts`): import 완료 전 높이 예약(3줄 430px, 라벨 580px), 완료 후 해제, 재그리기 때 미예약.
- 재현 검증(임시 진단 spec, 실행 후 삭제): 수정 전 WebKit Desktop 40회 중 1회, 60회 중 1회 실패 → 수정 후 120회 0회 실패.
  원래 테스트(`piano-preview.spec.ts:70`)도 수정 후 WebKit 2조건 각 40회 반복 80/80 PASS.
- 최종 검증: typecheck/lint PASS, `npm run test` 52파일/841개 PASS, architecture 위반 0, `git diff --check` 통과,
  Chromium E2E 71/71 PASS(빌드 포함), WebKit 2조건(Desktop Safari·iPhone 15 에뮬레이션) 142/142 PASS.
- 한계: 첫 그리기 전에 **예약한 높이와 실제 SVG 높이의 몇 px 차이**(인라인 SVG 기준선 여백)는 남는다. 건반 높이(120px)에 비해 작아
  클릭 유실은 재현되지 않았지만, 다른 원인의 레이아웃 이동(예: 미리듣기 오류 문구 줄바꿈)은 이번에 다루지 않았다.
  실제 Safari·실기기에서의 확인은 여전히 NOT RUN이며 UAT-S의 "연 직후 같은 건반 빠르게 3번" 항목으로 확인한다.
- **Vercel 배포 기록:** 실기기 UAT용으로 승인된 것은 미리보기였으나 `vercel deploy --yes`가 새 프로젝트 `00_music_code`를 만들고
  **운영(production) 대상으로 배포**했다(에이전트 실수, 사용자에게 보고함). 공개 주소 `https://00musiccode.vercel.app`
  (로그인 없이 접근 가능, `/library` 200만 확인, 기능 미검증). 악보는 방문자 브라우저에만 저장되고 환경변수·비밀값은 올리지 않았다.
  사용자 결정: 완성할 때까지 테스트용으로 유지한다. 첫 배포(`dpl_AADoE9bfBsC3yuYdu2rwdV5NnABy`)는 `d13a19f` 시점 코드로 §17 수정이 없었다.
- **커밋·재배포(사용자 지시 "커밋해줘, 재배포해줘"):** §17 수정을 `9a8b3dc`로 로컬 커밋했다(push 없음). 같은 공개 주소를 갱신하기 위해
  `vercel deploy --prod --yes`로 재배포했다. 배포 `dpl_7NvWPWyUaqCT4iqDmFdu6iLdsMwH`(production, Ready)가
  `https://00musiccode.vercel.app`에 연결됐고 `9a8b3dc` 코드를 담는다. 확인한 것은 `/library`와 편집기 주소의 200 응답뿐이며
  **배포 주소에서의 기능 동작은 미검증**이다. 이후 코드가 바뀌어도 자동 재배포되지 않는다(Git 연동 없음, 재배포는 매번 승인 대상).
- 다음: (1) 사용자의 수동 UAT-S/A/T(실기기는 위 공개 주소 사용, "연 직후 같은 건반 빠르게 3번 → 음표 3개" 포함)와 결과 기록,
  (2) 구현 기본값 확정, (3) 완성 후 공개 주소 정리 여부, (4) Phase 4 이후는 별도 승인.

## 18. 수동 UAT 체크리스트 문서화 (문서만, 2026-11-13)

- 사용자 지시로 수동 UAT 절차를 [MANUAL_UAT_CHECKLIST.md](MANUAL_UAT_CHECKLIST.md)로 정리했다. 원문 계약은
  PHASE2_ACCEPTANCE_REPORT §7과 PHASE3_BACKLOG의 UAT 표이며, 체크리스트는 그 실행 순서 정리다(다르면 원문 우선).
- 포함: UAT-S(M-01~09 + 빠른 3연타·백업 파일명), UAT-A(A-01~05 + 속도/A–B 반복 5항목), UAT-T(T-01~04 + 실기기 3항목),
  UAT-R, UAT-C, 실패 기록 양식. 속도/A–B 반복·실기기 추가 항목의 ID(A-R/A-L/S-X/T-X/R-0n)는 이 문서에서 새로 붙인 것이다.
- 제품·테스트 코드 변경 없음, 자동 테스트 재실행 없음. `§17`과 재배포 기록은 `9f35d81`로 커밋·push됐다(origin/main 일치).
- **모든 수동 항목은 여전히 NOT RUN이다.** 다음: 사용자의 실행 결과를 받아 이 문서와 TEST_PLAN에 기록하고 실패 건을 재현·수정한다.

## 19. 공개 시험 주소 자동 점검 (자동 실행 완료, 2026-11-13)

- 사용자 지시 "다음 작업 진행". 남은 목록 중 에이전트가 할 수 있는 것은 실기기 UAT의 전제인 공개 주소 기능 확인뿐이었다
  (수동 UAT는 사람·실기기 필요, 구현 기본값은 사용자 결정, Phase 4 이후는 별도 승인 대상이라 시작하지 않았다).
- 실행: 기존 E2E 71개를 `https://00musiccode.vercel.app`(배포 `dpl_7NvWPWyUaqCT4iqDmFdu6iLdsMwH`, 코드 `9a8b3dc`) 대상으로
  Chromium, WebKit "Desktop Safari", WebKit "iPhone 15" 에뮬레이션에서 실행했다. 임시 설정 파일은 실행 후 삭제했다.
  결과 **213/213 PASS**(11.1분). 제품·테스트 코드 변경 없음. 시험 데이터는 Playwright 브라우저의 임시 저장소에만 쓰였다.
- 의미와 한계: 배포본이 로컬 빌드와 같은 자동 흐름을 통과한다는 것까지다. 실제 Safari 앱·실제 터치·실제 소리·실기기는
  여전히 NOT RUN이며 [MANUAL_UAT_CHECKLIST](MANUAL_UAT_CHECKLIST.md)의 어느 항목도 PASS로 바꾸지 않았다.
- 다음: (1) 사용자의 수동 UAT, (2) 구현 기본값 확정(§7~§12), (3) 완성 후 공개 주소 정리 여부, (4) Phase 4 이후는 별도 승인.

## 20. Phase 3 구현 기본값 확정 (문서만, 2026-11-13)

- 사용자 결정: "구현 기본값은 그대로 확정". §7~§12에서 에이전트가 개별 질의 없이 정했던 동작을 **변경 없이 승인**했다.
  이 절 이전의 "사용자 명시 승인 아님"·"사용자 확인 대기" 표기는 당시 상태의 이력이며, 현재 상태는 확정이다.
- 확정된 항목:
  - 연습 속도: 정지·일시정지·편집·Undo/Redo·조옮김 미리보기 후에도 같은 편집기 세션에서 유지, 새로고침/재진입 시 100%.
  - A–B 반복: 편집·Undo/Redo·조옮김 후 마디 번호와 ON 유지, 범위가 무효면 loop 미적용·안내(전체 재생),
    loop 재생 중 탭 hidden이면 정지, 새로고침/재진입 시 OFF·1/1. 끝 경계 예약 방식은 MODULE_CONTRACTS "Phase 3 — A–B 반복" 그대로.
  - 구간 선택: UI 입력은 마디 단위, 거부된 선택은 해제, 단일 이벤트 선택과 독립 상태, 빈 구간 선택 허용.
  - 복사/붙여넣기: gap 포함 대상 범위 전체가 비어야 함, 경계 넘는 음표만 재분할·쉼표는 거부, 빈 구간 복사 거부,
    `updatedAt` 미변경, append 모드에서는 안내만, 성공 후 커서 이동, 충돌/삭제 상태에서도 메모리 편집 허용, 키보드 단축키 없음.
  - 잘라내기: 빈 구간 거부, Undo/Redo는 clipboard 불변, 커서 유지, `updatedAt` 미변경.
- 반영: MODULE_CONTRACTS의 해당 7곳 표기를 "2026-11-13 사용자 확정"으로 바꿨다. 제품·테스트 코드 변경 없음, 자동 테스트 재실행 없음.
- 확정은 동작 정책에 대한 것이다. 실제 청취·Safari·실기기에서의 동작 확인(수동 UAT)은 여전히 **NOT RUN**이다.
- 다음: (1) 사용자의 수동 UAT, (2) 완성 후 공개 주소 정리 여부, (3) Phase 4 이후는 별도 승인.

## 21. Phase 4 착수 — D-02 확정과 P4-01 (구현·자동 검증·커밋 완료, 2026-11-13)

- 사용자 결정: "문서로 남기고 결정 1~8은 권고안대로 진행". Phase 4(PRD MVP-002/003) 계획을 문서화하고 D-02를 확정했다.
  - 문서: [PHASE4_MASTER_PLAN](PHASE4_MASTER_PLAN.md)(범위·유지 계약·결정 8개·품질 측정 정의·위험), [PHASE4_BACKLOG](PHASE4_BACKLOG.md)(P4-01~08).
  - 결정 요약: (1) 음높이 추정은 Domain 순수 TypeScript 직접 구현, 새 런타임 의존성 없음 (2) 녹음 종료 후 메인 스레드 분석,
    Worker는 별도 구조 승인 (3) 1차는 입력 레벨만 (4) 녹음 상한 30초(→ §22에서 8마디로 변경) (5) 확정은 붙여넣기와 같은 빈 대상 규칙
    (6) note F1 ≥ 0.90은 목표 (7) 합성 fixture만 저장소, 실제 허밍은 사용자 본인 녹음·동의분만 (8) AudioWorklet + `AudioTranscriptionPort` + 녹음 기능 폴더.
  - **미결**: 실제 허밍 녹음을 저장소에 넣을지. 결정 전까지 실제 녹음 파일은 커밋하지 않는다.
    P4-01(합성 fixture·채점기)은 이 조건과 무관하므로 사용자 지시("P4-01 지금 커밋")로 커밋했다.
  - MODULE_CONTRACTS의 C-09 행을 갱신했다.
- P4-01 구현(테스트 쪽만, 제품 코드·UI·의존성 변경 없음):
  - `tests/fixtures/transcription-score.ts`: `scoreTranscription`, `aggregateTranscriptionScores`(micro 평균), `assertMelodyNote`.
    같은 MIDI·같은 시작 위치의 일대일 대응만 TP. 남은 것 중 시작 위치가 같은 쌍을 옥타브 오류/그 밖의 음높이 오류로 분류하되 둘 다 누락 1 + 추가 1로 센다.
  - `tests/fixtures/humming.ts`: `synthesizeHumming`(배음·비브라토·음 시작 끌어올림·잡음(seed 고정)·전체 음정 어긋남·음 사이 간격·앞뒤 무음),
    `HUMMING_MELODIES` 8개(음계·반복음·쉼표·도약·8분음표·낮은 음역·높은 음역·3/4) × `HUMMING_CONDITIONS` 5개 = 40개 사례. 음성 파일 없음.
  - 테스트: `tests/unit/transcription-score.test.ts` 10개, `tests/unit/humming-fixture.test.ts` 10개. 구현 전 실패(모듈 없음)를 확인한 뒤 구현했다.
- 구현 기본값(사용자 개별 질의 없음, 변경 가능): 시작 위치 허용 오차 기본 0 tick, 표본화 44.1kHz, 배음 비 1/0.5/0.3/0.15,
  음 끝 30ms 간격, 사례 공통 앞 200ms·뒤 300ms 무음, 조건 수치(비브라토 ±40센트 5.5Hz, 끌어올림 150센트 80ms, 잡음 0.05, 전체 +30센트).
- 작성 중 고친 것(새로 쓴 테스트 자체의 문제, 기존 테스트 변경 없음): 비브라토 확인을 50ms 창의 주기 수 비교로 썼으나 440Hz·50ms가
  정수 주기로 맞아떨어져 변화를 못 잡았다. 영점 교차 간격의 폭 비교(일정음 ≤1표본, 비브라토 ≥4표본)로 바꿨다.
  40개 전체 렌더링이 5초 제한을 넘어 합성 루프를 줄였고(현재 파일 전체 약 2.3초) 해당 테스트에 30초 제한을 명시했다.
- 검증(2026-11-13): typecheck PASS, lint PASS, `npm run test` 54파일/861 PASS(이전 52/841 + 20), architecture 위반 0, build PASS, `git diff --check` 깨끗.
  UI·제품 코드 변경이 없어 E2E는 재실행하지 않았다.
- 한계: 합성음은 실제 목소리보다 훨씬 단순하다. 이 fixture의 수치는 실제 허밍 품질의 근거가 아니다. 아직 채보 코드가 없어 F1 실측값은 없다.
- NOT RUN: 실제 허밍·마이크·Safari·실기기, Phase 3 수동 UAT 전부.
- 커밋: `f6d4b55` test(transcription): add synthetic humming fixtures and note scorer.
- 다음: P4-02 음높이 추정(상한 8마디 입력 분석 시간 측정 포함).

## 22. 결정 4 변경 — 녹음 상한 30초 → 8마디 (완료, 커밋 `fb98aa2`, 2026-11-13)

- 사용자 지시: "30초 상한은 마디 기준으로 바꿔줘". 배경: 30초는 4/4 8마디(PRD MVP-003 상한)를 64 BPM 미만에서 담지 못한다.
- 반영: 마스터 플랜 결정 4·위험 표, 백로그 P4-02(8마디 분석 시간 측정, 4/4 60·20 BPM 포함, 8마디 사례 추가)·P4-05(8마디 자동 정지).
  `tests/unit/humming-fixture.test.ts`의 상한 검사를 8마디 기준으로 교체. 제품 코드 변경 없음.
- Claude 판단(변경 가능): 상한 값 8마디(PRD 상한), 카운트인은 상한에서 제외, 초 단위 안전 상한은 두지 않고 P4-02 측정 결과로 재검토.
  4/4 20 BPM이면 96초가 되므로 분석 시간이 수용 불가하면 결정 2(Worker) 또는 녹음 템포 하한을 별도 승인으로 올린다.
- 검증: 대상 10/10, `npm run test` 54파일/861 PASS, typecheck·lint·architecture·build PASS. E2E는 UI 변경이 없어 미실행.

## 23. P4-02 — 음높이 추정 (완료, 2026-11-13)

- 사용자 지시: "P4-02 진행해줘". 결정 1(Domain 순수 TypeScript, 새 의존성 없음)·결정 2(녹음 후 메인 스레드)를 따랐다.
- 신규 Domain 모듈 `src/domain/transcription/`(공개 진입점 `index.ts`). 기존에 음높이 추정 코드는 없었다(`rg` 확인).
  - `estimatePitchTrack(samples, sampleRate, options?)` → 프레임별 `{ timeSeconds, voiced, frequencyHz, midi, confidence, rms }`.
    YIN(누적 평균 정규화 차분, 절대 임계 0.1, 포물선 보간). 입력은 분석 전 11kHz 이상으로 정수배 다운샘플(윈도 sinc 저역 통과).
    차분 함수는 창 에너지(누적합)와 교차상관(복소 FFT 1회 + 역FFT 1회)으로 계산한다. 직접 계산과 수학적으로 같다.
    무음(RMS < 0.01)·비주기(aperiodicity > 0.2)·3프레임 미만 유성 구간은 무성 처리.
  - `smoothPitchContour(midi[])`: 한 유성 구간 안에서 ±4프레임 중앙값 기준 약 12반음 튐을 접고 5프레임 중앙값 평활화.
    지속되는 실제 옥타브 도약은 중앙값이 따라가므로 유지된다(테스트로 확인).
- fixture 보완: `HummingClip.downbeatSeconds`(tick 0의 클립 시각, 실제 녹음의 카운트인 자리). 검토 지적 1번 해소.
- 측정 도구: `npm run perf:pitch`(`vitest.perf.config.ts`, `tests/perf/pitch-analysis.perf.ts`). 일반 `npm run test`에 포함되지 않으며
  시간 기준을 assert하지 않는다. 결과는 `test-results/perf/pitch-analysis.json`(Git 무시).
- 구현 기본값(Claude 판단, 변경 가능): 탐색 70–1100Hz, hop 10ms, 무음 RMS 0.01, 비주기 0.2, 최소 유성 3프레임,
  분석 표본화 하한 11kHz(44.1kHz는 11.025kHz, 48kHz는 12kHz, 16·22.05kHz는 그대로 또는 2배 다운샘플).
- TDD 기록: 각 테스트를 먼저 실패(모듈·export 없음, 필드 없음)시킨 뒤 구현했다. 정확도 하한은 구현 전에 정했다.
  - 처음 쓴 옥타브 보정 테스트(신호 중간 40ms를 실제로 한 옥타브 올림)는 잘못된 모델이었다. 경계 프레임이 비주기라 무성으로 끊겨
    튐 구간이 별도 구간이 된다. 실제 추정기 옥타브 튐은 끊김 없는 유성 구간 안에서 생기므로 `smoothPitchContour`를 직접 시험하고,
    신호 수준 테스트는 "틀린 옥타브로 유성 프레임을 만들지 않는다"로 바꿨다. 같은 테스트의 옥타브 오류 판정식 오류(0.5–1반음 오차를 옥타브로 셈)도 구현 전에 고쳤다.
- 결과(합성 40사례, 프레임 단위, 최종 구현): 정답 유성 19,545프레임 중 유성 검출 1.000, 50센트 이내 1.000, 옥타브 오류 0,
  무음 3,170프레임 중 오검출 0. 조건별(clean/vibrato/scoop/noisy/detuned) 모두 1.000.
  **합성음이 단순해서 나온 수치이며 실제 허밍 품질의 근거가 아니다.**
- 결정 2 재검토(사용자 "진행해줘" = 권고안 1, FFT 최적화). 처음 제시한 "수 배" 기대는 프레임 크기(632표본)에서 FFT 단독 약 2배로 과장이었다.
  그래서 분석 표본화 하한 16→11kHz(계산량 약 1/4)를 함께 측정해 둘 다 적용했다. 정확도 하한·전체 테스트는 그대로 통과.
- 분석 시간(Node v22.22.3, Apple M2, 5회 중앙값, 8마디 4/4, 비브라토·잡음 포함, `npm run perf:pitch`):

  | 입력 | 처음(직접·16kHz) | 11kHz만 | 최종(FFT·11kHz) |
  |---|---:|---:|---:|
  | 44.1kHz 120 BPM 16초 | 352ms | 180ms | 110ms |
  | 44.1kHz 60 BPM 32초 | 708ms | 405ms | 188ms |
  | 44.1kHz 20 BPM 96초 | 2,098ms | 1,026ms | 602ms |
  | 48kHz 60 BPM 32초 | 464ms | 334ms | 186ms |
  | 48kHz 20 BPM 96초 | 1,238ms | 1,023ms | 633ms |

  최종은 오디오 1초당 약 6–7ms. PCM 메모리 96초 약 16–18MB. 브라우저·저사양 기기 수치가 아니다.
  메인 스레드 분석(결정 2)은 유지한다. 실기기에서 수용 불가하면 Worker를 별도 구조 승인으로 올린다.
- 검증(최종): typecheck PASS, lint PASS, `npm run test` 55파일/873 PASS(이전 54/861 + 12), architecture 71모듈/222의존성·경계 64파일 위반 0,
  build PASS, `git diff --check` 깨끗. UI 변경이 없어 E2E 미실행.
- 부담: 정확도 테스트가 전체 `npm run test`에 약 3초를 더한다(전체 약 8초).
- 커밋 범위에는 표본화율별(16/22.05/44.1/48kHz) 일치 테스트를 포함한다(다운샘플 배수 1·2·4 경로).
- NOT RUN: 실제 허밍·마이크·브라우저·저사양 기기 측정.
- 다음: P4-03 음 분할. 브라우저·실기기 분석 시간은 P4-05/P4-08에서 확인한다.

## 24. P4-03 — 음 분할 (완료, 2026-11-13)

- 사용자 지시: "P4-03 진행하고 마치면 커밋해줘". 기존 Domain에 음 분할 코드는 없었다(`segment` 검색 결과는 타이 분할 용어).
- 신규 `src/domain/transcription/segment.ts`, 공개 진입점 `@/domain/transcription`에 `segmentNotes` 추가.
  - `segmentNotes(frames, options?)` → `{ startSeconds, endSeconds, midi, pitchMidi, confidence, frameCount }[]`. 쉼표는 음 사이의 빈 구간이다.
  - 처리: (1) 연속 유성 프레임 구간 (2) 음량 dip(앞뒤 ±100ms의 작은 쪽 최고값의 50% 미만)으로 같은 음 반복 분리
    (3) 현재 묶음 평균에서 0.75반음 넘게 벗어나면 새 묶음(히스테리시스) (4) 150ms 이하로 다음 음 쪽으로 한 방향으로 움직이는 묶음은
    미끄러짐으로 보고 다음 음에, 구간 끝에서 앞 음에서 멀어지는 묶음은 앞 음에 합침 (5) 60ms 미만 묶음은 가까운 이웃에 합침,
    중앙값 차이 0.5반음 미만 이웃 병합 (6) 60ms 미만 음 제거. 경계: 첫 프레임 중심 − hop/2, 마지막 프레임 중심 + hop/2.
- 구현 기본값(Claude 판단, 변경 가능): 최소 음 60ms, dip 비율 0.5, 새 음 0.75반음, 같은 음 0.5반음, 미끄러짐 최대 150ms·최소 0.3반음.
- TDD 기록: 테스트를 먼저 실패(함수 없음)시켰고 fixture 하한은 구현 전에 정했다.
  - 처음 구현(반올림 음높이로 묶기)은 2개 실패: 끌어올림 앞부분이 별도 음으로 남음(precision 0.927 < 0.95),
    +30센트와 ±40센트 비브라토가 겹치면 반음 경계를 넘나들어 음 4개가 15개로 쪼개짐. 히스테리시스 묶기로 바꿨다.
  - 그래도 끊김 없이 이어지는 음에서 끌어올림(약 90ms)이 남아 반복음 멜로디의 개수가 어긋났다. 미끄러짐 규칙을 추가했고,
    이 규칙을 끄면 새 단위 테스트와 fixture 테스트가 실패하는 것을 확인했다. 기준은 바꾸지 않았다.
- 결과(합성 40사례): 기준 370음, 결과 370음, 일치 370(precision 1.000, recall 1.000, 같은 MIDI·시작 50ms 이내),
  시작 오차 중앙값 8ms·최대 18ms, 끝 오차 중앙값 7ms·최대 24ms, 개수 불일치 사례 0.
  **합성음이 단순해서 나온 수치이며 실제 허밍 품질의 근거가 아니다.** 실제 허밍의 레가토·약한 음량 변화·긴 끌어올림(150ms 초과)은 미검증.
- 검증: typecheck PASS, lint PASS, `npm run test` 56파일/884 PASS(이전 55/873 + 11), architecture 72모듈/224의존성·경계 65파일 위반 0,
  build PASS, `git diff --check` 깨끗. UI 변경이 없어 E2E 미실행.
- NOT RUN: 실제 허밍·마이크·브라우저.
- 다음: P4-04 격자 맞춤과 후보 변환(초 → tick, 표기 불가 길이 정책 결정 필요).

## 25. P4-04 — 격자 맞춤과 후보 변환 (완료, 2026-11-13)

- 사용자 지시: "계속 진행해줘"(P4-04). 백로그의 "표기 불가 길이 정책은 착수 시 결정"은 아래 Claude 판단으로 정했다(변경 가능).
- **표기 불가 길이 정책(Claude 판단)**: 시작·끝을 16분음표 격자(240 tick, 옵션)로 맞춘다. 모든 길이가 240의 배수라
  H-02 정확 분해로 항상 표기 가능하므로 거부 경로가 필요 없다. 맞춤은 저장된 Score가 아니라 연주 시각의 명시적 양자화이며,
  음마다 이동량(`onsetShiftSeconds`/`endShiftSeconds`)을 보고하고 사용자가 P4-07에서 검토한다. 셋잇단·스윙은 지원하지 않는다(tuplet 모델 없음).
- 재사용: 후보는 기존 `ClipboardPayload` 형식이다. 확정은 기존 `PasteEvents` Command 하나로 하며(결정 5) 빈 대상·덮어쓰기 없음·
  마디 경계를 넘는 음표의 분할·타이를 그대로 쓴다. `createRestEvent`, `measureTicks`, `createPitch`, 붙여넣기 검증을 재사용했다.
- 신규:
  - `src/domain/music-theory/spell.ts` `spellMidiInKey(midi, key)`: 조성 음계음은 조표 철자(F장조 B♭, G♭장조 C♭, F#장조 E#),
    그 밖은 샵·무조표 조에서 샵, 플랫 조에서 플랫. 기존 피아노 입력의 `midiToPitch`(샵 고정, features 층)는 Domain이 쓸 수 없어 새로 두었다.
  - `src/domain/transcription/quantize.ts`: `quantizeSegments(segments, { tempoBpm, timeSignature, downbeatSeconds, gridTicks })`
    → `{ notes, lengthTicks, dropped }`. 실제 끝이 첫 박 이전인 음은 `BEFORE_DOWNBEAT`로 버리고 걸친 음은 0에서 자른다.
    최소 1격자, 앞 음은 다음 음 시작에서 끊어 단선율 유지, 같은 격자 시작은 더 길게 연주된 쪽을 남기고 `COLLISION`.
    `transcriptionToClipboard(result, { key, timeSignature, nextId })`: 음표(provenance `transcription`·confidence)와 빈 곳 쉼표,
    쉼표는 마디 시작 기준으로 마디마다 나눈다. ID는 호출 측 주입(Domain은 무작위를 만들지 않음).
- TDD 기록: 테스트 먼저 실패(함수 없음). 구현 중 실패 1건: 첫 박 바로 위의 짧은 음이 반올림으로 끝 0 tick이 되어
  `BEFORE_DOWNBEAT`로 잘못 분류됐다. 판정을 반올림 결과가 아니라 실제 연주 시각으로 고쳤다. 기준은 바꾸지 않았다.
- 결과(합성 40사례 전체 흐름: PCM → 음높이 → 분할 → 격자 → 후보 → 빈 악보에 PasteEvents → validateScore):
  기준 370음, 결과 370음, TP 370, note F1 **1.000**(C-09 채점기, 시작 허용 오차 0 tick), 옥타브·음높이 오류 0, 길이 일치 370/370,
  붙여넣기·검증 실패 0. **합성음 수치이며 실제 허밍 품질(C-09 목표 F1 ≥ 0.90)의 근거가 아니다.**
- 하한(구현 전 고정): F1 ≥ 0.95, 옥타브 오류 0, 길이 일치 ≥ 0.9, 40사례 모두 붙여넣기·검증 성공.
- P4-07에 넘길 점: `lengthTicks`만큼 빈 마디가 있어야 한다(`PasteEvents`는 마디를 추가하지 않음). 쉼표는 마디 시작 기준으로 나뉘어 있으므로
  마디 중간 커서에 붙이면 쉼표가 마디를 넘어 거부될 수 있다. 마디 시작 이어쓰기 또는 커서 위치에 맞춘 재분할 중 결정이 필요하다.
  `NoteSegment` 이름이 `@/domain/score`의 타이 분할 타입과 겹친다(서로 다른 모듈이라 동작 문제는 없음).
- 검증: typecheck PASS, lint PASS, `npm run test` 57파일/897 PASS(이전 56/884 + 13), architecture 74모듈/234의존성·경계 67파일 위반 0,
  build PASS, `git diff --check` 깨끗. UI 변경이 없어 E2E 미실행.
- NOT RUN: 실제 허밍·마이크·브라우저.
- 다음: P4-05 마이크 캡처 adapter와 포트(선행 권고: Phase 3 수동 UAT-S/UAT-A).

## 26. P4-05 — 마이크 캡처 adapter와 포트 (완료, 2026-11-13)

- 사용자 결정: "UAT는 나중에 다른 것들 마치고 마지막에 할께. 다음 진행해줘". P4-05의 선행 권고(Phase 3 수동 UAT)를 건너뛰고,
  수동 UAT 전체를 최종 인수 단계로 미뤘다(마스터 플랜 위험 표·백로그에 기록).
- 기존 재사용: 포트는 기존 `application/ports.ts`(ScoreRepository와 같은 위치·양식), 분석은 P4-02~04 Domain 함수.
  ARCHITECTURE의 목표 위치 `adapters/web-audio/`를 처음 만들었다. 녹음 기능 폴더(`features/audio-recording/`)는 UI가 생기는 P4-06에서 만든다.
- 신규:
  - `AudioTranscriptionPort`·`AudioCaptureSession`·`AudioRecording`·`AudioCaptureError`(7개 코드) — `src/application/ports.ts`.
  - `src/application/transcription.ts`: `RECORDING_MAX_MEASURES`, `recordingLimitSeconds`, `transcribeRecording`(SILENT/NO_NOTES).
  - `src/adapters/web-audio/microphoneCapture.ts`: `createMicrophoneCapture(environment?)`. getUserMedia·AudioContext·AudioWorklet을 주입받는다.
- 구현 기본값(Claude 판단, 변경 가능): 녹음마다 AudioContext 생성·종료 시 close, 512프레임 chunk(정지 시 남은 약 11ms 버림),
  noiseSuppression·autoGainControl 끔, 에코 제거는 브라우저 기본, 무음 판정 최고 표본 0.01, 장치 끊김 시 녹음 버림.
- TDD 기록: 두 테스트 파일을 먼저 실패(모듈·export 없음)시킨 뒤 구현했다. 첫 구현에서 17개 모두 통과.
  humming-fixture 테스트의 지역 8마디 상수를 공개 상수 `RECORDING_MAX_MEASURES`로 바꿨다(기대값 동일).
- 테스트(가짜 장치): 녹음·정지·순서·자원 해제, 상한 자동 정지(정확한 표본 수), 레벨 보고, getUserMedia 오류 7종 매핑과 컨텍스트 미생성,
  getUserMedia 없음·Node 기본 환경 UNSUPPORTED, 권한 후 설정 실패 시 마이크 해제, 장치 끊김 DEVICE_LOST, abort·cancel·사전 abort,
  정지 후 입력 무시·반복 stop 같은 결과, fetch·localStorage·indexedDB 미호출, 잘못된 상한 거부, 처리기 mono 혼합·512프레임 chunk(가짜 전역에서 실제 실행).
  유스케이스: 8마디 초 계산(4/4·3/4·6/8, 20/60/120 BPM), 잘못된 값 거부, 합성 음계 → 철자된 후보, SILENT, NO_NOTES, 녹음 불변.
- 검증: typecheck PASS, lint PASS, `npm run test` 59파일/914 PASS(이전 57/897 + 17), architecture 77모듈/243의존성·경계 70파일 위반 0,
  build PASS, `git diff --check` 깨끗. UI 변경이 없어 E2E 미실행.
- 한계: 실제 브라우저에서 AudioWorklet 로드·권한 창·장치 끊김을 실행하지 않았다(Node 가짜 장치만). P4-06 E2E에서 Chromium 가짜 마이크로 처음 확인한다.
  iPhone Safari의 녹음·재생 동시 사용, 에코 제거가 허밍에 주는 영향은 실기기 UAT 대상이다.
- NOT RUN: 실제 마이크·브라우저·Safari·실기기.
- 다음: P4-06 녹음 UI(동의 문구, 시작/정지, 경과 시간, 입력 레벨, 템포·박자·메트로놈, 상태·오류 안내).

## 27. P4-06 — 녹음 UI (완료, 2026-11-13)

- 사용자 지시: "네"(P4-06 진행). ui-craft 탐색 결과 토큰 시스템·Tailwind 없이 인라인 스타일이며, 저장소 규칙상 화면 전면 개편 금지이므로
  기존 편집기 패널·버튼·오류 색 양식을 그대로 따랐다(스타일 질문 생략).
- **박 기준점(검토 지적 1번의 제품 쪽 해결)**: 카운트인·메트로놈 클릭을 기존 Tone 재생이 아니라 **녹음과 같은 AudioContext**에서 예약한다.
  두 컨텍스트의 시계가 달라 16분 격자(120 BPM 125ms)에서 어긋날 수 있기 때문이다. 처리기는 chunk마다 시작 프레임(`currentFrame`)을 보내고,
  adapter는 첫 chunk 뒤 200ms에 첫 클릭을 예약해 녹음 시간 기준 위치(`metronomeStartSeconds`, 브라우저가 알려 주는 output·base latency 포함)를 돌려준다.
  P4-05 포트에 덧붙인 변경(`CaptureMetronome`, `CaptureProgress`, `AudioRecording.metronomeStartSeconds`)이며 기존 필드는 그대로다.
  클릭은 짧은 OscillatorNode이며 새 재생 엔진·의존성이 아니다.
- 신규:
  - `application/transcription.ts`: `planRecording`(박 단위 = 박자 분모 음가, 기존 재생 메트로놈과 같은 규칙; 1마디 카운트인; 상한 8마디;
    캡처 길이 = 시작 여유 0.5초 + 카운트인 + 상한), `recordingDownbeatSeconds`(첫 클릭 + 카운트인).
  - `features/audio-recording/`(결정 8의 녹음 기능 폴더): `RecordingPanel`, 진행 계산 `recordingProgress`·`formatRecordingTime`.
  - 편집기 연결: 재생 제어 아래에 패널. 녹음 시작 시 기존 `playbackStopSignal`로 재생 정지.
- 패널 동작: 동의 체크 전 시작 불가 → 권한 요청 → 카운트인 "준비 n / N" → "녹음 중 · m마디 b박", 경과/상한 시간, 입력 레벨(`<meter>`), 정지·취소
  → 분석 중 → 결과("음표 N개를 찾았습니다" 또는 SILENT/NO_NOTES 안내) → 다시 녹음. 오류는 포트의 한국어 안내문. 취소는 오류가 아니라 처음 상태.
  녹음은 시작 시 악보 템포·박자로 고정한다. 녹음·후보는 컴포넌트 메모리에만 있고 Command·저장·업로드가 없다(E2E로 악보 불변 확인).
- 구현 기본값(Claude 판단, 변경 가능): 카운트인 1마디(항상 소리), "녹음 중 메트로놈" 기본 켬, 클릭 1200/800Hz 30ms, 화면 갱신 50ms 간격,
  동의는 세션 안 체크박스(저장하지 않음), 템포·박자는 기존 악보 설정에서 변경(패널에서 별도 선택 없음).
- 확정(악보에 넣기)은 P4-07이다. 지금은 결과 요약만 보이고 `onTranscribed`로 후보를 넘길 수 있다.
- TDD 기록: adapter·계획·진행 함수 테스트를 먼저 실패시킨 뒤 구현했다. 패널은 E2E로 검증했다(구현 후 작성).
  React 규칙(렌더 중 ref 읽기 금지) lint 오류를 고쳤다. 전체 E2E에서 기존 `settings.spec.ts`가 실패했다:
  패널 문구 "120 BPM · 4/4박자"가 기존 텍스트 찾기(`/120 BPM · 4\/4/`)와 겹쳤다. 기존 테스트는 그대로 두고 패널 문구를 "120 BPM, 4/4박자"로 바꿨다.
- 검증: typecheck PASS, lint PASS, `npm run test` 60파일/924 PASS(이전 59/914 + 10), architecture 80모듈/252의존성·경계 73파일 위반 0, build PASS,
  `git diff --check` 깨끗, **`npm run test:e2e` 74/74 PASS**(기존 71 + 녹음 3). Playwright Chromium에 가짜 마이크 플래그를 추가했다.
  처음으로 실제 브라우저에서 AudioWorklet 로드·가짜 입력 레벨·8마디 자동 정지·페이지 내 분석이 끝까지 실행됐다.
- 한계: 가짜 장치의 입력은 허밍이 아니다(결과 내용은 검사하지 않고 상태만 검사). 실제 마이크·허밍·카운트인 박 정렬·출력/입력 지연·
  Safari·iPhone(녹음과 클릭 동시 사용)·에코 제거 영향은 최종 수동 UAT 대상이다.
- 다음: P4-07 후보 검토와 원자 확정(빈 마디 확보, 붙여넣는 위치 정책 결정 필요).

## 28. P4-07 — 후보 검토와 원자 확정 (완료, 2026-11-13)

- 사용자 승인("진행해줘"): (1) 빈 마디가 모자라면 확정과 같은 Command로 추가 — `PasteEvents`의 하위 호환 선택 필드 `newMeasureIds`,
  (2) 넣을 위치는 악보 끝 이어쓰기와 커서가 있는 마디 시작. 마디 중간 위치는 지원하지 않는다(쉼표가 마디를 넘지 않도록).
- 재사용: 기존 `PasteEvents`(빈 대상·덮어쓰기 없음·마디 넘는 음표 분할·타이), 편집기의 `clipboardCommand` 단일 dispatch와 자동 저장,
  조옮김과 같은 읽기 전용 후보 `StaffView` 미리보기 방식, 기존 Undo/Redo 스냅샷.
- 변경: `domain/commands/types.ts`·`apply.ts`(pasteEvents에 새 마디 덧붙이기), `application/transcription.ts`(`planTranscriptionCommit`),
  `RecordingPanel`(검토·확정 UI), 편집기 연결(`cursorTick`, `labelMode`, `onCommand`).
- 구현 기본값(Claude 판단): 낮은 신뢰도 기준 0.8, 기본 위치 "악보 끝에 이어쓰기", 확정 후 처음 상태 + 안내문.
- TDD 기록: Domain(5)·application(4) 테스트를 먼저 실패시킨 뒤 구현했다. 패널은 E2E(구현 후 작성).
- E2E(새 1개): 페이지 안 440Hz 일정음을 마이크로 넣어 결정적 결과를 만든다. 후보 A4, 낮은 신뢰도 없음, "2마디부터" 미리보기, 확정 전 저장 불변,
  커서 없이 커서 위치 선택 시 안내·확정 불가, 확정 후 마디 증가·모든 채보 음 MIDI 69·provenance transcription·2마디 시작 tick 3840, Undo 1회로 이전 저장본과 동일.
- 검증: typecheck PASS, lint PASS, `npm run test` 62파일/933 PASS(이전 60/924 + 9), architecture 80모듈/256의존성·경계 73파일 위반 0, build PASS,
  `git diff --check` 깨끗, **`npm run test:e2e` 75/75 PASS**(기존 74 + 1).
- 한계: 일정음·가짜 장치는 허밍이 아니다. 실제 허밍 결과의 검토 부담(손으로 고칠 양)은 최종 UAT에서 기록한다.
- 다음: P4-08 통합 인수(녹음→확정→편집→저장→재열기 흐름 정리, 품질 수치, 수동 UAT 절차).

## 29. P4-08 — Phase 4 통합 인수 (자동 인수 완료, 수동 UAT-H NOT RUN, 2026-11-13)

- 사용자 지시: "진행해줘"(P4-08). 수동 UAT는 사용자 결정대로 마지막 단계로 미루고, 이번에는 자동 인수와 UAT 절차서를 만들었다.
- 신규 E2E `tests/e2e/phase4-integration.spec.ts`(Phase 3 통합 테스트와 같은 형식): 페이지 안에서 A4 2.5초 후 C5로 바뀌는 음을 마이크로 넣는다.
  후보가 A4 → C5 순서·확정 전 저장 불변 → 커서(3마디 2박)에 두고 "커서가 있는 마디부터" → 3마디 1박(tick 7680)부터 A4, C5 포함,
  기존 1마디 음 불변 → 피아노로 E4 이어쓰기(provenance piano) → 재생·정지 → Undo 2회로 원본, Redo 2회로 편집본 →
  새로고침 시 후보·녹음 상태 없음·저장 행 불변 → 악보함 경유 재열기 동일 → IndexedDB DB 이름·버전 불변(DB2, 녹음 저장소 없음) →
  JSON 백업이 저장본과 같고 녹음·프레임·후보 필드 없음.
- 작성 중 고친 것(새 테스트 자체의 문제): (1) 커서 입력칸은 "입력 위치"를 cursor로 바꿔야 나타난다(Phase 3 통합 테스트와 같게 수정).
  (2) Undo를 새로고침 뒤에 시험했는데, Undo 이력은 원래 메모리 전용이라 새로고침하면 사라진다(기존 정책). Undo/Redo 확인을 새로고침 전으로 옮겼다.
- 안정성: 녹음 E2E 5개(`recording` 4 + `phase4-integration` 1)를 `--repeat-each=3`으로 15/15 PASS.
- 문서: 마스터 플랜 상태와 §8 인수 결과 요약(합성 수치·브라우저 흐름·PRD MVP-003 수용 기준 판정·남은 결정·알려진 한계),
  MANUAL_UAT_CHECKLIST에 실행 기록 4줄과 §5A UAT-H(H-01~H-13: 권한·카운트인·상한·실제 허밍 F1·박 정렬·스피커 에코·확정/Undo·
  커서 위치·저장·끊김·네트워크 0건·iPhone)를 추가했다. 백로그 P4-08 상태 갱신.
- 판정: Phase 4는 **자동 인수 완료**. PRD MVP-002/003 수용 기준은 합성 신호·Chromium 가짜 장치로만 확인했고 실제 허밍은 NOT RUN이다.
  공개 시험 주소는 Phase 4 이전 코드(`9a8b3dc`)라 UAT-H 전에 재배포가 필요하다(배포는 사용자 승인 대상).
- 검증: typecheck PASS, lint PASS, `npm run test` 62파일/933 PASS, architecture 80모듈/256의존성·경계 73파일 위반 0, build PASS,
  `git diff --check` 깨끗, **`npm run test:e2e` 76/76 PASS**(기존 75 + 1).
- NOT RUN: UAT-H 전체(실제 허밍·마이크·Safari·iPhone·Android), Phase 3 UAT.
- 다음: Phase 5(PDF/MIDI/MusicXML 출력)는 별도 승인 범위(마스터 플랜 §7). 착수 전 출력 형식별 지원 범위 결정이 필요하다.

## 30. Phase 5 계획 — D-03 제안 (문서만, 2026-11-13)

- 사용자 지시: "진행해줘"(Phase 5 계획 문서 작성). 제품 코드·테스트·의존성 변경 없음.
- 문서: [PHASE5_MASTER_PLAN](PHASE5_MASTER_PLAN.md)(범위·유지 계약·형식별 설계·결정 8개·위험), [PHASE5_BACKLOG](PHASE5_BACKLOG.md)(D-03, P5-01~08).
- 근거 확인: PRD MVP-014·Phase 5 완료 기준, ARCHITECTURE §4·§11(출력은 독립 adapter), ADR-004(출력 템포는 원래 템포),
  H-02 정확 분해, 기존 JSON 백업 파일 이름 규칙·다운로드 adapter. 이 Mac의 도구: `xmllint`, `pdfinfo`, `pdftotext` 있음, MuseScore·GarageBand 없음.
- 권고안 요약: PDF는 인쇄 전용 화면 + 브라우저 "PDF로 저장"(의존성 없음), A4 세로, MIDI·MusicXML은 모든 Part·PDF는 첫 Part,
  MIDI type 1·960·원래 템포·전체 길이·타이 합침, MusicXML 4.0·빈 구간은 `<forward>`, 라벨은 PDF만, XSD+xmllint·독립 MIDI 파서·pdftotext 검사,
  파일 이름은 JSON 백업 규칙 공유.
- **상태: 제안.** 사용자가 D-03을 승인하기 전에는 구현하지 않는다.
- 검증: 문서만 변경해 테스트는 재실행하지 않았다. `git diff --check` 확인.

## 31. Phase 5 출력 구현 — D-03 승인, P5-01~08 (2026-11-13)

- 사용자 지시: "그대로 진행해줘"(D-03 권고안 그대로 승인), 이어서 "계속해줘". 새 런타임 의존성 없음. Score 스키마·DB2·저장 계약 변경 없음.
- 구현: 출력 계약(`ExportPort`·`exportScore`·`exportFileName`), MIDI writer, MusicXML writer, 인쇄 화면 `/print/[scoreId]`(줄 단위 SVG·A4·페이지 번호),
  편집기 "내보내기"(PDF는 저장 후 새 탭, MIDI·MusicXML 다운로드). 세부와 구현 기본값: [PHASE5_MASTER_PLAN](PHASE5_MASTER_PLAN.md) §8, [MODULE_CONTRACTS](MODULE_CONTRACTS.md) "Phase 5 — 출력".
- 테스트 자산: 테스트용 독립 SMF 파서, MusicXML 4.0 공식 XSD 무수정 사본+오프라인 카탈로그(`tests/fixtures/musicxml-4.0/`, W3C FSA 고지 유지), `/usr/bin/xmllint` 연결.
- 테스트 작성 중 바로잡은 것(제품 코드 아님): SMF 파서의 청크 끝 계산 순서 버그, 템포 기대값 계산 실수(666 667 µs), pdftotext 공백 처리, 통합 E2E 기대값(F→D장조는 G, 음이름 라벨은 옥타브 포함).
- 검증(최종): typecheck·lint PASS, `npm run test` 66파일/980 PASS, architecture 91 modules/295 deps·boundaries 84파일 위반 0, build PASS,
  **`npm run test:e2e` 81/81 PASS**, 출력 E2E `--repeat-each=3` 12/12, 통합 E2E `--repeat-each=3` 3/3. 64마디 PDF 3쪽 이미지 육안 확인(Chromium).
- **NOT RUN**: 수동 UAT-X(외부 악보 프로그램에서 MIDI/MusicXML 열기, 실제 프린터, Mac Safari·iPhone 인쇄, Safari 페이지 번호). 이 Mac에는 MuseScore·GarageBand 없음.
- 공개 시험 주소는 여전히 Phase 4 이전 코드다. 재배포는 사용자 승인 대상. 커밋하지 않았다.

## 32. Phase 6 계획 — D-04 제안 (문서만, 2026-11-14)

- 사용자 지시: "Phase 6 계획 진행해줘". 제품 코드·테스트·의존성 변경 없음.
- 문서: [PHASE6_MASTER_PLAN](PHASE6_MASTER_PLAN.md)(PRD 대비 차이표, 범위, 결정 12개, 위험), [PHASE6_BACKLOG](PHASE6_BACKLOG.md)(D-04, P6-01~12).
- PRD 대비 확인한 빠진 항목: 홈 시작 흐름, 모바일 탭 배치, 커서부터 재생(MVP-012), 선택 구간 삭제(MVP-006),
  녹음 중 실시간 음높이(MVP-002), 실제 허밍 F1 기준(MVP-003), 전역 오류 화면·IndexedDB 불가 안내, 개인정보·약관·라이선스,
  보안 헤더, 전체 수동 UAT, 공개 배포 갱신. `/record` 별도 화면은 편집기 패널로 구현되어 있어 PRD 수정 여부를 결정 2로 둠.
- **상태: 제안.** 사용자가 D-04를 승인하기 전에는 구현하지 않는다.
- 검증: 문서만 변경해 테스트는 재실행하지 않았다. `git diff --check` 확인.

## 33. Phase 6 D-04 승인·P6-01 PRD 빠진 기능 (2026-11-14)

- 사용자 지시: "권고안대로 진행해줘" → D-04 결정 1~12 권고안 그대로 승인(PHASE6_MASTER_PLAN 상태 갱신).
- P6-01 구현: 커서부터 재생(MVP-012), 선택 구간 삭제(MVP-006), 녹음 중 실시간 추정 음높이(MVP-002). 계약은 MODULE_CONTRACTS "Phase 6 P6-01".
  포트 확장은 선택적 메서드 `AudioCaptureSession.recent?` 하나(기존 호출부 호환). 새 의존성·Score·DB 변경 없음.
- 검증: TEST_PLAN "Phase 6 P6-01". 단위 68파일/993, E2E 84/84 PASS. 커밋하지 않음.

## 34. P6-02 홈·시작 흐름 (2026-11-14)

- 홈 `/`를 클라이언트 화면으로 교체: 소개, "허밍으로 시작"·"피아노로 시작"(새 악보 생성 후 `/editor/<id>?start=hum|piano`), 최근 악보 3개, 로컬 저장 안내.
  고정 `demo-score` 링크와 "Phase 1" 문구 제거. 편집기는 `start`에 따라 녹음 패널(동의 체크 포커스) 또는 건반으로 화면을 옮긴다. 녹음은 자동으로 시작하지 않는다.
- PRD §4 수정(D-04 결정 2 승인): 녹음 화면은 편집기 패널, 별도 `/record` 없음.
- 검증: 홈 E2E 4/4 PASS, typecheck·lint PASS. 전체 회귀는 다음 묶음에서 함께 실행. 커밋하지 않음.

## 35. P6-03 모바일 편집기 탭 (2026-11-14)

- 현재 화면 점검: 휴대폰에서 페이지 2,763px, 악보는 약 1,800px 아래, 건반은 맨 아래라 입력하며 악보를 볼 수 없었다.
- 구현: 768px 이하에서 머리글 → Undo/Redo → 악보 → 탭(입력 / 재생·연습 / 편집 / 파일) → 활성 탭 내용. 입력 탭 기준 페이지 1,367px.
  컴포넌트는 숨기기만 하고 언마운트하지 않는다. 데스크톱은 변화 없음.
- 기존 모바일 E2E 6개에 탭 누르기 단계 추가(기대값 변경 없음). 새 모바일 여정 E2E.
- 검증: E2E 90/90, 단위 993 PASS. 알려진 제한: 휴대폰 악보 가로 스크롤(TEST_PLAN P6-03). 커밋하지 않음.

## 36. P6-04 접근성 (2026-11-14)

- 승인(D-04 결정 5)에 따라 `@axe-core/playwright@^4.14.0`을 devDependencies에 추가(앱 번들 미포함). 4.14.0 배포일 2026-10-15.
- 수정: 피아노 건반 크기(검은 건반 24px), 악보 영역 `role="region"`·`aria-label="악보"`·`tabIndex=0`.
- 새 검사: axe 7개 화면 상태 위반 0건, Tab만으로 하는 주요 흐름 E2E. 키보드·대체 경로 문서와 UAT-K 추가.
- 검증: 단위 993, E2E 94/94 PASS. UAT-K NOT RUN. 커밋하지 않음.

## 37. P6-05 오류·복구 (2026-11-14)

- 사용자 지시: "커밋하고 P6-05부터 계속 진행해줘" → P6-01~04 커밋(`5f5af28`, `2d92eac`, `0f78147`, `000a485`) 후 진행.
- 구현: 저장소 불가 시 메모리 편집 모드, 전역 오류·404 화면(편집 중 악보 JSON 백업), 저장 공간 보호 요청 버튼, 홈 대체 경로·권장 환경 안내.
- 검증: 단위 996, E2E 99/99 PASS. 커밋하지 않음.

## 38. P6-07 보안 헤더 (2026-11-14)

- 외부 요청 측정(0건) 후 외부 출처 없는 CSP와 보안 헤더를 `next.config.ts`에 추가. 위반 0건 E2E와 헤더 E2E. E2E 101/101 PASS. 커밋하지 않음.
- P6-06(개인정보·약관)은 운영자 이름·연락처·시행일을 사용자에게 받아야 해 라이선스 화면부터 진행한다.

## 39. P6-06(일부) 오픈소스 라이선스 화면 (2026-11-14)

- `/licenses` 화면, 홈 바닥글 링크, 버전 일치 가드 테스트. 개인정보처리방침·이용약관은 운영자 이름·연락처·시행일을 받은 뒤 작성한다.
- 검증: 단위 998, E2E 101/101 PASS. 커밋하지 않음.

## 40. P6-08 실제 허밍 평가 도구 (2026-11-14)

- `npm run eval:humming -- [--init] <폴더>`: 저장소 밖 폴더의 `<테이크>.wav` + `<테이크>.json`을 편집기와 같은 `transcribeRecording`으로 분석하고 C-09 채점기(허용 오차 0 tick)로 채점, 같은 폴더에 Markdown 보고서. 판정 PASS/FAIL/INSUFFICIENT(≥20테이크·F1 ≥ 0.90). `--init`은 5개 선율 × 4회 정답 템플릿 20개.
- 파일: `tests/eval/humming-eval.ts`, `tests/eval/humming.eval.ts`, `vitest.eval.config.ts`, `scripts/eval-humming.mjs`, 절차서 `docs/HUMMING_EVAL.md`. 제품 코드·Domain 변경 없음, 새 의존성 없음.
- `downbeatSeconds`가 없으면 첫 검출 음을 첫 정답 음에 맞춘다(한계는 절차서 §5). tick 0이 파일 시작 전이면 앞에 무음을 덧대 양자화 계약(downbeat ≥ 0)을 지킨다.
- 검증: 단위 71파일/1019 PASS(새 21), typecheck·lint·architecture·build PASS. 합성 WAV 22개로 CLI 끝까지 실행(F1 1.000, 판정 PASS), 저장소 안 폴더 거부 확인. UI 변경이 없어 E2E는 재실행하지 않았다(직전 101/101).
- 실제 허밍 평가: **NOT RUN** — 사용자 녹음 20테이크 필요. 커밋하지 않음.

## 41. P6-05~08 커밋, P6-09(일부) 제품 이름 "허밍버드" (2026-11-14)

- 사용자 지시 "커밋해줘" → `47d7510` 라이선스, `556fd0a` 오류·복구, `644133d` 보안 헤더, `22f1530` 허밍 평가 도구, `b80ccd2` 문서. push 안 함.
- 사용자 지시 "일단 허밍버드로 해줘"(결정 12, 출시 전 임시 확정): `src/app/brand.ts` 한 곳에 이름·소개 문구. 루트 메타데이터(제목 템플릿 `%s · 허밍버드`, 설명, applicationName, Open Graph 텍스트), 파비콘 `src/app/icon.svg`(8분음표 마크), 홈 상단 표기, 악보함·편집기 탭 제목, MusicXML `<software>`.
- 남은 것: OG 이미지(한글 글꼴 포함 필요)·apple-touch-icon PNG 없음 — P2. 개인정보·약관(운영자 정보)은 사용자가 마지막에 제공. push·배포는 별도 승인 대기.
- 검증: 단위 71파일/1020 PASS, E2E 101/101 PASS(홈 제목·파비콘·og:site_name·라이선스 탭 제목 확인 추가), typecheck·lint·architecture·build PASS. 프로덕션 빌드 홈 화면 확인. 커밋하지 않음.

## 42. P6-09 배포·공개 주소 E2E, 휴대폰 건반 위치 수정 (2026-11-14)

- 사용자 승인 "둘 다 진행해줘": `0a2fcfd` 커밋, GitHub main push(22커밋). Vercel 프로젝트 `00_music_code`는 이미 `kmarx7/music_code`와 연동되어 있어 push로 운영 배포가 자동 생성됐다(Ready, `https://00musiccode.vercel.app`). 공개 주소에서 제목·CSP(개발용 예외 없음)·Permissions-Policy·X-Frame-Options·`/icon.svg` 확인. Vercel MCP는 다른 계정으로 연결되어 프로젝트를 찾지 못해(404) CLI를 사용했다.
- 공개 주소 E2E(임시 설정은 실행 후 삭제): `0a2fcfd`에서 Chromium 101/101, WebKit은 환경 제약 실패와 휴대폰 건반 결함 1건. 수정 배포 `40c2db3` 재실행 Chromium 102/102 PASS, WebKit Desktop 93/102(실패 9건 모두 PDF·가짜 마이크 환경 제약). 상세는 TEST_PLAN "P6-09 공개 주소 E2E".
- 실제 결함 1건 수정: 화면 건반(88건반, 약 1.8k px)이 맨 왼쪽(A0)부터 보여 폭 800px 미만에서 가온 도가 화면 밖이었다. `PianoKeyboard`가 처음 폭이 생길 때 한 번 C4를 가운데로 스크롤(이후 스크롤은 사용자 몫). E2E 추가(휴대폰 폭에서 C4 보임·A0 안 보임, 탭 전환 후 유지). RED 확인 후 수정.
- 테스트 보정: 다운로드 파일 이름 비교를 `normalize("NFC")`로 통일(WebKit/macOS가 한글 파일 이름을 NFD로 돌려줌, 기존 `editor.spec.ts` 관례와 동일). 기대 문자열은 그대로.
- iPhone 홈 화면 아이콘 `src/app/apple-icon.png`(180×180) 추가, 홈 E2E 확인. MANUAL_UAT_CHECKLIST에 UAT-B(베타 신기능 13항목)·P6-10 권장 실행 순서 추가.
- 로컬 검증: 단위 1020, E2E 102/102 PASS, typecheck·lint·architecture·build PASS.

## 43. Phase 7 계획 제안 (문서만, 2026-11-14)

- 사용자 요청: 화면 흐름 개편(단계형 시작)과 국악기 오선보(향피리·25현 가야금 우선) 계획 문서. 조사 결과는 대화 기록.
- 산출: [PHASE7_MASTER_PLAN](PHASE7_MASTER_PLAN.md)(결정 D-05 1~10), [PHASE7_BACKLOG](PHASE7_BACKLOG.md)(트랙 A 6작업, 트랙 B 6작업, UAT-G).
- 상태: **D-05 승인(2026-11-14, 권고안 그대로).** 구현은 §44.

## 44. Phase 7 트랙 A: A-1~A-4, A-6 (2026-11-14, 커밋 전)

- A-1 화면 설계: ui-craft shape 시안 → 사용자 "권장안대로" 승인(백로그 A-1 확정 5항목).
- A-2 `/new`: 제목·박자·템포·조성·목표 악기(피아노만 선택 가능) → "만들기" 1회 = 악보 1개 → `/editor/<id>?start=piano`(입력 모드). `createNewScore`가 설정값을 받고 저장 전에 검증.
- A-3 편집기 4모드: 입력/다듬기/연습/내보내기, 데스크톱·휴대폰 공통(휴대폰은 아래 고정). 악보·라벨·요약은 항상 위, 상단 "이름 바꾸기"·Undo/Redo·저장. 모드는 저장하지 않음, 패널은 숨김만(상태 보존). WAI-ARIA 탭(화살표·Home·End). 미리보기·재생·내보내기 도구는 이전처럼 `editor-content` 밖.
- A-4 `/record`: `HummingFlow` 4단계, ④ "악보 만들기"에서 `createTranscribedScore`로 처음 저장. 홈 "허밍으로 시작" → `/record`.
- 공통: `--hb-*` 색·모서리 변수, `features/score-setup`(`parseScoreSetup`, `ScoreSetupFields`).
- 구현 기본값: 입력 레벨은 ③에서 표시(마이크는 녹음 시작 때 한 번만 연다). `/new`에서 저장소를 못 쓸 때의 "저장 없이 편집기 열기"는 기본 설정의 메모리 악보로 열린다(선택한 설정은 넘기지 않음).
- A-6: 기존 E2E 26개 파일에 모드 전환 단계(`openMode`)·`renameScore`만 추가, 기대값 유지. 바뀐 계약 3개는 새 테스트로 대체(데스크톱 "탭 없음" → 4모드·키보드·무저장, 홈 "허밍으로 시작" → `/record` 3개, 모바일 탭 이름). 새 E2E: `record-flow.spec.ts` 3, home `/new` 2·옛 `?start=hum` 1, a11y `/new`·`/record`·편집기 4모드.
- 검증: unit 73파일/1033 PASS, typecheck·lint PASS, architecture 위반 0, build PASS, **E2E 107/107 PASS**(최종 코드). axe 0건(`/new`, `/record` ①②, 편집기 4모드 데스크톱·휴대폰).
- 미검증: 실제 마이크·실제 청취, Safari·휴대폰 실기기. 남은 일: A-5(→ §45 완료), 휴대폰 다듬기 모드가 긴 문제(P2).

## 45. Phase 7 A-5 "허밍 추가" 단계 흐름 (2026-11-14, 커밋 전)

- 사용자 지시 "A-5 진행해줘". 편집기 입력 모드의 녹음 패널을 `/record`와 같은 4단계로 바꿨다. ① 설정은 악보 값으로 고정(완료 표시), ②부터 시작. ④에서 악보 끝/커서 마디를 고르고 "악보에 넣기" = PasteEvents 1회(Undo 1회) 그대로.
- 리팩터: `features/audio-recording/take.tsx`(`useHummingTake`, `TakeStepList`, `MicrophoneFields`, `TakeProgressView`, `CandidateChips`, `LOW_CONFIDENCE`)를 `HummingFlow`와 `RecordingPanel`이 같이 쓴다. 녹음·PCM은 계속 메모리에만 있다.
- 옛 `?start=hum`: 편집기가 주소를 `useSyncExternalStore`로 읽어 "허밍 추가"를 ②로 열고 동의 체크에 포커스(녹음은 시작하지 않음).
- 바뀐 동작(테스트 기대값 변경 3곳, 의도된 계약 변경): 녹음 중 "취소" → 이전의 "처음 상태(idle)" 대신 ② 마이크(동의 유지, 안내 없음). "닫기"를 누르면 처음 상태. `?start=hum`은 ②가 열린 상태(`data-state="mic"`).
- E2E: 녹음을 쓰는 5개 파일에 "허밍 추가" 열기 단계(`openHummingAdd`)만 추가. 새 테스트 1개(단계 목록·① 고정·포커스·닫기 무저장).
- 검증: unit 73파일/1033 PASS, typecheck·lint PASS, architecture 위반 0, build PASS, **E2E 108/108 PASS**. 화면 확인(데스크톱·390px, 접힘·② 단계).
- 미검증: 실제 마이크·실제 청취, Safari·휴대폰 실기기.

## 46. Phase 7 B-2 악기 정보·schemaVersion 3 — 구조 (2026-11-14, 커밋 전)

- 사용자 지시 "커밋하고 진행해줘": A-5를 로컬 커밋(`626149b`, push 안 함) 후 승인된 순서(D-05 결정 1: A 다음 B)대로 B-2를 진행. B-1(전문가 확인)이 아직이라 **구조만** 구현하고 국악기 값은 넣지 않았다(결정 5).
- Domain: `Part.instrument?`(piano/hyang-piri/gayageum-25), `SCORE_SCHEMA_VERSION` 2 → **3**, v1/v2 읽기 이동(`"piano"`), 검증 `INVALID_INSTRUMENT`, 악기 프로필(`instruments.ts`, 피아노만 확정 값). Command `SetInstrument`·`SetClef`(각 Undo 1회).
- 악보함 가져오기 안내 "v1 악보를 v2로 변환하여" → "이전 형식 악보를 현재 형식으로 변환하여".
- 승인된 계약 변경에 따른 테스트 기대값 변경: 저장·백업의 `schemaVersion` 2 → 3(단위·통합 9곳, E2E 8곳). 바꾸지 않은 기대값: 음표·붙임줄·원본 보존·쓰기 0회. 열기 보존 테스트에 실제 v2 저장본(악기 없음) 경우를 추가하고 v3 경우를 새로 둠.
- 새 테스트: `tests/unit/instrument.test.ts` 9, score-backup +1(악기·음자리표 Command·Undo·JSON 왕복), score-open-preservation 통합 +1(v2 원본 보존·피아노), E2E 열기 보존 v3 +1.
- 검증: unit 74파일/1044 PASS, typecheck·lint PASS, architecture 위반 0(순환 1건 발견 후 `InstrumentId`를 constants로 옮겨 해소), build PASS, **E2E 109/109 PASS**.
- 사용자 지시로 CLAUDE.md의 schemaVersion 문구를 3으로 고쳤다(CLAUDE_HANDOFF DB 설명도 함께).
- 남은 것: B-1 값 확인 → 프로필 채우기, B-3(악기에 맞추기 화면).

## 47. 공개 주소 E2E 재실행 — 배포 `739f81c` (2026-11-14)

- 사용자 요청 "공개 주소 E2E 다시 돌려줘". `https://00musiccode.vercel.app`(A-5·B-2 포함 `739f81c`)에서 전체 E2E 109개 × Chromium·WebKit Desktop Safari(임시 설정은 실행 후 삭제, 12.5분).
- **Chromium 109/109 PASS.** WebKit 97/109, 실패 12건은 모두 환경 제약 또는 WebKit 기본 동작으로 분류했다(TEST_PLAN "공개 주소 E2E — 739f81c"). 코드 변경 없음. 실제 Safari·실기기 PASS가 아니다.

## 48. Phase 7 B-1 확인 요청서 (2026-11-14, 커밋 전)

- 트랙 A 완료, 트랙 B는 B-1 기준값이 있어야 진행된다. 전문가에게 건넬 `docs/INSTRUMENTS.md`를 작성했다: 향피리 6문항(최저음·실용 상한·확장 상한·실음/이조·음자리표·율명 환산 기준), 25현 6문항(표준 조율 줄별 음높이·조율 목록·누름 폭·기보 관행·줄 번호·실음 여부), 확인 기록 표.
- 조사값은 "미확인"으로만 적고 코드·프로필에는 넣지 않았다(결정 5). 코드 변경 없음.

## 49. 휴대폰 다듬기 모드 정리 — 시안 B (2026-11-15, 커밋 전)

- 사용자 "휴대폰 다듬기 모드 시안 만들어줘" → 시안 3개(claude.ai 디자인 캔버스) → "권장안대로 진행해줘": B(고른 음 편집 하단 고정 + 도구 접기), 휴대폰(≤768px)만, 음표 목록은 접힌 줄로. 빈 둘째 보표 줄 축소는 포함하지 않았다(별도 결정).
- 새 `features/score-editor/RefineSection.tsx`: 휴대폰에서는 제목·요약이 있는 닫힌 줄(열고 닫기, UI 상태만), 넓은 화면에서는 줄을 숨기고 내용을 늘 보여 준다. 음표 목록·구간 편집·악보 설정에 적용. 조옮김은 이미 버튼 하나로 접혀 있어 그대로 두었다.
- 고른 음표·쉼표 편집은 휴대폰에서 모드 막대 바로 위에 고정(`.refine-selection`, 최대 화면 절반, 넘치면 안에서 스크롤)되고 ‹ › 이전·다음, 순번, 닫기가 붙는다(휴대폰 전용). 데스크톱 화면은 바뀌지 않는다.
- 실측(390×844, 음표 12개): 다듬기 모드 전체 높이 1,746px → 928px(도구를 모두 닫았을 때). 남은 초과분은 비어 있는 둘째 보표 줄이다.
- E2E: 새 테스트 1(휴대폰: 닫힌 줄·요약·열고 닫기, 고정 위치가 모드 막대 바로 위이고 악보가 그 위에 보임, 이전·다음·반음 편집·닫기, Undo 복원), 데스크톱 4모드 테스트에 "줄 숨김·도구 표시" 확인 추가. 휴대폰 터치 테스트 6개(A–B, 연습 속도, 복사·붙여넣기, 잘라내기, 구간 선택, 편집 커서)는 해당 줄을 여는 단계 `openRefineSection`만 넣었고 기대값은 그대로다. `settings.spec`은 악보 요약과 줄 요약 문구가 같아 strict 위반이 나서 줄 요약을 "템포 120 · 4/4박자"로 바꿨다(제품 문구 변경, 테스트 기대값 불변).
- 검증: typecheck, lint, unit 74 files/1044, architecture 위반 0, build, E2E 110/110. 휴대폰 화면은 Chromium 에뮬레이션 스크린샷으로만 확인했다. 실제 휴대폰·Safari 미검증.

## 50. 휴대폰 다듬기 모드 — 빈 보표 줄 숨기기 (2026-11-15)

- 사용자 "보표 줄 정리 진행해줘". 휴대폰(≤768px) 다듬기 모드에서만, 마지막 음표·쉼표가 있는 줄과 편집 커서가 있는 줄보다 뒤의 빈 줄(4마디 단위)을 그리지 않는다. 표시 전용이며 저장된 Score의 마디 수는 그대로다. 입력·연습·내보내기 모드와 데스크톱은 전부 그린다.
- `compactStaffScore(score, cursorTick)`(`@/features/score-editor`), 렌더러 `STAFF_ROW_LAYOUT.measuresPerRow` 공개. 편집기는 `matchMedia`로 휴대폰 여부를 읽는다(서버·첫 그림은 넓은 화면 기준).
- 테스트: 단위 4(첫 줄만 남김·원본 불변, 마지막 음·커서 줄 유지, 빈 악보 1줄·변화 없으면 같은 객체, 쉼표도 내용), E2E 휴대폰 다듬기 테스트에 줄 수 2→1→(입력 모드)2→1과 저장 마디 8개 확인 추가.
- 검증: typecheck, lint, unit 75 files/1048, architecture 위반 0, build, E2E 110/110. 실제 휴대폰·Safari 미검증.

## 51. UAT 결함 — 악보가 가득 차면 끝 입력이 막힘 (2026-11-15, P6-11)

- 사용자 UAT 보고: "악보가 가득 찼을 때 마디 추가하는 버튼이 없다". 확인 결과 입력 모드 첫 줄에 "마디 추가"가 있지만 휴대폰에서는 건반 쪽으로 화면이 내려가 거의 보이지 않고 안내 문구도 화면 밖으로 밀려났다.
- 사용자 승인 "권장안대로 A로 진행해줘": 악보 끝에 넣는 음표·쉼표가 마지막 마디를 넘으면(가득 참 포함) 필요한 수의 빈 마디를 붙이고 같은 명령 하나(`PasteEvents` + `newMeasureIds`, 기존 계약)로 넣는다. Undo·Redo 한 번에 마디와 음이 함께 움직인다. 마디 끝을 넘는 음은 기존 규칙대로 새 마디로 이어 붙임줄로 잇는다.
- 범위: `planAppendNote`·`planAppendRest`에 선택 인자 `nextMeasureId`. 편집기 끝 입력만 넘긴다. 커서 위치 입력·붙여넣기·인자 없는 호출은 이전처럼 거부한다(기존 단위 테스트 "가득 찬 악보 거부"·E2E 커서 "마디를 추가" 그대로 통과). 새 Command·저장 형식 변경 없음.
- 테스트: 단위 5(마디 1개 추가와 위치·출처, 마디선 넘는 음 붙임줄, 긴 음은 필요한 만큼만, 쉼표, 기존 동작 유지), E2E 1(8마디를 채운 뒤 음·쉼표 입력 → 9·10마디, 안내 없음, Undo 두 번·Redo 한 번).

## 52. Phase 7 B-1 — 25현 기준값 반영, 향피리 보류 (2026-11-15, 커밋 전)

- 공유 페이지로 받은 전문가 답변(1·2차)을 `docs/INSTRUMENTS.md`에 기록. 확인자 실명은 공개 저장소라 넣지 않았다.
- `instruments.ts` 25현 가야금: `verified: true`, 음역 MIDI 39~80(Eb2~Ab5), 조율 Eb조(Eb장음계 25줄)·Ab조(D 줄 3개를 Db으로). 향피리는 사용자 결정으로 보류(값 없음 유지).
- 단위 테스트: "25현 확정값"(25줄, 양 끝이 음역 경계, 오름차순, Ab조 차이는 49·61·73) 추가, 향피리는 미확인 유지. 기존 "B-1 대기" 기대값은 25현에 한해 확정값으로 바꿨다(B-1 완료에 따른 계약 변경).
- 남은 결정: 25현은 큰보표를 쓴다 → 처음 계획의 한 줄 보표 범위와 충돌.
- 사용자 "12현 가야금 자료 찾아서 적용해줘" → "12현은 산조 가야금만": 국립국악원 국악사전의 산조 조현(실음 G2~D5, 12줄)으로 `gayageum-12-sanjo` 추가(`INSTRUMENT_IDS`, 프로필, `/new` 목록 "준비 중"). 연주자 확인 값이 아닌 문헌 값임을 INSTRUMENTS.md에 표시. 단위 테스트 2개 추가·보강(산조 값, `/new` 목록 순서).

## 53. 25현 가야금 큰보표 (2026-11-15, 사용자 승인 "A로 진행해주고 커밋해줘")

- 결정 변경: 처음 계획은 "큰보표는 범위 밖"(결정 9·위험표)이었으나 전문가 답변(25현은 높은음·낮은음자리표 큰보표)에 따라 사용자가 A(25현만 큰보표)를 승인. 12현 산조가야금·피아노는 한 줄 보표 유지.
- Domain: `InstrumentProfile.grandStaff`(25현만 true), `usesGrandStaff(part)`, `assignGrandStaves(measures)`(가온 도 C4 이상 위 보표, 아래는 아래 보표, 쉼표는 바로 앞 음의 보표, 첫 쉼표는 위). Score 구조·저장 형식 변화 없음(표시·출력 전용).
- 렌더러: 25현이면 행마다 높은음·낮은음 보표 두 개(간격 100px, 라벨 있으면 150px), 괄호(brace)·왼쪽·마디선 연결, 두 보표 시작 위치 맞춤. 선율은 한 voice로 배치해 박마다 x가 같고, 음표마다 자기 보표에 그린다(cross-staff). 편집 커서는 두 보표에 걸쳐 그린다. `staffRowGeometry(part, labelMode)` 공개, 인쇄 행 나누기도 이를 따른다.
- MusicXML: 25현이면 `<staves>2</staves>`, `<clef number="1">` G·`number="2"` F, 모든 음표·쉼표에 `<staff>`. XSD 검증 통과.
- 작업 중 발견해 함께 고친 기존 결함(피아노 포함, P6-11):
  1. 악보 글꼴(Bravura)이 다 받아지기 전에 그리면 음표 기둥·덧줄이 머리에서 떨어져 그려졌다(간헐적). 그리기 전에 `document.fonts.load("30pt Bravura")`를 기다린다.
  2. 줄 첫 마디는 음자리표·조표·박자표가 자리를 차지하는데 음표 배치 폭에 반영되지 않아, 첫 마디 마지막 음이 마디선 밖으로 밀려났다. 시작 장식 폭을 빼고 배치한다.
- 테스트: 단위 `grand-staff.test.ts` 4, `grand-staff-rendering.test.ts` 3, MusicXML 2, E2E `grand-staff.spec.ts` 4(위·아래 배치와 피아노 대비 간격, 음 선택·저장 불변, 인쇄 한 행에 두 보표, 커서 길이, 첫 화면부터 기둥이 머리에 붙음). `transpose-consistency` 통합 테스트의 Stave 대역에 `getNoteStartX`를 추가(렌더러가 새로 읽는 API, 기대값 불변).
- 검증: typecheck, lint, unit 78 files/1064, architecture 위반 0, build, E2E 115/115. 화면은 Chromium 스크린샷으로 확인. 25현을 고르는 화면은 아직 없다(B-3·B-6). 연주자의 실제 악보 확인(UAT-G)·Safari·실기기 미검증.

## 54. Phase 7 B-3 — 악기에 맞추기 (2026-11-15, 사용자 "다음으로 진행해줘")

- Domain `instrument-fit.ts`: `selectableInstruments()`(확인된 프로필만 — 피아노·25현·12현 산조, 향피리 제외), `analyzeInstrumentFit(score, instrument)`(악기 음역, 범위 밖 논리 발음 수 아래/위 — 붙임줄 이어짐은 한 번, 한 줄 보표 악기의 음자리표 제안: 아래쪽 중앙값이 C4 미만이면 낮은음자리표, 큰보표·음표 없음이면 제안 없음). 읽기 전용, 음을 바꾸지 않는다. `InstrumentProfile.range.label`(악기 악보식 철자 A0–C8, Eb2–Ab5, G2–D5) 추가.
- UI `InstrumentFitPanel`(다듬기 모드, `TransposeTool` 안, 휴대폰에서는 "악기에 맞추기" 접힘 행): 악기 선택 = `SetInstrument` 1회(Undo 1번), 향피리는 "(준비 중)" 선택 불가. 범위 밖 음 수 표시, 제안 음자리표 "적용" = `SetClef` 1회. "이 악기 음역으로 조옮김 추천"은 기존 조옮김 미리보기를 악기 음역이 계산된 상태로 연다(`RangeRecommendations.initialTarget`). 확정은 기존 `TransposeScore` 1회. 악기를 바꾼 뒤 추천하면 오래된 미리보기 대신 현재 악보로 다시 연다.
- 새 의존성·저장 형식·Command 변화 없음.
- 테스트: 단위 `instrument-fit.test.ts` 5(먼저 작성해 실패 확인), E2E `instrument-fit.spec.ts` 2(구현 후 작성: 선택이 음을 바꾸지 않음·저장, 범위 밖 2개, 추천 목표 43–74, 후보 full/partial, 확정 후 0개, Undo 2번으로 조옮김→악기 순 복원; 음자리표 제안·적용·Undo).
- 검증: typecheck, lint, unit 79 files/1069(3회 연속 통과 — 그 전 1회 실행에서 1건 실패가 있었으나 재현되지 않아 원인 미상), architecture 위반 0, build, E2E 117/117(Chromium). Safari·실기기 미검증, 국악기 실제 연주 가능성은 연주자 확인(UAT-G) 전.
- 남은 것: B-4 조율 추천·누름 표시, B-5 출력, B-6 `/new`·`/record` 악기 선택과 "준비 중" 해제.

## 55. Phase 7 B-4 — 조율 추천·누름 표시 (2026-11-15, 사용자 "진행해줘", 커밋 전)

- Domain `tuning.ts`: `pressedNoteIds(part, tuning)`(개방현에 없는 음의 첫 발음, 붙임줄 이어짐 제외 — B-1 G3에 따라 폭과 상관없이 모두 "누름", "불가" 없음), `recommendTunings(score)`(누름 적은 순 → 조표와 맞는 조율 → 프로필 순). `InstrumentTuning.keyFifths` 추가(Eb조 -3, Ab조 -4, 산조 null).
- 표시: 조율 선택은 라벨처럼 화면 상태(저장·이력 없음, 기본값은 1순위 추천). 렌더러 `pressedEventIds` 옵션 — 음 위에 "누름"(위쪽 Annotation, 라벨은 아래라 겹치지 않음), 행 캐시 서명에 포함. 다듬기 "악기에 맞추기"에 조율 선택(25현: "Ab조 · 누름 없음 (추천)" 등)과 요약, 12현 산조는 조율이 하나라 요약만.
- 인쇄: `printPath(id, labelMode, tuningId)` → `/print/id?tuning=eb`, 인쇄 화면이 같은 누름 표시와 머리글 조율 이름을 그린다. 조율 없는 주소는 이전과 같다.
- 테스트: 단위 `tuning.test.ts` 6(먼저 작성해 실패 확인; 최저·최고 줄 개방, 반음 위아래 누름, Ab조 D줄, 추천 순서·동률 조표, 12현 맨 위 줄 위, 조율 없는 악기, 인쇄 주소). E2E `tuning-press.spec.ts` 2(추천·선택·누름 1개·라벨과 겹침 없음·저장/이력 없음·인쇄 있음/없음, 12현).
- 기존 테스트 수정 1건: `grand-staff.spec.ts` 기둥 간격 검사가 `.vf-notehead` 그룹 상자를 썼는데, VexFlow는 음표의 Annotation("누름")을 그 그룹 안에 그려 상자가 넓어진다. 음표 머리 글리프(`.vf-notehead > text`)만 재도록 바꿨다. 기대값(3px 미만)은 그대로이고 스크린샷으로 기둥이 붙어 있음을 확인.
- 검증: typecheck, lint, unit 80 files/1075, architecture 위반 0, build, E2E 119/119(Chromium). Safari·실기기·연주자 확인(UAT-G) 미검증. 줄 번호 표시는 B-1 G5("안 적어도 됨")에 따라 만들지 않았다.

## 56. Phase 7 B-5 — 출력에 악기 이름 (2026-11-15, 사용자 "시작해줘", 커밋 전)

- MusicXML(결정 9): 파트마다 `<score-instrument id="P{n}-I1"><instrument-name>`에 악기 이름. `<part-name>`은 기본 이름("Melody")이면 악기 이름, 직접 붙인 이름이면 "이름 (악기)" — **구현 기본값**(가져온 JSON의 파트 이름을 잃지 않도록). Domain `exportPartName(part)`, `DEFAULT_PART_NAME`. XSD 검증 통과.
- PDF 머리글: 제목 아래 `악기` 또는 `악기 · 조율`(누름 표시를 인쇄할 때) 한 줄(`data-testid="print-instrument"`). 조율 이름은 B-4에서 박자·조성 줄에 넣었던 것을 이 줄로 옮겼다.
- MIDI: 그대로(음색·트랙 이름 변경 없음, 일반 MIDI에 국악기 없음).
- 기존 테스트 기대값 변경 1건: `musicxml-export.test.ts`의 part-name "Melody & Co" → "Melody & Co (피아노)". 결정 9의 의도된 출력 변화이며 XML 이스케이프 검사는 그대로.
- 12현 산조 5도 위 기보: 결정하지 않았다. 앱은 실음 기보(결정 9 기본)를 유지한다. 국악사전은 관행으로 적었을 뿐 연주자 확인이 없다 — 사용자 결정 대기.
- 테스트: 단위 MusicXML +3(악기 3종 이름·score-instrument, 필드 없는 파트 = 피아노, 파트별 id), E2E `tuning-press.spec.ts` 인쇄 머리글 2곳 확인.
- 검증: typecheck, lint, unit 80 files/1078, architecture 위반 0, build, E2E 119/119(Chromium). MuseScore 등 외부 프로그램에서 연 결과는 미확인.

## 57. Phase 7 B-6 — 시작 흐름에서 악기 선택 (2026-11-15, 사용자 "진행해줘", 커밋 전)

- `/new`·`/record` ① "목표 악기": 확인된 악기(피아노·25현 가야금·12현 산조가야금)를 고를 수 있고 향피리는 "(준비 중)" 선택 불가. 목록은 Domain `selectableInstruments()`에서 만든다(고를 수 있는 것 먼저). `parseScoreSetup`이 악기를 읽고 목록에 없거나 확인 전인 악기는 거부. `createEmptyScore`·`createNewScore`·`buildTranscribedScore`가 악기를 받아 새 악보 파트에 넣는다(기본 피아노).
- `/record` ④: 채보 후보를 고른 악기 음역과 비교해 "음역 · 범위 밖 n개"와, 벗어나면 기존 추천기의 1순위 이동(전체 적합/가장 가까운 후보)을 보여 준다(`InstrumentRangeNote`). 표시만 하고 음은 바꾸지 않으며, 확정은 편집기 다듬기 → 악기에 맞추기에서.
- 기존 테스트 기대값 변경(의도된 변화): `score-setup.test.ts`(기본 setup에 `instrument: "piano"`, 선택 가능 목록), `home.spec.ts`(국악기 선택 가능, 25현으로 만들기), `record-flow.spec.ts`(12현 산조 선택·이전 단계 유지·④ 음역 문구·저장 악기).
- 미검증: `/record` ④의 범위 밖·추천 문구는 E2E에서 보지 못했다(가짜 마이크 A4가 모든 악기 음역 안). 판정·추천은 단위 테스트(B-3)로만 확인.
- 검증: typecheck, lint, unit 80 files/1082, architecture 위반 0, build, E2E 119/119(Chromium). Safari·실기기·실제 마이크·연주자 확인(UAT-G) 미검증.
- Phase 7 트랙 B 남은 것: 향피리(B-1 보류), 12현 산조 5도 위 기보 결정, UAT-G.

## 58. 향피리 → 산조대금 교체 (2026-11-15, 사용자 "향피리 대신 대금", "산조대금", "인터넷에서 찾아서 작업해줘", 커밋 전)

- 저장 형식: `INSTRUMENT_IDS`에 `"daegeum-sanjo"` 추가(schemaVersion 3 유지, 값 추가만). `"hyang-piri"`는 남겨 저장된 악보·JSON이 계속 열린다(`score-backup.test.ts`의 향피리 왕복 테스트 그대로 통과).
- 프로필: `InstrumentProfile.listed` 추가(향피리 false). 산조대금 6관 본청 C4–F6(MIDI 60–89), 실음, 높은음자리표 한 줄, 조율·누름 없음, `verified: true` — 공개 자료에서 계산한 값(`docs/INSTRUMENTS.md` §2-2, 연주자 확인 아님). `listedInstruments()` 추가.
- 화면: `/new`·`/record` ①과 "악기에 맞추기" 목록이 `listedInstruments()`를 쓴다 — 피아노·25현·12현 산조·산조대금, 향피리 없음. 향피리로 저장된 악보는 "악기에 맞추기"에 "향피리 (지원 종료)"(선택 불가)와 안내 문구를 보이고 다른 악기로 바꿀 수 있다.
- 전문가 확인 페이지(산조대금 D1–D6): https://claude.ai/artifact/MsCzXS6aR3ahvScdmkcggp (비공개, 공유는 사용자가 Share 메뉴에서).
- 테스트: 단위 `instrument.test.ts`(산조대금 값·향피리 지원 종료·목록), `score-setup.test.ts`(목록·향피리 거부), `instrument-fit.test.ts`(선택 가능 4종, 산조대금 경계 B3/C4/F6/F#6). E2E `home.spec.ts`(산조대금 선택 가능, 향피리 없음), `instrument-fit.spec.ts`(+1: 향피리 옛 악보 열기·지원 종료 표시·산조대금으로 변경).
- 검증: typecheck, lint, unit 80 files/1083, architecture 위반 0, build, E2E 120/120(Chromium). 산조대금 실제 연주 가능성(특히 역취 E6–F6)은 연주자 확인 전.

## 59. 산조대금 "준비 중"으로 되돌림 (2026-11-16, 사용자 "산조 대금 확인은 나중에, 지금은 12현·25현 가야금만", 커밋 전)

- 프로필 `daegeum-sanjo`: `verified: false`, `range: null`(결정 5: 확인 전 값은 싣지 않는다). 후보 값 C4–F6은 `docs/INSTRUMENTS.md` §2-2에만 남겼다. 목록에는 "산조대금 (준비 중)"(선택 불가)으로 보인다. 고를 수 있는 악기: 피아노·25현 가야금·12현 산조가야금.
- `cf38e98` 배포 뒤 산조대금으로 만든 악보가 있다면 계속 열리고, "악기에 맞추기"에 "산조대금 (준비 중)"·"음역 자료를 확인하는 중" 문구가 보이며 다른 악기로 바꿀 수 있다.
- 테스트 변경(의도된 변화): `instrument.test.ts`(산조대금 값 없음), `score-setup.test.ts`(목록·산조대금 거부), `instrument-fit.test.ts`(선택 가능 3종; 산조대금 경계 테스트는 값이 없어져 "음역 없음·세지 않음" 테스트로 바꿈), `home.spec.ts`·`instrument-fit.spec.ts`("산조대금 (준비 중)" 선택 불가, 향피리 옛 악보는 25현으로 변경).
- 검증: typecheck, lint, unit 80 files/1084, architecture 위반 0, build, E2E 120/120(Chromium).

## 60. UAT에 Phase 7 항목 추가 (2026-11-16, 사용자 "UAT 페이지에 새 기능 항목 추가해줘", 커밋 전)

- `MANUAL_UAT_CHECKLIST.md`: 5E UAT-P(시작 흐름·편집 모드 7), 5F UAT-I(국악기 9), 5G UAT-G(연주자 기록 3). 화면이 바뀐 B-02·B-04·B-06 순서·기준을 새 흐름으로 갱신(결과 기록이 없던 상태라 잃은 기록 없음). 실행 기록 표·권장 순서에 추가.
- UAT 페이지(https://claude.ai/artifact/U139L6GzABEGvMhpT1X7ne) 버전 2: 같은 항목 반영. 기기별 항목 수 Mac Chrome 77, Mac Safari 46, iPhone 33, Android 31. 페이지 기록은 2026-11-16 조회 시 0건.
- 코드 변경 없음. 같은 날 로컬 WebKit 전체 E2E 108/120 PASS, 실패 12건은 이전과 같은 환경 제약(TEST_PLAN).

## 61. Phase 8 1·2단계 — 악보 올리기(MusicXML) (2026-11-16, 사용자 "직접 진행", 커밋 전)

- 설계·계획: `docs/superpowers/specs/2026-11-16-score-import-design.md`, `docs/superpowers/plans/2026-11-16-score-import.md`(1·2단계: MusicXML 읽기·선율 추출, `/import` 화면, 홈 시작 3개). MIDI·B♭ 악기 이조·PDF/사진 인식(OMR)은 다음 단계.
- 읽기(Adapter): `.mxl` 압축 풀기 `readZip`·`findMusicXmlEntry`(새 의존성 없이 브라우저 `DecompressionStream`), `readMusicXml`(partwise; backup·forward·chord·divisions 변경·셋잇단·꾸밈음·큐·붙임줄·못갖춘마디·박자/조/템포 변화 수집, 도돌이표·가사·셈여림은 개수만), `decodeXmlBytes`(UTF-8·UTF-16 BOM만), `parseXmlText`(브라우저 DOMParser), `readScoreFile`(5MB 제한, 정확한 한국어 오류 문구).
- 선율 추출(Domain `extractMelody`): 첫 음 있는 파트(선택 가능) → 단이 겹치면 위 단만 → 꾸밈음·큐 제외 → 붙임줄 합침 → 16분음표(240 tick) 격자 반올림 → 같은 시점은 가장 높은 음, 겹치면 높은 음 우선. 첫 박자·조·템포(없으면 4/4·C장조·90, 템포 20–400), 선법은 같은 조표 장조, 못갖춘마디는 앞을 채움. 바꾼 것은 모두 `ImportNotice`로 보고. 지원 밖 조표·박자, 음 없음, 1024마디 초과는 거절.
- 악보 짓기(Application `buildImportedScore`/`createImportedScore`): 녹음 흐름과 같은 붙여넣기 명령 → 목표 조 조옮김(선택) → 악기 권장 음자리표 → 검증·기보 확인. 한 번 = 악보 하나, 실패 시 저장 없음.
- 화면: `/import` ① 파일(선택·끌어다 놓기, "PDF·사진 인식은 준비 중입니다.") ② 확인(미리보기·듣기·읽은 정보·파트 선택·바뀐 점 목록) ③ 바꾸기(제목·목표 악기·목표 조·이동 방향·음역 추천 상위 5개 "적용"·결과 미리보기) → "악보 만들기" → 편집기. 홈에 "악보 올리기" 시작 추가. `TakeStepList`에 `steps` prop.
- 계획과 다르게 정한 것: `readScoreFile`은 `src/adapters/file-import`에 둠(규칙 application→adapters 금지). 음자리표는 조옮김 뒤 결과 음으로 고름. 박자·조 "변경"은 앞과 다를 때만 셈. 박자표·조표가 없는 파일은 4/4·C장조로 읽음.
- 알려진 점: 가져온 악보도 녹음 흐름처럼 최소 8마디로 만들어져, 짧은 곡은 뒤에 빈 마디가 남는다(요약의 마디 수는 곡 길이).
- 테스트: 단위 `import-zip`(7), `musicxml-reader`(9), `melody-extract`(13), `score-import`(7, 25현 MusicXML 왕복 포함), `import-notices`(4). E2E `import-flow.spec.ts`(6: 홈 세 시작, 쓸 수 없는 파트 뒤에도 파트 선택 유지, 피아노 악보→12현 산조 추천 조·두 번 눌러도 하나, 피아노 B♭장조, `.mxl`·깨진 파일, 중간에 나가면 저장 없음), `home.spec.ts` 링크 1줄.
- 최종 리뷰(별도 모델) 뒤 고친 것: 아래 성부가 밀려 다음 선율 음을 가리던 문제, `implicit` 없는 짧은 첫 마디를 못갖춘마디로 처리, 반올림은 스펙 §5.2대로 정확히 적을 수 없는 시간만(32분음표·점16분+32분 유지), 쓸 수 없는 파트를 골라도 파트 선택이 남음(음 없는 파트는 선택 불가). 남긴 작은 항목: 소수 템포의 잘못된 '범위로 맞춤' 안내, 5MB 확인 전 파일 전체 읽기, 음수 duration, 첫 파트 실패 시 다른 파트 제안 없음, 4분음표가 아닌 메트로놈 표시, 안내의 마디 번호가 원본 기준, MuseScore PDF→MusicXML 안내 문구, 끌어다 놓기 영역 밖 놓기.
- 검증: typecheck, lint, unit 85 files/1124, architecture 위반 0, build, E2E 126/126(Chromium).
- 미검증: Safari·실기기, MuseScore·Finale·Sibelius 등 외부 프로그램이 저장한 실제 MusicXML의 다양성(테스트 파일은 직접 쓴 짧은 곡 4개와 이 앱이 내보낸 파일), 실제 청취.
