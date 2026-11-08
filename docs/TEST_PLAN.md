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
| 브라우저 E2E | 기존 41종 유지 | Playwright(Chromium, 프로덕션 빌드) | c0e3951 사용자 Mac 41/41 통과. Phase 2-1 순수 도메인 단계는 미실행 |
| 오디오/내보내기 | 채보·PDF/MIDI/MusicXML | - | ⏳ Phase 4/5 |

## 2. 단위·통합 테스트 목록 (최신 실행 결과: 34 파일 / 507 통과; Phase 2-1은 §23, 2-2는 §24)

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


## 17. 피아노 입력 즉시 미리듣기 (2026-11-08)

### 자동 검증과 증거 범위

- 사용자 기준선: 기존 단위·통합 284개 및 Mac Chromium 23/23 통과(이전 §16 기록과 구분).
- `piano-preview.test.ts` 신규 20개: 준비 시 무음, 사용자 활성화, MIDI 주파수,
  단일 음성/이전 종료 취소, 빠른 입력·역순 비동기 완료, stop/dispose, 활성화 거부·재시도,
  suspended context, 잘못된 MIDI, 부분 초기화 정리, 악보 재생과 노드 수명 독립·Score 불변.
- `piano-input-preview.test.ts` 신규 9개: 포인터/호환 click 단일 입력, 키보드/접근성,
  repeat 무시, 토글, 오디오 오류와 입력 분리, 포인터 취소/여러 손가락의 최신 입력 보호,
  blur/숨김/언마운트, 잘못된 버튼, 차단된 포인터 활성화의 native click 재시도.
  React 핸들러/오디오 대역 테스트이며 브라우저 실제 이벤트·스피커 검증을 대신하지 않는다.
- 전체 `npm run test`: **28파일 / 313개 통과**(기존 284 유지 + 신규 29).
  typecheck/lint/check:architecture/build exit 0. 51 modules / 130 deps, 경계 44파일 위반 0.
- `piano-preview.spec.ts` E2E 신규 4종: 네이티브 AudioParam 주파수·oscillator 수 계측,
  빠른 입력/음소거/실제 IndexedDB/새로고침, 오디오 노드 생성 실패 후 저장·재시도,
  재생 중 미리듣기 토글 독립성, touch 탭/호환 click 중복 입력 방지.
  계측은 오디오 그래프 호출 검증이며 실제 스피커 출력이나 음질의 증거가 아니다.
- `npm run test:e2e -- --list`: **27종/7파일** 수집 성공. 전체 `npm run test:e2e`는
  **listen EPERM 0.0.0.0:3010**, exit 1로 **27종 미실행**. 기존 테스트 삭제/skip/timeout 증가 없음.

### 수동 검증 절차 — 아직 미실행

1. Mac 일반 터미널에서 `npm run test:e2e`로 전체 27종을 재검증한다.
   실제 청취는 `npm run dev` 후 http://localhost:3010 에서 악보를 열고 출력 장치/볼륨을 확인한다.
2. 미리듣기 ON에서 C4/D4/E4/G4와 검은 건반을 누르고 해당 음높이의 짧은 소리가 나는지 듣는다.
   컴퓨터 키 a/s/d/f/g 및 Enter/Space로 포커스된 건반도 확인한다.
3. 같은 음/다른 음을 빠르게 반복하고 여러 손가락으로 입력한다. 최신 음 하나만 들리고,
   이전 종료 예약에 의한 끊김·음성 누적·붙잡힌 소리가 없는지 확인한다.
4. OFF에서도 음표 추가·자동 저장·새로고침 복원이 동작하고, 다시 ON이면 다음 입력부터 소리가 나는지 확인한다.
   악보 Play 중 미리듣기 토글은 재생을 정지하지 않아야 한다. 실제 음표 편집은 기존 정책대로 재생을 정지한다.
5. Safari와 실제 iOS/Android 장치에서 최초 탭/이후 탭·가로 스크롤 취소·탭 숨김/복귀·페이지 이동을 확인한다.
   취소한 터치로 음표가 입력되거나 늦은 음이 나지 않아야 한다. 숨김/이동 시 미리듣기는 정리되어야 한다.
6. 오디오 차단/초기화 실패 시 안내와 함께 음표 입력·저장이 계속되고 다음 허용된 입력으로 재시도되는지 확인한다.
   느린 최초 번들 로딩에서는 첫 입력이 지연되거나 다음 사용자 동작이 필요할 수 있다.
7. 브라우저/OS/장치·첫 입력 지연·청취 결과를 기록한다. 실제 오디오·Safari·모바일 실기기는
   이번 자동 검사로 통과 처리하지 않는다. 지속음/동시 다성 미리듣기는 이번 짧은 단선율 입력음 범위 밖이다.


## 18. 미리듣기 재점검·동일 음 반복 및 저장/히스토리 회귀 (2026-11-08)

- 기준 `47dc6cf`에 기능이 이미 있으므로 production 코드·의존성·배포 설정은 변경하지 않는다.
- 단위 2개 보완: 어댑터의 동일 음 빠른 반복/종료 후 재입력(단일 음성·주파수·최신 종료),
  UI의 별도 동일 키 누름과 held-key repeat 구분. 미리듣기 단위는 어댑터 21개 + UI 10개다.
- 전체 단위·통합 **315개 / 28파일 통과**. typecheck/lint/check:architecture/build exit 0,
  51 modules / 130 dependencies, 경계 44파일 위반 0. 기존 313개를 유지한다.
- `piano-preview.spec.ts` 1종 추가: 오디오 초기화 실패 상태의 동일 음 3회 입력·저장,
  Undo/Redo 후 IndexedDB Score 전체 일치, 새로고침 복원, 오디오 복구 후 같은 음 재입력,
  schemaVersion 2·Part.ties·ID 중복 부재. 단순 수량뿐 아니라 저장된 전체 Score를 비교한다.
- 이전 미리듣기 4종 및 기준선 E2E 23종 유지. 전체 **28종/7파일** 수집 성공.
  `npm run test:e2e`는 **listen EPERM 0.0.0.0:3010**으로 서버 시작 실패(exit 1), **28종 미실행**.
  신규 E2E 통과나 실제 소리 검증을 주장하지 않는다. 삭제/skip/timeout 증가는 없다.
- Mac 일반 터미널에서 아래 명령으로 전체 28종을 재실행한다. 실제 청취/Safari/모바일 실기기
  검증은 §17 절차를 따른다. 짧은 단일 음성/최신 음 우선 정책 및 기존 Score 편집 시 재생 정지는 유지한다.

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

이번 작업은 GitHub push 및 Vercel 접근·설정 변경·배포를 수행하지 않는다.


## 19. 편집 커서 위치 입력 (2026-11-08)

- 사용자 기준선 `3d7cfe8`: 단위·통합 315개, Mac Chromium 28/28 통과(§18 과거 EPERM과 구분).
- `edit-cursor.test.ts` **33개**: 빈/중간 마디 삽입, 잘못된/전체 범위 밖 위치,
  잘못된·표기 불가 음가/전체 끝 초과, 음표/쉼표 충돌 시 Score·redo 이력 불변,
  기존 타이/이벤트 불변, 새 경계 타이 및 단일 지속음 병합, Undo/Redo,
  후속 타이 세그먼트 충돌 시 부분 삽입 방지, 끝 입력 보존, 2/4·3/4·4/4·6/8 좌표 변환.
- 기존 `rest-rendering.test.ts`에 **4개** 추가: 빈 구간/마디/최종 끝 tick의 SVG 선,
  실제 VexFlow tickable 기반 음표 좌표 정렬과 타이 유지. DOM 그리기 대역이며 실제 SVG 육안 검증은 아니다.
- `edit-cursor-persistence.test.ts` **1개**: 기존 타이 악보 빈 구간 삽입, Undo/Redo 후 실제 fake-indexeddb
  저장·새 repository 읽기의 전체 동등성, 충돌 뒤 원본/이력 불변. 커서가 직렬화되지 않는지 확인한다.
- 전체 **30파일 / 353개 통과**, 기존 315개(미리듣기 포함) 유지.
  typecheck/lint/check:architecture/build exit 0, 52 modules / 136 dependencies, 경계 45파일 위반 0.
- 신규 `edit-cursor.spec.ts` **3종**: 중간 위치 입력/커서 전진/SVG tick/충돌 거부/Undo/Redo/저장/재생/복원/끝 입력,
  경계 타이·기존 타이 보존·쉼표 충돌·악보 끝 초과,
  모바일 touch 6/8 박 선택·최종 tick·마디 추가 후 입력·가로 넘침 부재.
- 기존 28종 삭제/skip/timeout 증가 없이 유지. `npm run test:e2e -- --list`: **31종/8파일** 수집.
  전체 `npm run test:e2e`는 **listen EPERM 0.0.0.0:3010**, exit 1 → **31종 미실행**.
  브라우저 데이터 보존/커서 이동·삽입 성공을 자동 검증 완료로 기록하지 않는다.

Mac 일반 터미널:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

수동 확인(미실행):

1. `npm run dev` → localhost:3010 에서 새 악보를 열고 “편집 커서에 입력” 선택.
   3마디 2박으로 이동해 위치 문구와 해당 마디의 파란 SVG 선을 확인한다(가로 스크롤 포함).
2. 건반 입력 후 음표가 그 자리에 생기고 커서가 음가만큼 전진하는지 확인한다. 빠른 키 입력도 다음 위치에 순서대로 입력되어야 한다.
3. 기존 음표/쉼표 자리로 이동해 입력한다. 거부 안내·위치/원본 유지, 이후 Undo/Redo 및 새로고침 복원을 확인한다.
4. 1마디 마지막 박에서 2분음표를 넣어 기존 경계 타이를 확인한다. 악보 마지막 박에서 같은 길이는 거부되어야 한다.
   마지막 끝 tick에서 마디 추가 후 입력이 가능해야 한다. 겹침을 피하려 자동 이동하거나 이벤트를 밀면 안 된다.
5. Undo/Redo/박자 변경 후에도 동일한 절대 tick 정책, 새로고침 후 끝 입력 모드 복귀,
   “악보 끝에 입력” 전환 후 마지막 이벤트 뒤 입력과 기존 미리듣기·재생을 확인한다.
6. 실제 모바일/Safari에서 마디·소수 박 입력/이동·터치·스크롤과 SVG 위치를 확인한다.
   UI 폼은 터치/키보드용이며 악보 픽셀 클릭 입력은 제공하지 않는다. 실제 소리는 §17 절차로 별도 확인한다.

Score/Command/Repository/Tone 및 schemaVersion 2/Part.ties/의존성/기본 아키텍처 유지.
GitHub push 및 Vercel 설정·배포 변경은 수행하지 않는다.


## 20. 명시적 수동 저장 (2026-11-08)

- 사용자 기준선 `e89ac0d`: 단위·통합 353개, Mac Chromium **31/31 통과**(§19 과거 EPERM과 구분).
- `manual-save-button.test.ts` 신규 **6개**: 연속 클릭 단일 요청/버튼 잠금, 성공 뒤 추가 편집 시
  이전 완료 숨김, 실패/재시도·백업 안내, handle 부재의 거짓 성공 방지, 예상 밖 거부, 언마운트 후 늦은 UI 결과 무시.
  React 핸들러 대역 검증이며 실제 DOM/모바일 검증은 E2E와 별도 수동 확인이 필요하다.
- 기존 `autosave.test.ts`에 **3개** 추가: 동시 명시적 flush의 동일 Promise/중복 쓰기 부재,
  느린 자동 저장 + 수동 저장 + 추가 편집/자동 저장의 직렬화·최신 snapshot 일치,
  실제 fake-indexeddb put 성공 뒤 transaction abort 시 기존 원시 레코드/메모리 Score/편집 이력 불변 및 재시도/새 repository 복원.
- 전체 **31파일 / 362개 통과**(기존 353 유지). typecheck/lint/check:architecture/build exit 0.
  아키텍처 53 modules / 139 dependencies, 경계 46파일 위반 0. 초기 테스트 코드 타입/린트 오류는 수정 후 재검증했다.
- `manual-save.spec.ts` 신규 **4종**: 시계를 멈춘 디바운스 상태의 수동 저장·Undo/Redo·실제 DB/새로고침,
  네이티브 IndexedDB transaction을 읽기 요청으로 지연시켜 연속 클릭·추가 편집·최신 제목 저장 및 쓰기 수 검증,
  transaction abort의 전체 원시 레코드 보존·재시도, 모바일 touch·44px 버튼·가로 넘침/저장·복원.
- 기존 31종 유지, `npm run test:e2e -- --list` **35종/9파일** 수집 성공.
  전체 `npm run test:e2e`는 **listen EPERM 0.0.0.0:3010**, exit 1 → **35종 미실행**.
  신규 DOM/네이티브 transaction 계측이 브라우저에서 통과했다고 주장하지 않는다. 삭제/skip/timeout 증가 없음.

Mac 일반 터미널 재검증:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

수동 확인(미실행):

1. `npm run dev` → localhost:3010에서 악보를 편집한 직후 상단 “저장”을 누르고 최신 저장 완료 안내를 확인한다.
   저장 버튼을 여러 번 누르고, 처리 중에도 음표·제목(제목 변경 적용)을 더 편집해 마지막 값이 저장되는지 확인한다.
2. Undo/Redo 후 저장 및 새로고침으로 정확한 제목/음표/타이가 복원되는지 확인한다. 수동 저장 후에도
   추가 편집만으로 자동 저장이 계속되는지 확인한다. 미적용 폼 입력값은 저장 대상 Score가 아님을 구분한다.
3. 저장 실패 시 안내/재시도/JSON 백업, 원본 유지와 편집 내용 유지 확인은 신규 실패 주입 E2E를 사용한다.
   사용자 실제 악보나 브라우저 데이터를 삭제하는 방식으로 오류를 만들지 않는다.
4. 실제 모바일·Safari에서 버튼 터치/포커스/오류·완료 안내를 확인한다. 강제 종료·탭 닫기/뒤로가기/직접 URL 이탈의
   미완료 저장 및 다중 탭의 정상 레코드 충돌은 기존 미해결 범위이며 수동 저장이 자동 해결하지 않는다.

Score 모델/Part.ties/schemaVersion 2/기존 저장소와 Command/Undo/Redo 유지. GitHub push/Vercel 작업 없음.


## 21. ADR-010 저장 안전성 (2026-11-08)

기준 `8d570b0`: 사용자 Mac Chromium **35/35**, 단위·통합 362개 통과.
기존 Codex EPERM 기록은 당시 결과로 유지하며 새 버전 통과로 대체하지 않는다.

- 기존 362개 시나리오/핵심 assertion 유지. create/update 분리로 setup 호출과 spy를 새 포트에 맞췄다.
  삭제의 null 기대는 더 엄격한 DELETED/Tombstone 보호로 변경했다.
  `tests/fixtures/persist.ts`는 기존 단일 writer fixture용 read/create/update setup이며 production/경합 테스트에서는 사용하지 않는다.
  기존 손상 저장본의 직접 save 거부·원시 불변 assertion도 유지한다.
- `storage-concurrency.test.ts` 신규 22개: 동시 생성/동일 revision 저장, save/delete 양쪽 순서,
  Tombstone stale save/create/직접 open, 오래된 목록 삭제 거부, put 후 abort 원시+revision 불변/무알림,
  legacy revision 0 읽기 불변·지연 쓰기, blocked 원시 보존, versionchange 연결 폐쇄 및 구버전 v1 open 거부,
  BroadcastChannel 미지원/초기화 실패/전송 실패에도 CAS 유지, 알림 payload/수명 검증,
  동시 최초 열기의 승자 읽기(쓰기 재시도 없음), 런타임 null/undefined/음수/소수/NaN revision 거부.
- autosave 신규 5개: 동일 내용 flush의 실제 revision 확인·이후 모든 쓰기 차단/히스토리 보존,
  알림 없는 삭제 차단, 중복/지연/잘못된 revision 힌트 후 DB 검증,
  dirty-only beforeunload·hidden 조기 저장·focus/pageshow 재확인·cleanup, 충돌 후 타이·Undo/Redo 보존.
- SaveButton 신규 2개: 수동 실패 뒤 자동 성공 시 오래된 오류 제거, 충돌/삭제 시 비활성화/백업 안내.
- 전체 **32파일 / 391개 통과**(기존 362 + 신규 29). fake-indexeddb의 실제 readwrite transaction/abort와
  원시 레코드 전체 동등성을 검사했다. 사용자의 실제 브라우저 저장소에 마이그레이션을 실행하지 않았다.
- `npm run typecheck`, `npm run lint`, `npm run check:architecture`, `npm run build` 결과는 TASKS 최신 절 참조.
- E2E 신규 6개(`storage-concurrency.spec.ts`): 같은 context 두 탭 동시 저장/메모리·Undo·JSON·새 ID 보존,
  실제 타 탭 삭제/알림/직접 URL Tombstone 보호, stale 목록 삭제, BC 없는 동일 내용 저장/최신본 재열기,
  수동 실패 후 자동 성공 UI, 실제 beforeunload 취소 및 synthetic hidden 조기 저장/새로고침.
- 기존 35개 유지. 손상 저장본 주입 helper의 DB open은 고정 v1 대신 현재 DB를 연다(원시 레코드와 무쓰기 검증 그대로).
  `npm run test:e2e -- --list`: **41종/10파일 수집 성공**.
- `npm run test:e2e`: 서버 시작 시 **listen EPERM 0.0.0.0:3010**, exit 1 → **41종 미실행**.
  새 브라우저 충돌/데이터 보존 검증은 완료로 표시하지 않는다. timeout 증가/skip/테스트 삭제 없음.

Mac 일반 터미널:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

수동 인수: 기존 앱 탭을 연 채 새 버전 열기 → blocked 안내/기존 탭 JSON 백업·닫기 → 새 앱 다시 열기,
두 탭 편집/삭제·백업·새 ID·최신본 선택, 실제 백그라운드 전환·뒤로가기/BFCache·새로고침,
Safari/모바일에서 이탈 안내 제한을 확인한다. OS 강제 종료·배터리/전원 차단 시 마지막 편집 무손실은
보장하지 않는다. Web Locks/복구 저널은 미구현(승인 범위 제외). 완료된 transaction과 아직 미커밋 편집을 구분한다.


## 22. ADR-010 이탈 취소 E2E 대기 수정 (2026-11-08)

- 기준 `c24bc0a`, clean. 사용자 Mac 결과 **40/41 통과**, 단위·통합 391개 통과.
- 원본 trace/error-context 분석: beforeunload dialog 발생(72085.367ms), type 검증 통과,
  dismiss 완료(72087.584ms). 그러나 page.reload는 새 document의 load를 기다리며 종료되지 않았다.
  약 60초 후 test timeout/teardown에서 reload가 reject했고 catch가 이를 삼킨 뒤 heading expect가
  시작됐다(131785.468ms). locator 충돌이나 제목 불일치로 60초 기다린 것이 아니다.
- error-context에는 제목 heading 및 textbox에 “숨김 전환 최신 편집”, 저장 중 상태와 기존 편집기가 남아 있다.
  취소 이후 제목 보존을 확인할 수 있으며 이 기록에서 실제 Score 유실은 발견되지 않았다.
  과거 실행의 IndexedDB dump/전체 메모리 Score는 없으므로 그 전체 동등성을 추정하지 않는다.
- Playwright 1.65.0 로컬 소스도 reload가 waitForNavigation(newDocument=true)를 기다리고,
  evaluate는 JS 실행 결과만 기다리는 것을 확인했다. dialog listener 등록 순서는 이미 올바르다.
- `storage-concurrency.spec.ts`의 해당 시나리오만 수정: 미리 dialog listener를 등록하고
  location.reload 요청/evaluate와 dismiss를 함께 기다린다. 실제 새로고침을 취소하므로 새 load 이벤트는 기다리지 않는다.
  catch로 모든 reload 오류를 무시하던 코드를 제거했다. 마지막 저장 후의 정상 page.reload는 유지한다.
- 검증 강화: 이탈 직전 제목 표시, 취소 후 동일 document 객체·제목·원시 DB baseline 불변,
  hidden 이후 저장 제목 및 revision +1, 정상 새로고침 뒤 커밋된 원시 레코드 전체 동등성.
  timeout 증가/expect 삭제/skip/시나리오 삭제 없음. 앱/Score/schemaVersion 2/Part.ties/OCC/Tombstone 변경 없음.
- 단독 실행 `npm run test:e2e -- tests/e2e/storage-concurrency.spec.ts:122`:
  **listen EPERM 0.0.0.0:3010**, exit 1 → 해당 1종 미실행.
- 전체 재검증: 단위·통합 **32파일 / 391개 통과**, typecheck/lint/architecture/build exit 0.
  아키텍처 53 modules / 139 dependencies, 경계 46파일 위반 0.
- 전체 E2E 최초 시도는 병행 build의 잠금으로 시작 실패했다. build 종료 후 순차 재시도한
  `npm run test:e2e`도 **listen EPERM 0.0.0.0:3010**, exit 1 → **41종 미실행**.
  `--list`는 기존 **41종/10파일** 수집 확인. 수정 버전의 브라우저 통과로 간주하지 않는다.
- 원본 실패 증거는 실행 전 `/tmp`에 해당하는 macOS 임시 디렉터리
  `/var/folders/35/m6dppg413h39y02j8j16qq3h0000gn/T/music-score-c24bc0a-beforeunload-l5q8osl0/`
  에 trace.zip/error-context.md를 복사 보존했다(임시 경로, Git 제외).

Mac 재검증 순서:

```bash
npm run test:e2e -- tests/e2e/storage-concurrency.spec.ts:122
npm run test:e2e
```

### 이후 사용자 Mac 검증 결과

- 사용자가 Mac 일반 터미널에서 수정된 테스트를 포함한 Chromium E2E **41/41 통과**를 확인했다.
  위 Codex 환경의 listen EPERM 및 수정 전 Mac 40/41 기록은 당시 결과로 유지한다.
- 수정된 이탈 경고·취소 후 편집 보존·hidden 조기 저장·IndexedDB 커밋·새로고침 복원 시나리오를
  포함한 전체 41종의 성공 결과다. Codex에서 직접 실행한 결과로 표기하지 않는다.
- 최종 diff 검토: 기존 검증 의미 유지, 동일 document/원시 레코드/revision 검증 강화,
  테스트 삭제·skip·timeout 증가 없음. 변경은 해당 E2E 및 TEST_PLAN/TASKS 3파일에 한정한다.

남은 검증: 실제 Safari/모바일 백그라운드 전환. 강제 종료 무손실은 이번 테스트 수정으로
보장하지 않는다. GitHub/Vercel 작업 없음.


## 23. Phase 2-1 조옮김 순수 도메인 엔진 (2026-11-08)

- 기준 `c0e3951`, clean. 기존 단위·통합 391개 및 사용자 Mac Chromium 41/41 통과를 기준선으로 유지한다.
- 신규 `tests/unit/transpose.test.ts` **79개**:
  - C→D/C#/Db 목표 철자, 장조/단조, up/down/nearest 및 +6 동률, 0/옥타브/복합 음정.
  - E#/F, B#/C, Cb/B, 이명동음 조성의 MIDI 무변화·문자 이동, 표기 옥타브 경계.
  - 변형 단음계 음/반음계/겹임시표, 개별 음의 임의 재표기 금지 및 alter/MIDI/옥타브 초과 거부.
  - 자동 선택의 표현 가능성 우선, 조표 단순성, 다중 Part 동률에서 기존 샵 성향, 중립 고정 우선순위.
  - 다중 Part의 다른 조표·혼합 모드 보존, 후속 Part의 지원 불가 조표/MIDI 실패 시 전체 원본 불변.
  - 동결 원본으로 타이/쉼표/리듬/ID/velocity/provenance/모든 메타데이터 보존과 부분 후보 부재.
  - 타이 세그먼트의 동일 Pitch 및 mergeTiedNotes의 단일 지속음 유지.
  - 잘못된 입력/중간 정수 연산/원본 Score/모순된 조표/장단조 변환 거부, 기존 SetKeySignature 회귀.
- 위 79개 중 1개는 지원 같은 모드 조표 450쌍 × 3방향 = **1,350 조합**을 순회한다.
  모든 성공 결과의 목표 tonic/alter·조표·방향·전체 Score 유효성을 검사한다. 이를 별도 1,350개 테스트로 세지 않는다.
- 전체 **33파일 / 470개 통과**(기존 391 + 신규 79), 테스트 삭제/skip/기대값 약화 없음.
  typecheck/lint/check:architecture/build 결과는 TASKS 최신 검증 표에 기록한다.
- 엔진은 순수 후보 계산으로 저장/Command/Undo 이력을 변경하지 않는다. Command 및 미리보기/취소,
  Undo/Redo, 조옮김 후 실제 IndexedDB/OCC·브라우저 기보/재생은 Phase 2-2 이후 통합 검증 대상이다.
- 기존 `tests/e2e/` 41종은 수정하지 않았고 이번에는 **미실행**이다. UI/브라우저 연결이 없는 순수 도메인 단계이므로
  브라우저 실행이 불필요하며 이번 작업의 EPERM 실패로 표기하지 않는다. 이전 EPERM/이후 사용자 성공 기록은 유지한다.
- Score schemaVersion 2/Part.ties/저장 모델/ADR-010/기존 SetKeySignature/피아노 고정 매핑/라이브러리 유지.
  GitHub push 및 Vercel 접근·배포·설정 변경 없음.

## 24. Phase 2-2 TransposeScore Command / Undo·Redo (2026-11-08)

- 기준 `1c74de4`, clean 및 현재 브랜치 포함 확인. Phase 2-1 엔진/79개 테스트는 무변경.
- 신규 transpose-command.test.ts **30개**: 엔진 결과/호출 1회, C→D/C#/Db·방향 전달,
  타이/쉼표/리듬/velocity/provenance/메타데이터 snapshot Undo/Redo, JSON v2 round-trip,
  **10 Part·500음표의 단일 이력·알림**, 같은 목표/0반음/빈·쉼표 옥타브 no-op,
  property order/주입 timestamp와 실제 내용 구분, MIDI 0 이명동음의 실제 편집,
  AddNote/SetKeySignature 혼합 이력, 정상 편집 후 redo 초기화, no-op/실패 후 redo 보존,
  MIDI 상·하한/표기/미지원 조표/장단조/잘못된 입력·Score/후속 Part 실패 원자성.
- 기존 autosave 테스트에 신규 **7개**: dispatch→기존 flush→DB revision·Undo/Redo 복원,
  no-op/실패의 saved 상태·redo·원시 레코드·revision·무알림/무쓰기,
  dirty 상태의 400ms 기한 유지, 저장 오류 중 무재시도,
  실제 IndexedDB adapter + fake-indexeddb의 다른 writer CAS/Tombstone/put 후 abort 원본 보호.
  React 훅 effect/상태는 기존 대역이다. 실제 브라우저 UI 검증이라고 주장하지 않는다.
- 신규 선택 실행 및 Phase 2-1 79개 통과. 전체 **34파일 / 507개 통과**(기존 470 + 신규 37).
  테스트 삭제/skip/기대값 약화/중복 계산 없음. typecheck/lint/architecture/build exit 0.
  아키텍처 55 modules / 153 dependencies, 경계 48파일 위반 0.
- 전체 `npm run test:e2e`: 서버 시작 시 **listen EPERM 0.0.0.0:3010**, exit 1 → **41종 미실행**.
  E2E 소스 무변경. 사용자 기존 Mac 41/41과 이번 버전 미실행을 구분한다.
- UI/미리보기/렌더러/재생/IndexedDB 구현·스키마/ADR-010/Score 모델·라이브러리 변경 없음.
  Phase 2-3 미리보기·취소·확정, Phase 2-4 화면 저장 경합은 미구현/미검증이다.

Mac 재검증:

```bash
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

GitHub push/Vercel 작업 없음. 강제 종료 무손실 보장은 추가하지 않는다.

## 25. Phase 2-3 조옮김 미리보기 / 확정 / 취소 (2026-11-08)

- 기준 `848b7c8`, clean 및 Phase 2-1/2-2 커밋 포함 확인.
  사용자 기준선 단위·통합 507개, Mac Chromium 41/41 성공과 이번 실행 결과를 구분한다.
- 신규 transpose-preview.test.ts **23개**: 패널 열기/현재 조성/지원 장·단조 목록/nearest/+6 방향,
  순수 엔진 후보 및 timestamp 유지, 취소/Escape 후 원본·redo·저장 상태 유지,
  단일 dispatch/Undo·Redo/중복 클릭, no-op redo 유지, MIDI 0 이명동음 실제 편집,
  Command 실패·재시도/음역 오류/잘못된 옵션, 편집·Undo·Redo·같은/다른 ID 세션 stale,
  revision-only 변경, React props 갱신 전 conflict/deleted/error, handle 소멸·준비 전 차단,
  다중 Part 후보/타이 보존 및 첫 Part 표시 정책 안내.
- autosave.test.ts 신규 **2개**: 동기 getter 무IO, 실제 저장 전후 revision/status 및 실패·충돌 상태.
  transpose-playback.test.ts 신규 **2개**: preview-open의 기존 재생 정지/메트로놈 유지,
  오디오 초기화 대기 중 열었을 때 늦은 재생 결과 정리. Tone 엔진은 대역이며 실제 오디오 검증이 아니다.
- 위 컴포넌트 테스트는 기존 프로젝트 방식대로 React hooks/element tree 대역과 실제 Store/Command/엔진을 사용한다.
  실제 React DOM 포커스·SVG·네이티브 선택·두 탭 동작은 E2E 및 수동 인수에서 검증해야 한다.
- 기존 507개와 Phase 2-1 79개/2-2 Command 30개/ADR-010 테스트를 삭제하거나 약화하지 않는다.
  최종 전체 단위·통합 및 정적 검사 결과는 TASKS 최신 표에 기록한다.
- 신규 transpose-preview.spec.ts **5종**:
  1. C→D 후보 SVG 확인·취소, 원시 레코드/revision/커서 보존, 기존 Undo/Redo 유지.
  2. 확정 후 D 조표/모든 MIDI 및 F#4 표시, 단일 Undo/Redo, 저장·새로고침 복원.
  3. 미리보기 중 제목 편집 후 오래된 확정 차단 및 실제 편집만 보존.
  4. 같은 context 다른 탭 저장 알림 후 확정 차단, 상대 최신 원시 레코드 보존.
  5. 다른 탭 삭제 알림 후 확정 차단, Escape 취소 및 Tombstone 불변.
- 기존 E2E **41종 무변경**, 합계 **46종/11파일 수집 성공**.
  전체 `npm run test:e2e`는 production build 후 **listen EPERM 0.0.0.0:3010**, exit 1로 서버 시작 실패.
  **46종 브라우저 미실행**이며 수집 성공이나 과거 Mac 41/41을 신규 기능 통과로 표기하지 않는다.
  당시 필수 브라우저 검증 전 로컬 커밋을 보류하고 변경 파일을 유지했다.

Mac 재검증:

```bash
cd /Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e -- tests/e2e/transpose-preview.spec.ts
npm run test:e2e
```

수동/Phase 2-4 인수 대기: 장·단조/이명동음/겹임시표 SVG 시각 확인, 조옮김 후 실제 오디오·타이 지속음,
Safari/모바일 선택·Escape/포커스, 미리보기 중 원본 재생 재시작 시 후보 하이라이트 분리,
실제 두 탭 저장·삭제 및 확정 직후 저장 경합, 충돌 복구 선택지. 강제 종료 무손실은 보장하지 않는다.
Phase 2-4 기능은 구현하지 않는다. GitHub push/Vercel 작업 없음.

### Phase 2-3 최종 사용자 Mac 검증 및 검토

- 사용자가 수정된 현재 구현으로 Chromium Playwright **46/46 통과**를 확인했다.
  기존 41개 및 신규 조옮김 미리보기 5개 모두 성공했다. 위 Codex EPERM 기록은 당시 결과로 유지한다.
  사용자 Mac 실행 결과이며 Codex에서 브라우저를 실행한 것으로 표기하지 않는다.
- 단위·통합 **534/534**, typecheck/lint/architecture/build 통과 확인.
- 추적 파일 7개와 신규 파일 5개를 포함한 총 12파일의 최종 변경 범위를 검토했다.
  후보 생성·취소는 Store/편집 이력/저장 무변경, 확정은 기존 Command 한 번,
  session/revision 불일치와 conflict/deleted/error 차단을 유지한다.
  BroadcastChannel은 알림이고 최종 저장은 기존 IndexedDB OCC가 보호한다.
- Score schemaVersion 2/Part.ties/기존 Command·음악 이론 엔진/IndexedDB 쓰기 경로/ADR-010 변경 없음.
  기능 추가·리팩터링·Phase 2-4 구현 없이 검증된 Phase 2-3 파일만 로컬 커밋한다.
  실제 오디오/Safari/모바일 및 위 Phase 2-4 수동 인수 항목은 별도로 남긴다.

## 26. Phase 2-4 조옮김 기보·재생·저장 통합 검증 (2026-11-08)

- 시작 상태: main, HEAD `45c15f8`, clean. 기존 534개 및 사용자 Mac Chromium 46/46 성공을 기준선으로 보존한다.
- 신규 `tests/integration/transpose-consistency.test.ts` **9개**:
  - C장조→D/Db/C# 및 A단조→B단조: 실제 VexFlow key/음표 철자/임시표 객체와 Tone Frequency(midi,"midi") 입력의 일치.
  - 일반음의 90% gate/절대 tick 간격, 반음계 샵·겹샵·제자리표/반복 임시표 처리.
  - B#4/C5의 동일 MIDI·상이한 오선 위치(3/3.5), Cb4의 표기 옥타브와 MIDI 59.
  - 쉼표·마디 경계 타이/60 BPM에서 단일 어택·2초 지속, Undo/Redo 후 재생 MIDI 및 기보 동등성.
  - 실제 IndexedDB adapter의 저장/repository 재열기·revision2·JSON 내보내기/새 ID 가져오기 후
    전체 Part/ties 및 동일 기보/스케줄 데이터. JSON에 revision 필드 없음/schemaVersion2 유지.
  - 복수 Part의 변환·저장 동등성, 기존 첫 Part만 기보·재생하는 제한 명시(동시 다중 Part 재생 검증이 아니다).
  - 알림 구독 없는 두 저장소의 동시 조옮김 CAS: 한 승자, DB2/원시 레코드 보존,
    패자의 메모리·Undo/Redo 유지, 재시도 거부, Tombstone 후 저장/직접 URL용 openOrCreateScore 차단·원시 Tombstone 불변.
- `tests/unit/transpose-playback.test.ts` **1개 추가**: 원본 재생 중 조옮김 Command 확정 후 기존 핸들 정리,
  다음 Play/Undo/Redo에서 각각 현재 Score 전달. 기존 2개 검증은 유지한다.
- 대역 경계: 실제 VexFlow tickable/accidental 계산을 사용하되 Renderer/Stave/Formatter/그리기는 대역이다.
  Tone Frequency 입력과 triggerAttackRelease 데이터를 캡처하며 오디오 초기화/합성/실제 주파수 출력을 실행하지 않는다.
  React hooks/element tree는 기존 프로젝트 대역, DB는 fake-indexeddb다. 실제 DOM·오디오 실측과 구분한다.
- 전체 **37파일 / 544개 통과**(기존 534 + 신규 10). typecheck/lint/check:architecture/build exit 0.
  아키텍처 57모듈/163의존성, 경계 50파일 위반 0. 제품 코드 및 기존 46종 E2E 변경 없음.
- 신규 `tests/e2e/transpose-integration.spec.ts` **3종**:
  1. 한 시나리오에서 D/Db/C# 각각: SVG notehead 실제 y/조표 glyph/타이,
     후보·원본 분리, 확정/단일 Undo/Redo·DB Pitch/ties, 저장·새로고침·악보함 재열기·재생 상태 확인.
  2. 재생→미리보기 진입 정지→취소 원시 불변, 미리보기 중 원본 재생의 하이라이트 분리,
     재생 중 확정 정지·위치 초기화 및 다시 재생한 D4 하이라이트.
  3. BroadcastChannel 미지원 두 탭의 조옮김/입력 동시 수동 저장, 한 revision 커밋,
     패자 메모리·Undo/Redo 유지·자동 저장/덮어쓰기 차단. 기존 삭제 알림 E2E는 그대로 유지한다.
- `npm run test:e2e -- --list`: **49종/12파일 수집 성공**. 전체 `npm run test:e2e`는
  production build 후 **listen EPERM 0.0.0.0:3010**, exit 1. **브라우저 49종 미실행**이다.
  과거 사용자 Mac 46/46 성공을 신규 3종의 성공으로 간주하지 않는다. Phase 2-4 최종 검증 및 커밋은 보류한다.

Mac 재실행:

```bash
cd /Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e -- tests/e2e/transpose-integration.spec.ts
npm run test:e2e
```

남은 수동 인수: 실제 SVG 시각·폰트/임시표/겹임시표/옥타브 경계, 스피커 오디오 청취 및 타이 지속음,
Safari/모바일 실기기, 재생 중 조옮김 확정의 실제 note-off, 브라우저 두 탭 저장·삭제 동작.
코드 조사와 실행한 데이터 테스트에서 새 제품 결함은 재현되지 않았다. 첫 Part 표시/재생 제한은 기존 계약이며
완전한 다중 Part 동시 기보·재생으로 보고하지 않는다. 강제 종료 무손실 보장은 없다.
Phase 2-5 인수인계: label은 확정된 Score의 Pitch.step/alter/octave에서 파생하고 MIDI만으로 철자를 재생성하지 않는다.
E#/B#/Cb·장/단조·Undo/Redo/저장 복원을 표시 회귀에 재사용할 수 있다. 계이름/음이름 기능은 이번에 구현하지 않았다.

## 27. Phase 2-5 음이름·고정도법 표시 (2026-11-08)

- 기준 main/HEAD `1437418`, clean 확인. 기존 단위·통합 544 및 사용자 Mac Chromium **49/49 통과**를
  기준선으로 보존한다. §26/당시 Codex EPERM 및 수정 전 Mac 48/49 기록을 삭제하지 않는다.
- 신규 단위·통합 **30개**:
  - note-labels.test.ts **16개**: C/C#/Db/E#/B#/Cb, 모든 고정도 음이름, alter ±2, octave 0/9,
    동일 MIDI의 상이한 철자, none/null, 입력 불변, 조표 중복 적용 없음, 세 선택 값/잘못된 값 무시.
  - note-label-rendering.test.ts **10개**: 기본 none/모드 변경, 타이 머리만·쉼표 제외,
    Annotation 소유 이벤트/읽기 전용 SVG 속성, D/Db/C#의 철자와 Undo/Redo,
    조밀한 32분음표 마디 확장, 외곽 viewBox, 재렌더 하이라이트 유지,
    4개/32개 라벨 + 큰 7샵 조표 공간에서 마디 경계 준수.
  - autosave.test.ts **3개** 추가: 모드 변경 시 Store 알림/dirty/Redo/timestamp/DB revision/IO 불변,
    conflict/deleted 상태 유지와 무재시도. transpose-preview.test.ts **1개** 추가: mode만 후보에 전달,
    원본/session/revision/확정 가능 상태 유지·무dispatch/취소 불변.
- Node는 Canvas 폰트 측정이 없어 VexFlow Annotation.getWidth와 큰 조표 시작 여백에 결정적 대역을 사용한다.
  실제 Annotation/StaveNote/Formatter의 연결·간격 계산을 검사하되 SVG 그리기는 대역이다.
  이 경계 테스트로 새 구현의 조표 여백 미차감에 따른 우측 초과를 먼저 재현한 뒤,
  labelled 모드의 실제 note-start inset과 format 폭만 최소 수정했다. 수정 후 경계 테스트 통과.
  React hooks/controlled element 및 fake-indexeddb 대역도 실제 DOM·오디오·기기 폰트와 구분한다.
- 전체 **39파일 / 574개 통과**(기존 544 + 신규 30). typecheck/lint/check:architecture/build exit 0.
  아키텍처 59모듈/170의존성, 경계 52파일 위반 0. 기존 음악 이론/Command/ADR-010 검증 유지.
- 신규 note-labels.spec.ts **3종**:
  1. none→letter→fixed-do→none, SVG 라벨/경계·겹침 확인, 음표 선택/편집 커서/Redo 유지,
     실제 IDB put 호출 0 및 원시 레코드/Score/updatedAt/revision 동등성.
  2. D/Db/C# 후보의 원본/후보 분리, 취소 원시 불변, 미리보기 도중 표시 변경 후 확정 가능,
     확정/Undo/Redo 시 고정도 및 실제 Pitch 일치.
  3. 타이 머리만·쉼표 제외·수정 후 라벨 갱신, 재생 중 표시 전환과 메트로놈/하이라이트 유지,
     JSON 백업 동일성, 새로고침 Score 복원/none 기본값 및 라벨 재표시.
- 기존 **49종 E2E 무변경**, **52종/13파일 수집 성공**.
  전체 npm run test:e2e는 production build 후 **listen EPERM 0.0.0.0:3010**, exit 1로 시작 실패.
  **브라우저 52종 미실행**, 사용자 Mac의 과거 49/49를 이번 신규 UI의 성공으로 간주하지 않는다.
  당시 사용자 지시에 따라 변경을 보존하고 로컬 커밋을 보류했다.

Mac 검증 명령:

```bash
cd /Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e -- tests/e2e/note-labels.spec.ts
npm run test:e2e
```

남은 수동 인수: Unicode/Hangul/𝄪/𝄫 폰트, 매우 높거나 낮은 음역·다중 행·타이·기둥과 라벨 간격,
모바일 실제 화면에서 스크롤/선택/터치, Safari, 실제 오디오 청취 및 표시 전환 중 음성 연속성.
자동 데이터 테스트만으로 스피커·실제 SVG 시각 검증을 주장하지 않는다. 강제 종료 무손실 보장은 없다.
Phase 2-6은 formatNoteLabel/기존 midiFromSpelling/transposeScore와 검증된 Pitch를 재사용할 수 있으며
음역 계산·추천 UI/상태는 이번에 추가하지 않았다. GitHub push 및 Vercel 작업 없음.

### Phase 2-5 최종 검토 및 사용자 Mac 검증 결과

- 사용자가 Mac에서 Chromium E2E **52/52 PASS**를 직접 확인했다. 기존 49개와 라벨 신규 3개를 포함한다.
  위 Codex listen EPERM 기록은 당시 결과로 보존하며 Codex 브라우저 실행 성공으로 표기하지 않는다.
- 단위·통합 **574/574 PASS**, typecheck/lint/architecture/build PASS를 확인했다.
- 추적 11파일 + 신규 5파일의 총 16파일을 검토했다. 음악 철자/고정도법/로컬 모드 상태,
  VexFlow Annotation·원본/후보 전달, 타이·쉼표/하이라이트, 무dispatch·무저장 계약을 유지한다.
  기존 Score v2/Command/Undo·Redo/IndexedDB DB2/ADR-010 경로 및 음악 이론 조옮김 엔진 변경 없음.
- 실제 오디오 청취, Safari·모바일 실기기 및 앞서 명시한 폰트·극단 음역·다중 행 인수는 별도다.
  Phase 2-6은 구현하지 않았으며 GitHub push/Vercel 작업은 수행하지 않는다.

## 28. Phase 2-6 음역 분석 및 조옮김 추천 (2026-11-09)

- 기준 main/HEAD `cbac282`, clean. 단위·통합 574 및 사용자 Mac Chromium 52/52 통과를 기준선으로 유지한다.
- 신규 단위·통합 **40개**:
  - score-range.test.ts **19개**: 단일/복수 음표, 전체/Part별 분석, 빈/쉼표, 타이의 이벤트/발음 수,
    반복 음과 같은 MIDI 이명동음 철자, 복수 Part의 극값, 원본 동결/극값 Pitch 복사,
    숫자 MIDI 0/127 분석과 invalid octave Score의 추천 거부, 잘못된 목표 범위 6종,
    전체 적합 우선/근거리/상행 동률/엔진 Db·Gb 철자, +24 옥타브 추천, 단조/중복 제거,
    no-fit/부분 위반/타이 발음 수, 미지원 조표/MIDI·octave·alter 거부 및 실패 사유,
    동일 입력의 결정적 결과·모든 후보의 기존 엔진 재실행/전체 검증/ID·메타데이터·타이/리듬 일치.
  - range-recommendations-ui.test.ts **11개**: 실제 분석 표시, 목표 MIDI 이름/계산/선택 callback,
    목표 변경 즉시 이전 결과/콜백 무효화, 부분 적합·개별 초과량, 잘못된 입력 5종,
    빈 Score, disabled 상태, MIDI0 이름의 표시 전용 사용과 원본 보존.
  - transpose-preview.test.ts **9개 추가**: 읽기 전용 전체 음역/옥타브 선택→단일 Command/Undo·Redo,
    취소/No-op과 Redo 보존, 목표 변경 후 이전 confirm 차단, 수동 조성 전환,
    편집/revision/conflict/deleted/error 시 오래된 추천 선택·확정 모두 차단.
  - autosave.test.ts **1개 추가**: 실제 IndexedDB adapter+fake-indexeddb 및 기존 훅에서 분석/추천만으로
    Store 알림·이력·timestamp/저장 상태/revision/원시 row/JSON 불변, Repository IO 0 확인.
- UI/훅은 기존 React 대역 패턴으로 검사한다. 단순 element tree와 데이터 검사이며 실제 브라우저 인수와 구분한다.
  기존 엔진·Score 검증 및 ADR-010 테스트/기존 574개를 삭제하거나 약화하지 않았다.
- 전체 **41파일/614개 통과**. typecheck/lint/check:architecture/build exit 0.
  아키텍처 62모듈/186의존성, 경계 55파일 위반 0. 혼합 `type Score` import의 검사기 오탐은 import 분리로 해결했으며 규칙/예외는 추가하지 않았다.
- 신규 range-recommendations.spec.ts **3종**:
  1. 음역/이벤트·발음 수 표시, 목표 입력→+2 추천→취소의 실제 IDB put 0/원시 레코드 보존,
     +24 추천→라벨/미리보기→확정→Undo/Redo→저장/새로고침의 음역 및 Score v2 동등성.
  2. 목표 입력 변경 시 선택 후보/확정 무효화, 추천 중 원본 제목 편집 후 오래된 선택·확정 차단.
  3. 다른 탭 저장/삭제 각 상황에서 추천 선택 차단, 최신 원시 row/Tombstone 불변.
- 기존 E2E **52종 무변경**. 합계 **55종/14파일 수집 성공**.
  전체 `npm run test:e2e`는 production build 후 **listen EPERM 0.0.0.0:3010**, exit 1로 서버 시작 실패.
  **브라우저 55종 미실행**이며 과거 사용자 Mac 52/52를 이번 버전 성공으로 간주하지 않는다.
  사용자 지시에 따라 변경을 보존하고 로컬 커밋 보류한다.

Mac 재검증:

```bash
cd /Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e -- tests/e2e/range-recommendations.spec.ts
npm run test:e2e
```

남은 인수: 실제 브라우저의 추천 입력/상위 후보 선택·옥타브/부분 적합 설명, 두 탭/이탈,
Safari·모바일 실기기, 기보/라벨 폰트/타이와 실제 오디오 청취, 큰 악보의 계산 응답성.
목표 음역은 수치상 MIDI 범위이며 악기 난이도/운지/성대나 연주 능력을 판단하지 않는다.
현재 canonical 모델은 NoteEvent당 단일 Pitch이며 별도 화음/다중 Part 기보·재생을 추가하지 않았다.
Phase 2 전체 인수는 위 브라우저·수동 검증 전 완료로 표시하지 않는다. GitHub push/Vercel 작업 없음.

### Phase 2-6 악보 요약 Locator 회귀 수정 (2026-11-09)

- 사용자 Mac Chromium **36/55 PASS, 19 FAIL**, 신규 추천 E2E 3/3 PASS 보고.
  로컬에 남은 trace.zip/error-context.md 각 19개를 확인했고 모든 trace에서 strict mode violation을 확인했다.
  getByText(/음표 N개/)가 기존 요약 span과 새 score-range의 '표기 음표 N개'를 함께 선택했다.
- 재실행으로 원본 증거가 사라지지 않도록 trace/context를 임시 경로에 보존했다:
  `/var/folders/35/m6dppg413h39y02j8j16qq3h0000gn/T/music-score-locator-evidence-294fcgd8/test-results`.
- 기존 요약 span에 동작·문구·레이아웃 변화 없이 data-testid="score-summary"만 추가했다.
  공통 `tests/e2e/score-summary.ts`의 scoreNoteCount(page,count)는 이 요약 안의 기대 숫자만 선택한다.
- 수정 E2E 8파일/33지점: editor(16), manual-save(5), autosave-navigation(3), piano-preview(3),
  rest(3), edit-cursor(1), settings(1), transpose-preview(1).
  실제 실패한 테스트 수 19와 코드 선택 지점 수 33을 구분한다. 후속 단계에 있어 아직 도달하지 못한 지점도 같은 충돌을 예방한다.
- 8파일에서 새 헬퍼 import/호출을 원래 locator로 역변환하면 HEAD의 원본과 완전히 같음을 검사했다.
  기대 숫자/가시성 assertion/저장·편집 검증은 그대로이며 삭제/skip/first/last/timeout 증가는 없다.
  BPM·쉼표 개수·편집 문구는 새 음역 영역과 겹치지 않아 유지했다. score-range 검증도 그대로다.
- 단위·통합 **614/614 PASS**, typecheck/lint/architecture/build PASS, git diff --check PASS.
  아키텍처 62모듈/186의존성, 경계 55파일 위반 0. helper는 테스트 전용이며 제품 로직은 변경하지 않는다.
- 전체 E2E는 다시 **listen EPERM 0.0.0.0:3010**, exit 1로 서버 시작 실패 → 수정 후 **55종 미실행**.
  수집은 **55종/14파일** 유지. Mac 55/55 확인 전 관련 Phase 2-6 변경과 Locator 수정을 보존하고 커밋 보류한다.

Mac 전체 재검증: `npm run test:e2e` (프로젝트 루트).
기존 Score/음역 알고리즘/Command/Undo·Redo/IndexedDB/ADR-010 변경 없음. GitHub push/Vercel 작업 없음.

### Phase 2-6 최종 검토 및 사용자 Mac 검증 결과 (2026-11-09)

- 사용자가 Locator 수정 이후 Mac에서 전체 Chromium E2E **55/55 PASS**를 직접 확인했다.
  기존 52종과 신규 추천 3종을 모두 포함한다. 위 Mac 36/55·19 FAIL 및 Codex listen EPERM 기록은 당시 결과로 보존한다.
  Codex에서 브라우저 실행에 성공한 것으로 표기하지 않으며, Mac 재검증 전 커밋 보류 조건은 이번 확인으로 해소되었다.
- 단위·통합 **614/614 PASS**(41파일, 기존 574 + 신규 40), typecheck/lint/architecture/build PASS.
- 추적 변경 16개/신규 7개, 총 23파일을 최종 검토했다. score-summary 공통 헬퍼와 신규 테스트를 포함하며
  기존 E2E의 기대 숫자·가시성·편집/저장 assertion을 유지한다. 분석/추천/미리보기는 무dispatch·무저장,
  확정은 기존 Command 1회이며 기준 세션·revision·충돌·삭제 검사를 보존한다.
- Score schemaVersion 2, Part.ties, 기존 Command/Undo·Redo/JSON, IndexedDB DB2 및 ADR-010 계약 유지.
  저장소/자동 저장 구현, 기존 조옮김 엔진, Tone.js/VexFlow 구현과 의존성은 변경하지 않았다.
- 실제 오디오 청취, Safari·모바일 실기기, 폰트·극단 음역·다중 행 시각 인수 및 큰 악보 응답성은 별도다.
  수치상 음역 적합성을 실제 악기 연주 가능성으로 간주하지 않는다. GitHub push/Vercel 작업 및 Phase 3 구현 없음.
