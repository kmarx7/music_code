# TASKS.md — Phase 0 작업 및 MVP 추적

- 최종 갱신: 2026-11-08
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

## 2. 검증 명령 결과 (최신: 2026-11-08 피아노 입력 소리 미리듣기)

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run typecheck` | ✅ exit 0 | strict |
| `npm run lint` | ✅ exit 0 | eslint 9 + eslint-config-next |
| `npm run test` | ✅ exit 0 | 28 파일 / **313 테스트 통과**(기존 284 + 신규 29) |
| `npm run check:architecture` | ✅ exit 0 | 51 모듈·130 의존성, 경계 44파일 위반 0 |
| `npm run build` | ✅ exit 0 | Next 16.4.4, 정적 페이지 3개 |

## 3. MVP 기능 추적 (Phase 0 기반만 준비, 기능 완료 아님)

| ID | 기능 | 상태 | Phase 0에서 확보한 기반 |
|---|---|---|---|
| MVP-001 | 가상 피아노 | Partial | 88건반(A0–C8) 클릭 + 컴퓨터 키보드 매핑 → `planAppendNote` → `AddNote`. 입력 소리·ON/OFF·터치 지원 추가, 실제 오디오/새 E2E 미검증. 커서 위치 입력은 후속 |
| MVP-002 | 허밍 녹음 | Pending | 런타임/음악 상태 분리 원칙만 정의 |
| MVP-003 | 단선율 채보 | Pending | 후보→명령 반영 계약(문서), 구현 없음 |
| MVP-004 | 악보 렌더링 | Partial | VexFlow 5 어댑터: 음자리표·조표·박자·마디·음표/쉼표, 연속 줄 음자리표, **점음표·붙임줄**(1-D) |
| MVP-005 | 기본 편집 | Partial | 음표·쉼표·타이·제목·기본 템포·조표·빈 악보 박자 편집 구현. 설정의 단위/통합 검증 통과, 브라우저 E2E 대기. 기존 이벤트의 박자 변경은 안전하게 제한 |
| MVP-006 | 선택·클립보드 | Pending | ID 기반 선택·상대 tick 계약(문서) |
| MVP-007 | 조옮김 | Pending | `midiFromSpelling`/표기 일관성 검증 |
| MVP-008 | 연습 속도 | Pending | Score와 분리 원칙(ADR-004) |
| MVP-009 | A–B 루프 | Pending | `[startTick, endTick)` 문서 계약 |
| MVP-010 | 음이름·고정도 | Partial | `letterName`, `koreanFixedDo` (순수 함수) |
| MVP-011 | 음역·조옮김 제안 | Pending | Pitch/MIDI 범위 검증 |
| MVP-012 | 재생 | Partial | 커서·하이라이트·일시정지/재개·메트로놈 구현, 단위 검증 완료. 새 브라우저 E2E 미검증, cursor 시작/loop/rate는 후속 범위 |
| MVP-013 | 로컬 악보함 | Partial | **IndexedDB 저장·자동 저장·목록·열기·삭제**(1-A). 제목 변경·JSON 백업/가져오기 구현(1-E), 사용자 Mac Chromium E2E 통과 |
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

## 5. 다음 작업

1. Mac 일반 터미널에서 아래 명령으로 미리듣기 추가 후 전체 27종을 검증한다(사용자 기준선 23/23).

   ```bash
   cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
   npm run test:e2e
   ```

2. TEST_PLAN §17의 입력 미리듣기 실제 청취·Safari/모바일 절차를 수행한다. 실제 오디오로 타이 지속·중복 어택 부재, 메트로놈 강조/템포, Pause/Stop 해제와 SVG 하이라이트 확인.
   메인 스레드 지연·백그라운드 탭의 커서 갱신, Safari/모바일 실기기는 별도 검증한다.
3. Phase 1 인수 기준·지원 환경 게이트 확인 후 Phase 2 조옮김·음이름·음역 분석.
   cursor 위치부터 시작, 연습 속도/A–B loop는 후속 범위이며 이번 작업에 포함하지 않는다.
