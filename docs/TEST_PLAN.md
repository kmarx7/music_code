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
| 브라우저 E2E | 입력·편집·저장·복구·재생, 타이 분할, 모바일 레이아웃, 키보드/접근성 | Playwright(Chromium, 프로덕션 빌드) | ✅ 실행(4 통과) |
| 오디오/내보내기 | 채보·PDF/MIDI/MusicXML | - | ⏳ Phase 4/5 |

## 2. 단위·통합 테스트 목록 (실행 결과: 15 파일 / 101 통과)

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
