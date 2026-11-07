# TEST_PLAN.md — 검증 계획과 Phase 0 실행 기록

- 작성일: 2026-11-07
- 작업 ID: P0-01 / P0-07 / P0-08
- 원칙: 실패한 테스트를 무시·삭제하지 않는다. 실행하지 않은 검증을 통과로 기록하지 않는다.

## 1. 검증 계층

| 계층 | 범위 | 도구 | Phase 0 상태 |
|---|---|---|---|
| Domain 단위 | 음정/시간/마디/중첩/ID 불변식 | Vitest | ✅ 실행 |
| Command 단위 | 편집 성공/실패, 원본 불변 | Vitest | ✅ 실행 |
| 히스토리 단위 | Undo/Redo, 실패 시 보존, redo 무효화 | Vitest | ✅ 실행 |
| 아키텍처 | 레이어·순환·전역·private import·중복 모델 | dependency-cruiser + check-boundaries | ✅ 실행 |
| 정적 검사 | 타입·린트 | tsc, eslint | ✅ 실행 |
| 빌드 | 프로덕션 빌드 | next build | ✅ 실행 |
| 통합 | store/port 연결 (단일 Score 소유자) | Vitest | ✅ 실행 |
| 직렬화 | round-trip, 손상/미지원 버전 | Vitest | ✅ 실행 |
| 브라우저 E2E | 기존 13종 + 원본 보존 10종 | Playwright(Chromium, 프로덕션 빌드) | 60a9e01 사용자 Mac 15/23 통과 / alert 선택자 수정 후 23종 Codex EPERM으로 미실행 |
| 오디오/내보내기 | 채보·PDF/MIDI/MusicXML | - | ⏳ Phase 4/5 |

## 2. 단위·통합 테스트 목록 (최신 실행 결과: 26 파일 / 284 통과)

### `tests/unit/music-theory.test.ts` (5)
- 자연음 MIDI 매핑(C4=60, D4=62, E4=64, G4=67, C3=48)
- 임시표(F#4=66, Bb4=70)
- `createPitch` 일관성
- letter / fixed-Do 라벨(C4→"C4", F#4→"F#4", C4→"도", F#4→"파#")
- `TICKS_PER_QUARTER === 960`

### `tests/unit/score-validation.test.ts` (8)
- 4/4 = 3840 tick, 6/8 = 2880 tick
- 네 음 fixture는 위반 0
- 중복 ID / 중첩 / 0 길이 / 마디 경계 초과 / MIDI 범위 / 표기-MIDI 불일치 각각 검출

### `tests/unit/commands.test.ts` (10)
- AddNote 성공·원본 불변·중복 ID 거부·중첩 거부·없는 마디
- UpdateNote 음정/길이 변경·표기 불일치 거부·없는 note
- DeleteEvent·InsertRest

### `tests/unit/edit-session.test.ts` (5)
- 성공 편집 기록 + undo/redo
- 실패 명령 시 session 동일 참조 유지
- 새 편집 후 redo branch 제거
- 히스토리 없을 때 undo/redo no-op
- 과거 스냅샷 불변

### `tests/unit/serialize.test.ts` (5)
- 유효 Score round-trip 동등성
- 잘못된 JSON 거부
- Score 형태 아님 거부
- 미지원 schemaVersion 거부
- 손상 Score(0 길이) 거부 + 검증 코드 포함

### `tests/unit/score-store.test.ts` (5)
- 초기 null → init 후 세션
- 명령 적용 + 히스토리 기록
- 실패 명령 시 상태 동일 참조 유지
- undo/redo
- 변경 시에만 구독자 알림(구독 해제 후 미알림)

### `tests/unit/piano-keys.test.ts` (3)
- 88건반(21–108), 흰건 52 / 검건 36
- MIDI → 표기 일관성(60=C4, 61=C#4, 21=A0, 108=C8)
- 컴퓨터 키 매핑(흰건/임시표, 대소문자, 미지정 키 null)

### `tests/unit/append-note.test.ts` (5)
- 첫 음표 tick 0 / measure 0, provenance=piano
- 순차 추가(두 번째 tick 960)
- 마디가 차면 다음 마디로 이동(tick 3840, m:1)
- 악보가 가득 차면 거부
- 잘못된 길이 거부

### `tests/unit/score-library.test.ts` (4) — Phase 1-A
- 없는 악보는 생성 후 저장(`created: true`), 기존 악보는 재사용(`created: false`)
- 제목 지정 생성, 목록 조회 (`tests/fixtures/memory-repository.ts` 사용)

### `tests/integration/score-repository.test.ts` (6) — Phase 1-A
- 저장/로드 동등성, 없는 ID → null, `updatedAt` 내림차순 목록, 삭제
- 손상 레코드는 무시(덮어쓰지 않음), 미지원 `schemaVersion` 거부
- `fake-indexeddb`로 Node에서 IndexedDB 어댑터 실행(테스트 전용 dev 의존성)

### `tests/unit/commands-resize.test.ts` (7) — Phase 1-B
- `AddMeasure`: 마디 추가(index/id) 및 중복 ID 거부
- `ResizeNote`: 마디 내 여유 시 성공, 경계 초과 시 다음 마디로 리플로우(전체 검증 통과)
- 마지막 마디 용량 부족 → `MEASURE_CAPACITY_EXCEEDED`
- 단축 시 뒤 이벤트 압축, 잘못된 길이/없는 note 거부

### 타이(Phase 1-D) — `tests/unit/tie-*.test.ts` (33) + `serialize.test.ts` (+2)

`tests/unit/tie-split.test.ts` (8)
- 4/4 마지막 박(2880)에서 시작하는 2박 음 → 2 세그먼트 + 타이 1개(2880·960 / 3840·960)
- 두 마디 이상 지속(5760) → 3 세그먼트 + 타이 2개
- 단일 음가로 표기 불가한 길이(3600) → 3360 + 240으로 분해해 타이 연결
- 마디에 들어가는 모든 표기가능 음가(점 포함)는 1 세그먼트
- 마디보다 긴 음가(5760)는 여러 마디로 분할
- 표기 불가 길이(1000) → `NOT_NOTATABLE`, 마지막 마디 초과 → `OUT_OF_MEASURES`, 길이 0 → `INVALID_DURATION`

`tests/unit/tie-validation.test.ts` (9)
- 유효 체인 통과, 미존재 참조, 자기 참조, 중복 링크, 시간 비연속, 음높이 불일치, 분기, 순환, ties 비배열

`tests/unit/tie-playback.test.ts` (6)
- `chainIdsOf`: 어느 세그먼트에서도 순서 있는 체인, 없는 ID는 `[]`, 타이 없으면 자기 자신 1개
- `mergeTiedNotes`: 2세그먼트/3세그먼트 체인 → **1개 지속음**(중복 어택 없음), 타이 없는 음표는 개별 유지

`tests/unit/tie-commands.test.ts` (10)
- 마디를 넘는 `AddNote` 성공·검증 통과, 마지막 마디 초과 → `MEASURE_CAPACITY_EXCEEDED`, 시작 위치가 마디 밖 → `MEASURE_NOT_FOUND`
- 세그먼트 삭제 시 링크 제거, 음높이 변경은 체인 전체 적용, 위치·길이 패치 → `TIE_EDIT_UNSUPPORTED`
- 길이를 줄여 1세그먼트로 복귀, continuation 세그먼트 resize로 논리 음표 재구성
- 직렬화 round-trip에서 ties 보존, Undo/Redo에서 타이 데이터 복원·재적용

`tests/unit/serialize.test.ts` (7, +2)
- v2 문서 ties round-trip, **v1 문서 → v2 마이그레이션**(`ties: []`, `migrated: true`)

## 3. 실행 명령과 결과 (2026-11-07)

```bash
npm run typecheck        # exit 0
npm run lint             # exit 0
npm run test             # exit 0  (15 파일 / 101 통과)
npm run check:architecture  # exit 0 (43 modules / 105 deps, 위반 0)
npm run build            # exit 0
npm run test:e2e         # exit 0  (4 통과, Chromium / 프로덕션 빌드)
```

## 4. 아키텍처 검사기 자기검증 (의도적 위반 → 탐지 → 제거)

임시 fixture를 `src/domain/__arch_violation__`, `src/features/{alpha,beta}` 에 만들고
검사를 실행한 뒤 **삭제**했다. 관측 결과:

| # | 의도적 위반 | 검사 규칙 | 관측 결과 |
|---|---|---|---|
| 1 | domain → application import | `domain-no-outer-layers` | error 1건, depcruise exit 2 |
| 2 | domain → `react` import | `domain-no-runtime-libraries` | error 1건(수정 후) |
| 3 | domain에서 `window` 사용 | `domain-runtime-global` | 위반 1건, check-boundaries exit 1 |
| 4 | feature beta → alpha private 파일 | `feature-private-import` | 위반 1건 |
| 5 | domain 밖에서 `interface Score` 선언 | `canonical-type-outside-domain` | 위반 1건 |
| 6 | domain 내부 순환 import(a↔b) | `no-circular` | error 1건 |

- 관측: depcruise 3 errors(1+2+6 통합 시) / check-boundaries 3 violations, 각각 non-zero exit.
- 조치: fixture 전체 삭제 후 재실행 → **위반 0** 확인.
- 교훈: depcruise `exclude`에 `^node_modules/`를 넣으면 npm 의존성이 크루즈에서 빠져
  런타임 라이브러리 규칙이 무력화된다. 현재 설정은 `exclude`에서 node_modules를 제외하지 않고
  `doNotFollow`만 사용한다.

## 5. 브라우저/실기기 테스트

### 5.1 Phase 1 슬라이스 수동 검증 (2026-11-07, 데스크탑 Chromium/agent-browser)

| 항목 | 결과 |
|---|---|
| `/editor/demo-score` 로드 | ✅ 제목·툴바·악보·건반·음표 목록 렌더 |
| VexFlow 악보 | ✅ SVG 생성(음자리표·4/4·마디·음표·덧줄). 1차 스크린샷 육안 확인은 실패했으나, DOM/SVG 확대 확인으로 음표 2개 렌더 확인 |
| 건반 클릭 입력 | ✅ C4 클릭 → 음표 1개 + 라벨 "C4" |
| Undo / Redo | ✅ 1 → 0 → 1 |
| 재생 토글 | ✅ 클릭 직후 "Stop", 약 0.8초 뒤 자동 "Play" 복귀(Tone.js 15.1.22 로드 확인) |
| 아키텍처 가드레일 | ✅ 실제 위반(`feature-private-import`) 검출 → 공개 진입점 추가로 수정 |

### 5.2 Phase 1-A(저장)·1-B(편집) 검증 (2026-11-07, agent-browser)

| 항목 | 결과 |
|---|---|
| 악보함 생성 → 편집기 이동 | ✅ `/library` “새 악보” → `/editor/<uuid>` |
| 자동 저장 | ✅ 음표 입력 후 “저장됨” 표시 |
| **새로고침 복구** | ✅ 새로고침 후 음표 1개·C4 라벨 유지(IndexedDB `music-score-platform`) |
| 목록/불러오기 | ✅ 악보함에 표시, “열기”로 동일 ID 복귀(음표 유지) |
| 삭제 | ✅ 확인 후 목록 비움 + “삭제했습니다” |
| 음표 선택/편집 | ✅ 선택 → 편집 패널, 반음 ↑(C4→C#4), 2분음표(1920 ticks) 리플로우, 삭제 |
| 마디 추가 | ✅ 8 → 9마디 |

### 5.2b 타이(Phase 1-D) 검증 (2026-11-07, agent-browser)

| 항목 | 결과 |
|---|---|
| 마디 경계 분할 | ✅ 4/4 마지막 박(2880) 2박 음 → 음표 5개(4분음표 3 + 세그먼트 2), ⌒ 칩 2개 |
| 붙임줄 표시(패널) | ✅ 선택 시 “⌒ 붙임줄 연결됨” 안내 |
| 문맥 메뉴/편집 | ✅ 세그먼트 삭제 시 링크 제거, 음높이 변경은 체인 전체 반영 |
| 저장/복구 | ✅ 새로고침 후에도 음표 5개·⌒ 유지 |
| **VexFlow 타이 곡선** | ✅ DOM 경로 수 대조: 동일 음표 수 48 → 타이 추가 시 **49**(곡선 path 1개) |
| dev 경고 | ✅ 0건(수정 전 `border`/`borderColor` 혼용 경고 1건 제거) |

### 5.3 자동 E2E (Playwright, 2026-11-07)

- 구성: `playwright.config.ts` — `testDir: tests/e2e`, Chromium 단일 프로젝트,
  `webServer`는 `npm run build && npm run start`(프로덕션 빌드, 포트 3010).
- 결과: **4/4 통과** (`npm run test:e2e`, 11.8s).
  1. 새 악보 생성 → 건반 입력 → 음표 수정 → 저장 → **새로고침** → 악보함 불러오기 → 재생/정지
  2. 모바일(390×844) 가로 스크롤 없음 + 입력/저장
  3. 컴퓨터 키보드(A) 입력, 건반 포커스(`toBeFocused`), 음표 칩 `aria-pressed` 상태
  4. 4/4 마지막 박에 2박 음 입력 → **마디 경계 분할·⌒ 표시·“붙임줄 연결됨”** → 새로고침 후에도 음표 5개·⌒ 유지
- 기록된 환경: Playwright 1.65.0 · Chromium headless shell 158.0.8127.18 · Node 22 · macOS
- 주의: dev 서버를 재사용하면 첫 라우트의 클라이언트 청크 컴파일이 느려 실패로 오인될 수 있어
  **프로덕션 빌드 기준**으로 실행한다.

### 5.4 브라우저 매트릭스

| 항목 | 상태 |
|---|---|
| 데스크탑 Chromium(자동 E2E) | ✅ 실행 (5.3) |
| 데스크탑 Safari / Firefox / WebKit | 미실행 |
| 모바일 실기기 Safari/Chrome | 미실행 (Chromium 뷰포트 390×844만 검증) |
| 마이크 권한/오디오 | Phase 4 |
| 오디오 실제 출력 | 미검증(무음/헤드리스) |

브라우저 매트릭스는 실행 시점의 실제 버전을 기록한다(추정 금지).

## 6. 향후 테스트 (Phase별)

| Phase | 추가 테스트 |
|---|---|
| 1 | VexFlow 렌더 스냅샷, 재생 스케줄, IndexedDB save/load round-trip, E2E 4음 입력 |
| 2 | 조옮김 표기/사운드 일관성, 라벨 재계산, 음역 후보 |
| 3 | practice speed가 Score를 바꾸지 않음, A–B 경계 note-off, clipboard ID 재생성 |
| 4 | pitch/onset 정확도, 반복음/옥타브/침묵, F1 벤치마크(데이터셋 확정) |
| 5 | PDF 레이아웃, MIDI 타이밍, MusicXML 조표/박자/철자 round-trip |
| 6 | 모바일/접근성/복구 회귀 |

## 7. 미해결·미검증 (정직한 기록)

- **오디오 실제 출력**은 헤드리스/무음 환경에서 검증하지 않았다(재생 상태 전환만 확인).
- 브라우저는 Chromium 1종만 실행했다. WebKit/Firefox, 모바일 실기기, 데스크탑 Safari 미실행.
- IndexedDB는 같은 브라우저의 새로고침 복구까지 검증했다. **프로필 삭제, 저장 용량 초과, 다중 탭 동시 편집 충돌**은 미검증.
- 타이와 마디를 넘는 음표는 **지원한다**(ADR-009, schemaVersion 2). 슬러/이음줄, 비표기가능 tick의
  최적 분해(현재는 그리디), 마디 자동 확장은 미지원이다.
- 재생은 스케줄/상태 전환만 검증했다. **실제 오디오 출력은 검증하지 않았다**(무음·헤드리스).
- 아키텍처 위반 fixture는 "검증 후 제거" 방식이며, **상시 회귀 테스트로 남아 있지 않다**.
  필요 시 `tests/architecture/` 격리 fixture + 별도 script로 상시화 검토.
- 채보 정확도·내보내기 호환성은 아직 해당 없음(Phase 4/5).

## 8. Phase 1-E 실행 기록

- 단위/통합: `npm run test` → **17 파일 / 129 통과**, 기존 101개 회귀 포함.
- `tests/unit/score-backup.test.ts` (27): 제목 변경/Undo/Redo/원본 불변/빈 제목 거부,
  JSON 동등성·파일명 정리·타이 보존·v1 migration·새 ID 충돌/빈 ID 거부,
  잘못된 입력의 저장 미호출·저장 실패 시 기존 악보 보존·잘못된 중첩 구조/provenance 안전 거부.
- `tests/integration/score-backup.test.ts` (1): 실제 IndexedDB 어댑터(fake-indexeddb)로
  제목 변경 저장 → JSON 백업 → 새 악보로 가져오기 → repository 재생성 후 동등성·원본 보존.
- `typecheck`, `lint`, `check:architecture`, `build` → exit 0.
  아키텍처: 44 modules / 108 dependencies, check-boundaries 37 files, 위반 0.
- E2E 새 시나리오: 제목 변경/Undo/Redo/빈 제목 거부 → 타이 있는 JSON 다운로드 내용 확인 →
  악보함에서 새 악보로 복원 → 잘못된 JSON 거부 → 새로고침 후 제목·음표 보존.
- `npm run test:e2e` → **exit 1, 브라우저 테스트 미실행**.
  프로덕션 빌드 이후 webServer가 `listen EPERM: operation not permitted 0.0.0.0:3010`으로
  시작되지 않았다. 별도 `npm run build`는 성공했다. 기존 §5.3의 4/4는 이전 실행 기록이다.
- 재검증: 포트 리슨 및 Chromium 실행이 허용된 환경에서 `npm run test:e2e` 실행(총 5종).
  다운로드·파일 입력·모바일 레이아웃·실기기 Safari는 현재 검증 완료로 간주하지 않는다.

### 8.1 이후 사용자 Mac 검증 결과 (사용자 제공)

- `exact: true` 선택자 수정 후 사용자가 Mac 일반 터미널에서 `npm run test:e2e` 실행.
- Chromium **5 passed (13.1s)**: 기존 기능 4종 + 제목 변경·JSON 백업/복원 1종.
- 위 Codex EPERM 기록은 유지한다. 이 결과는 아래 쉼표 기능 추가 전의 버전이다.

## 9. Phase 1-E 쉼표 편집 검증 (2026-11-08)

- **20파일 / 170 테스트 통과**, 기존 129개 회귀 + 신규 41개. 테스트 삭제/skip 없음.
- `tests/unit/rest-editing.test.ts` (22):
  정상 삽입·음가 변경·다른 마디 이동·삭제, 표기 불가/음수/0/비정수 길이 거부,
  경계 끝 허용·경계 초과 거부, 잘못된 위치·중복 ID·없는 대상 거부,
  음표/쉼표 충돌, 비리플로우·타이 보존, 실패 시 Score/Undo/Redo 이력 보존,
  정상 Undo/Redo, 기존 ResizeNote와의 유효 리플로우 및 타이 연속성 위반 시 원자적 거부,
  음표·쉼표 공통 끝 위치 계산 및 경계 초과를 자동 건너뛰지 않는 입력 계획.
- `tests/integration/rest-persistence.test.ts` (1): 기존 scoreStore/Command/Undo/Redo와
  IndexedDB 어댑터(fake-indexeddb)를 사용해 혼합 악보 저장·repository 재생성·동등성 확인.
- `tests/unit/rest-rendering.test.ts` (18): 실제 VexFlow StaveNote/GhostNote/Fraction/Voice와
  accidental 처리를 사용해 쉼표 16종 음가, 빈 구간 길이, 타이 양끝 참조,
  낮은음자리표 중앙 배치, Score 원본 불변을 검증한다.
  DOM/Formatter/그리기와 StaveTie 생성은 대체하므로 실제 SVG 배치의 시각 검증과 구분한다.
- `typecheck`, `lint`, `check:architecture`, `build`는 exit 0.
  아키텍처 44 modules / 110 dependencies, check-boundaries 37 files, 위반 0.
- `tests/e2e/rest.spec.ts`에 신규 2종 추가:
  1. 쉼표 선택·위치/길이 변경·충돌/경계 거부·Undo/Redo·삭제·새로고침 복원·SVG 이벤트 수.
  2. 음표/쉼표 혼합 악보에서 타이 링크·음표 위치·schemaVersion 2 저장 보존 및 SVG 렌더.
- 전체 `npm run test:e2e` 시도: **exit 1**. 서버가 `listen EPERM 0.0.0.0:3010`으로
  시작되지 않아 **총 7종 모두 이번 환경에서 미실행**이다. 기능 assertion 실패와 구분한다.
- 재실행 명령(Mac 일반 터미널):

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

남은 검증: 7종 브라우저 E2E, 실제 SVG 쉼표/빈 구간/타이 배치 육안 확인,
Safari 및 모바일 실기기. 기존 5종 통과를 쉼표 기능 통과로 확대하지 않는다.

### 9.1 이후 사용자 Mac 검증 결과 (사용자 제공)

- 사용자가 `d539a2f` 기준 Mac Chromium **E2E 7개 통과**를 확인했다.
- 위 Codex EPERM 실행 기록은 유지한다. 이 결과는 악보 설정 추가 전의 버전이다.

## 10. Phase 1-E 악보 설정 검증 (2026-11-08)

- `npm run test`: **23파일 / 236개 통과**. 기존 170개 유지, 신규 66개 추가.
- `tests/unit/score-settings.test.ts` (54): 정수 20–400 BPM 및 Undo/Redo,
  장조/단조 30개에서 Pitch/MIDI·이벤트·타이 보존, 빈 악보 4개 박자의 마디 길이,
  음표/쉼표가 있는 악보의 변경 제한, 잘못된 템포/조표/박자/없는 파트 거부,
  실패 시 Score 및 past/future 동일성.
- `tests/integration/settings-persistence.test.ts` (2): 기존 store/명령·IndexedDB 어댑터를
  사용한 템포/조표/빈 악보 박자 저장·복원과 Undo 저장 동등성(fake-indexeddb).
- `tests/unit/settings-playback.test.ts` (3): Tone 대역으로 60/120/240 BPM의 스케줄 간격과
  음높이 보존 확인. 실제 스피커 출력·브라우저 오디오 권한 검증은 아니다.
- 기존 `rest-rendering.test.ts`에 7개 추가: 실제 VexFlow 객체/임시표 처리를 재사용해
  샵/플랫 및 제자리표, 조표에 포함된 음의 불필요한 임시표 억제, 단조 조표와 빈 악보 6/8 확인.
  DOM/그리기 대역은 기존과 같으며 실제 SVG 시각 검증과 구별한다.
- `npm run typecheck`, `lint`, `check:architecture`, `build`: 모두 exit 0.
  아키텍처 46 modules / 117 dependencies, check-boundaries 39 files, 위반 0.
- `tests/e2e/settings.spec.ts` 2종 추가: 빈 악보 박자·템포·조표·Undo/Redo·재생 정지·저장 복원,
  이벤트가 있는 악보의 박자 잠금·단조 조표 변경 후 Pitch 보존.
  기존 IndexedDB 조회 코드는 `tests/e2e/storage.ts`로 옮겨 쉼표/설정 시나리오에서 재사용한다.
  기존 7개 테스트의 assertion과 시나리오는 유지한다.
- `npm run test:e2e`: **exit 1**, 서버 시작 시 `listen EPERM 0.0.0.0:3010`.
  이번 버전의 전체 9개는 **미실행·미검증**이며 assertion 실패가 아니다.
- `npm run test:e2e -- --list`: exit 0, 3개 spec에서 총 9개 수집 확인. 브라우저 실행 통과를 뜻하지 않는다.
- Mac 일반 터미널 재실행:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

남은 검증: 전체 9개 브라우저 회귀·설정 중 오디오 초기화 취소·실제 SVG 및 오디오 출력,
Safari/모바일 실기기. 기존 이벤트의 박자 재배치와 악보 중간 조표/박자 변경은 구현하지 않는다.

## 11. 저장 완료 표시 회귀 수정 (2026-11-08)

- 사용자 Mac 결과: `a4fc0ac`에서 기존 1종 실패, 설정 신규 2종 포함 **8/9 통과**.
  실패는 `editor.spec.ts`의 새로고침 후 `1920 ticks` 확인이다.
- 실제 `trace.zip`과 `error-context.md` 분석:
  `aria-pressed`는 음표/쉼표 칩에만 있으며 설정 버튼에는 없다.
  첫 클릭은 C4 칩, 새로고침 후 클릭도 C4 칩으로 해석됐다. 선택 패널은 열려 있었다.
  새로고침 전 C#4/1920 표시 assertion은 통과했지만 이후 화면은 C4/960이었다.
- trace의 길이 변경 클릭 시각 13298.911ms, reload 시작 13341.708ms(약 43ms 간격).
  자동 저장 디바운스는 400ms인데 이전 편집의 "저장됨" 표시가 남아 완료 assertion을 통과했다.
  설정 UI가 선택 대상을 바꾼 것이 아니라 자동 저장 상태가 최신 편집을 반영하지 못한 문제다.
- 수정: store 변경 시 즉시 `saving`, 저장 완료 시 현재 Score와 저장한 snapshot이 같을 때만 `saved`.
  Undo로 이미 저장된 내용에 돌아왔을 때는 중복 저장 없이 `saved`로 복귀한다.
- 신규 `tests/unit/autosave.test.ts` 4종:
  디바운스 전 stale saved 무효화와 음정/길이 저장 동등성, 이전 in-flight 저장 완료의 stale saved 차단,
  저장된 내용으로 Undo 시 중복 저장 억제, 저장 실패 error 상태.
  React hooks는 효과/상태 테스트 대역으로 실행하며 실제 DOM 렌더는 E2E 검증 대상으로 남긴다.
- 수정 전 신규 4개 중 **2개 실패**로 문제를 재현했고, 수정 후 **기존 236 + 신규 4 = 240개/24파일 통과**.
- E2E는 원래 기대값 1920을 유지하며 C4/C#4 정확한 이름으로 선택한다.
  새로고침 전 실제 IndexedDB의 MIDI/시작 tick/길이를 확인하도록 보강했다. timeout 증가·삭제·skip 없음.
- typecheck/lint/check:architecture/build 통과. 아키텍처 46 modules / 117 deps, 경계 39파일 위반 0.
- 전체 E2E 실행 시도: `listen EPERM 0.0.0.0:3010`, exit 1 → 수정 버전의 9종 **미실행**.
  기존 사용자 8/9 결과와 구분한다. Mac 일반 터미널에서 `npm run test:e2e` 재실행 필요.
- 원래 실패 증거는 재실행 전 `/tmp/music-score-e2e-a4fc0ac/{trace.zip,error-context.md}`에 보존했다.
  임시 보관 경로이며 Git에는 포함하지 않는다.


## 12. 재생 커서·메트로놈 및 마지막 저장 보존 (2026-11-08)

- 사용자 제공 기준선 `42e29bb`: 240개 및 Mac Chromium **9/9** 통과.
  이전 절의 Codex EPERM 기록은 그대로 보존한다.
- 이번 단위·통합: **25파일 / 266개 통과**, 기존 240개 + 신규 26개(삭제/skip 없음).
- 신규 `tests/unit/playback.test.ts` **20개**: AudioContext 기준 60/120/240 BPM 커서,
  look-ahead 제외·정수 tick 경계, pause 고정·resume 남은 음·stop 초기화,
  타이 단일 전체 지속음·세그먼트 경계 하이라이트·continuation 재개,
  2/4·3/4·4/4·6/8의 클릭 수/간격/첫 박 강조, 60/90/240 BPM 클릭,
  재생 중 메트로놈 토글·일시정지 후 토글, 후행 쉼표·자연 종료·멱등 stop,
  gap/rest 활성음 부재, DOM 하이라이트/선택 독립, 오디오 초기화 실패.
  Tone은 시계/음성 대역이며 **실제 오디오 출력 검증이 아니다**.
- `rest-rendering.test.ts` **26개**(+1): 실제 VexFlow tickables를 유지하며,
  그리기/DOM 접근 대역으로 SVG 그룹이 음표·쉼표·타이 세그먼트의 canonical ID에 연결됨을 확인.
- `autosave.test.ts` **9개**(+5): 연속 편집 마지막 값, 느린 이전 저장의 역전 방지,
  IndexedDB(fake-indexeddb) 재생성/불러오기 동등성, cleanup 최종 쓰기 순서,
  저장 실패 후 후속 쓰기 진행. 느린 이전 저장 테스트는 수정 전 실제 덮어쓰기로 실패했다.
- typecheck/lint/check:architecture/build exit 0.
  아키텍처 50 modules / 128 deps, 경계 43파일 위반 0.
- 신규 `tests/e2e/playback.spec.ts` **2종**:
  1. 위치 진행·SVG/칩 하이라이트·pause 고정·resume·stop 초기화,
     메트로놈 토글·Score 불변·새로고침 초기화.
  2. 빈 6/8 메트로놈·템포 편집 중 정지·연속 편집 마지막 값 저장/복원.
  기존 9종 assertion/timeout은 유지한다. `npm run test:e2e -- --list`로 **11종/4파일** 수집 확인.
- 전체 `npm run test:e2e`: exit 1, 프로덕션 빌드 후 webServer 시작에서
  **listen EPERM 0.0.0.0:3010**. 이번 버전 **11종 전부 미실행·미검증**이며 기능 assertion 실패와 구분한다.

Mac 일반 터미널 재검증:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

남은 검증: 위 전체 브라우저 E2E, 실제 스피커/헤드폰의 지속음·클릭·정지/일시정지,
SVG 하이라이트 시각 확인, 느린 메인 스레드·백그라운드 탭·Safari·모바일 실기기.
커서 알림은 25ms 목표 주기지만 브라우저 메인 스레드 지연의 영향을 받는다.
브라우저 강제 종료 시 비동기 cleanup 저장 및 다중 탭 동시 편집 충돌은 보장하지 않는다.


## 13. E2E status 선택자 충돌 수정 (2026-11-08)

- 사용자 제공 수정 전 `0af8c15` Mac Chromium 결과: **11개 중 9개 통과 / 2개 실패**.
- 실제 두 실패의 `error-context.md`는 `<output data-testid="playback-position">`와
  오류 `<p role="status">`에 대한 `getByRole("status")`의 strict mode violation을 기록한다.
  소스에서도 output과 메시지 p가 편집기에 함께 존재함을 확인했다.
- `tests/e2e/editor.spec.ts:174`의 빈 제목 오류, `tests/e2e/rest.spec.ts:31,33`의
  `OVERLAPPING_EVENTS`/`EVENT_OUT_OF_MEASURE` 검증만 `page.locator('p[role="status"]')`로 한정한다.
  기대값/전체 문구 일치·부분 문구 포함 검증/timeout을 유지하고 순서 기반 선택은 사용하지 않는다.
- editor.spec.ts:194,201의 나머지 `getByRole("status")`는 악보함 가져오기 결과다.
  그 화면에는 재생 output이 없으므로 유지한다. 애플리케이션 코드 및 재생 UI는 수정하지 않는다.
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run check:architecture`,
  `npm run build`: 모두 exit 0. **25파일 / 266개 통과**, 아키텍처 50 modules / 128 deps,
  경계 43파일 위반 0. 테스트 삭제/skip/timeout 증가 없음.
- 전체 `npm run test:e2e`: 서버가 **listen EPERM 0.0.0.0:3010**으로 시작하지 못해 exit 1.
  수정 버전 **전체 11종 미실행**이며 수정 전 Mac 9/11 결과와 구분한다.
- `npm run test:e2e -- --list`: exit 0, **11종/4파일** 수집 확인(브라우저 검증 아님).
- 원래 Mac 실패의 trace/error-context는 실행 전
  `/tmp/music-score-status-0af8c15-lt3dp2yv/test-results/`에 보존했다(임시 경로, Git 제외).

Mac 일반 터미널 재검증:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```


## 14. 악보함 이동 전 최신 저장 및 transaction 완료 검증 (2026-11-08)

### 근거와 수정 전 재현

- 사용자 Mac `591e02e`: **10/11 통과**, 제목/JSON E2E의 기존 악보 링크 확인 1종 실패.
- 실제 trace: 제목 수정·Undo·Redo 후 “백업 연습곡” 표시와 `백업 연습곡.json` 다운로드명 확인 통과.
  Redo 클릭 시작 10083.440ms → 악보함 이동 클릭 10186.788ms(약 103ms), 디바운스 400ms보다 이르다.
- error-context의 악보함에는 **동일 ID `/editor/e2e-backup` 링크가 “새 악보”로 존재**한다.
  잘못된 고정 경로가 아니라 이전 제목을 조회한 것이다. JSON 다운로드는 메모리 Score만 읽는다.
- `useAutosave`는 cleanup에서 저장을 큐에 넣지만 React cleanup은 그 Promise를 기다리지 않는다.
  악보함은 처음 한 번 list를 읽으므로 이후 저장이 완료되어도 이미 조회한 목록은 바뀌지 않는다.
- 실제 IndexedDB의 역사적 dump는 trace에 없어서 당시 영구 데이터 유실은 확정할 수 없다.
  fake-indexeddb에서 제목 Undo/Redo → cleanup → 즉시 list를 실행하면 이전 제목이 나오는 것으로
  같은 경합을 재현했다(신규 테스트 수정 전 실패).
- 별도 transaction 재현: put success 직후 abort를 주입해도 기존 repository.save가 resolve했다.
  신규 테스트 수정 전 실패. transaction.oncomplete/abort/error를 기다리도록 보완했다.

### 수정 후 검사

- **25파일 / 270개 통과**, 기존 266개 유지, 테스트 삭제/skip 없음.
- autosave.test.ts **12개**(+3):
  1. 제목 Rename/Undo/Redo 뒤 명시적 flush → cleanup → list의 ID/제목 일치(fake-indexeddb).
  2. 디바운스 전 flush 및 저장 대기 중 발생한 후속 편집까지 보존.
  3. flush 실패의 false/error·Score와 히스토리 보존·재시도 성공.
  기존 cleanup 최종 저장/이전 쓰기 역전 방지/연속 편집/IndexedDB 복원 9개도 유지한다.
- score-repository.test.ts **7개**(+1): put 요청 성공 뒤 transaction abort가 save를 reject하고
  기존 저장본은 보존됨을 실제 IndexedDB 어댑터 + fake-indexeddb로 검증한다.
- 기존 editor.spec.ts의 JSON 흐름은 ID·제목, 저장됨 및 IndexedDB 전체 Score/다운로드 동등성을
  검증한 후 이동하며 기존 기대값을 유지한다. timeout 증가 없음.
- 신규 autosave-navigation.spec.ts **2종**:
  1. 저장됨을 기다리지 않는 연속 입력·제목 Undo/Redo·악보함 이동, ID/제목/음표·새로고침 복원.
  2. 실제 put success 이후 transaction abort 주입 → 이동 차단·오류 안내·JSON 백업 가능·재시도 성공.
- typecheck/lint/check:architecture/build 모두 exit 0.
  아키텍처 50 modules / 128 deps, 경계 43파일 위반 0.
- `npm run test:e2e`는 **listen EPERM 0.0.0.0:3010**, exit 1 → **수정 버전 13종 모두 미실행**.
  `npm run test:e2e -- --list`: exit 0, 13종/5파일 수집 확인. 브라우저 통과를 의미하지 않는다.
- 원래 실패 증거: `/tmp/music-score-navigation-591e02e-dvlvdcaz/test-results/`에 보존(임시 경로, Git 제외).

Mac 일반 터미널 재검증:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

남은 위험: 새 13종 브라우저 E2E 미검증, 브라우저 강제 종료/직접 URL 이동/뒤로가기의
비동기 cleanup 저장 완료, 다중 탭 동시 편집. 명시적 저장 후 이동 보장은 편집기 홈/악보함 Link에 적용한다.


## 15. 손상·미지원 저장본 직접 열기 원본 보존 (2026-11-08)

- 사용자 기준선 `8141c6b`: 단위·통합 270개, Mac Chromium **13/13** 통과.
- 이번 결과: **26파일 / 284개 통과**, 기존 270개 + 신규 14개.
  기존 저장소의 손상/미지원 테스트 2개는 null이 아니라 typed error를 검증하도록 강화했다.
- 신규 `score-open-preservation.test.ts` **12개**(실제 IndexedDB adapter + fake-indexeddb):
  손상 JSON/미지원 버전/음악 불변식 실패/중첩 구조 실패/원시 envelope 실패/ID 불일치 6종의
  직접 open 거부·application save 미호출·직접 save 방어·원시 레코드 전체 불변·list 비파괴 검증,
  실제 미존재 생성, 정상 타이 악보 무쓰기 로드, 지원 v1 메모리 변환/읽기 원본 보존/편집 저장,
  get 읽기 실패, 미존재 조회 후 늦게 생긴 손상 레코드 보존, JSON import의 실패 레코드 ID 충돌 거부.
- autosave.test.ts **14개**(+2): 성공한 baseline은 flush/cleanup으로 재저장하지 않음,
  baseline 이후 정상 편집·Undo/Redo·영속 복원 유지. 기존 마지막 값/저장 순서/오류 재시도 12개 유지.
- 신규 `score-open-preservation.spec.ts` **10종**:
  실제 Chromium IndexedDB에 원시 레코드/추가 메타데이터를 주입하고 편집기 URL로 이동한다.
  실패 7종(위 6유형 + 읽기 오류)은 오류 화면·편집/Staff 부재·400ms 이후 쓰기 0회·원시 레코드 불변,
  악보함 복귀 뒤에도 무쓰기를 검사한다. readwrite transaction 시도와 put/add/delete/clear를 함께 계측하므로,
  save guard에 의해 put만 차단된 자동 저장 시도도 탐지한다. Playwright clock으로 디바운스보다 긴 시간을 진행한다.
  정상 v1/v2 2종은 읽기/이동만으로 원본 무변경, 명시적 편집 저장·타이·Undo/Redo·새로고침을 검증한다.
  추가 1종은 이전 정상 편집 세션이 메모리에 남아 있어도 같은 ID의 손상 저장본을 재검증하고 보존함을 확인한다.
- 기존 13종(정상 생성·편집·저장·백업/가져오기 검증 포함)은 유지하며 timeout 증가/삭제/skip 없음.
- typecheck/lint/check:architecture/build exit 0, 아키텍처 50 modules / 128 deps,
  경계 43파일 위반 0. 초기 신규 테스트 계측의 Window 타입 오류/unused fixture 경고는 수정 후 재검증했다.
- `npm run test:e2e`: 프로덕션 서버 시작 시 **listen EPERM 0.0.0.0:3010**, exit 1.
  **이번 버전 23종 전부 미실행**이며 브라우저 원본 보존을 검증 완료로 간주하지 않는다.
- `npm run test:e2e -- --list`: exit 0, **23종/6파일** 수집 확인.

Mac 일반 터미널 재검증:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

남은 검증/범위: 새 전체 E2E 23종, Safari/모바일·실제 오디오/SVG,
강제 종료·직접 URL 이탈·뒤로가기의 미저장 정상 편집 보존과 정상 저장본 간 다중 탭 충돌.
이번 atomic save guard는 읽을 수 없는 기존 레코드를 보호하며 정상 레코드 간 충돌 병합은 하지 않는다.
원시 백업 UI/자동 복구는 미구현이고 실패 원본은 수정 없이 보관한다.


## 16. Next.js route announcer와 오류 alert 선택자 충돌 (2026-11-08)

- 사용자 Mac `60a9e01`: **15개 통과 / 8개 실패**, 총 23종.
- 실제 실패 8개 error-context는 모두 `getByRole("alert")`가 실제 오류 p와
  `<div role="alert" id="__next-route-announcer__">`에 동시에 일치한 strict mode violation이다.
  실패는 원본 불변성 assertion에 도달하기 전에 발생했으므로 데이터 보존 성공/실패로 확대 해석하지 않는다.
- score-open-preservation.spec.ts:70,137만 오류 화면 testid 내부의 p로 한정한다:
  `page.getByTestId("score-open-error").locator('p[role="alert"]')`.
  기대 오류 코드·toContainText 방식은 유지하고 `.first()`나 timeout 증가는 사용하지 않는다.
- 다른 E2E의 전역 alert 선택자는 없음을 확인했다. 애플리케이션 코드는 수정하지 않았다.
- Git 기준 파일과 비교해 위 2곳 외 모든 테스트 내용이 동일함을 확인했다.
  원시 레코드 전체 불변, 자동 저장을 포함한 쓰기 시도 0회, 편집/Staff 부재,
  이전 정상 세션의 동일 ID 재진입 차단, 악보함 복귀 후 보존 검증 모두 유지한다.
- `npm run test`: **26파일 / 284개 통과**. typecheck/lint/check:architecture/build exit 0.
  아키텍처 50 modules / 128 deps, 경계 43파일 위반 0.
- `npm run test:e2e`: 서버 시작 시 **listen EPERM 0.0.0.0:3010**, exit 1 → **23종 미실행**.
  `npm run test:e2e -- --list`: exit 0, 23종/6파일 수집 확인(브라우저 통과 아님).
- 원래 실패 증거 8종은 `/tmp/music-score-alert-60a9e01-ye6cjijv/test-results/`에
  실행 전 보존했다(임시 경로, Git 제외). 이전 Codex EPERM 기록도 유지한다.

Mac 일반 터미널 재검증:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

남은 검증: 수정 후 전체 23종 및 오류 선택자 이후의 브라우저 원본 보존 assertion 실행.
