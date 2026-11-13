# MODULE_CONTRACTS.md — 모듈 계약과 의존성 규칙

- 작성일: 2026-11-07
- 작업 ID: P0-01 / P0-02 / P0-06 / P0-07
- 상태: Phase 0 확정
- 근거: `docs/ARCHITECTURE.md` §4·§7·§12, ADR-001·002·004·007

## 1. 레이어 의존성 매트릭스

행 = import 하는 쪽, 열 = import 되는 쪽. `O` 허용, `X` 금지(검사기가 강제).

| from \ to | domain | application | features | adapters | store | app/components | shared |
|---|---|---|---|---|---|---|---|
| domain | O | X | X | X | X | X | X |
| application | O | O | X | X | X | X | O |
| features | O | O | O(자기/공개 진입점) | O(포트 경유 권장) | O | X | O |
| adapters | O | O | X | O | X | X | O |
| store | O | O | X | X | O | X | O |
| app/components | O | O | O(공개 진입점) | O | O | O | O |

추가 규칙:
- `src/domain`은 React/Next/VexFlow/Tone.js/IndexedDB/Zod 등 런타임 라이브러리와
  브라우저 전역(`window`, `document`, `fetch`, `AudioContext` 등)을 참조할 수 없다.
- `src/application`은 구체 adapter를 import 하지 않는다(포트만).
- 다른 feature의 **private 파일**을 직접 import 할 수 없다. 공개 진입점(`index.ts`)만 사용한다.
- 순환 의존성 금지.

## 2. 공개 진입점 (public entrypoints)

| 모듈 | 진입점 | 제공 내용 |
|---|---|---|
| Domain · Score | `@/domain/score` | `Score`/`Part`/`TieLink` 등 타입, `createEmptyScore`, `createNoteEvent`, `createRestEvent`, `validateScore`, `serializeScore`, `deserializeScore`, `measureTicks`, `measureStartTick`, `NOTATABLE_DURATIONS`, `splitNoteIntoMeasures`, `chainIdsOf`, `mergeTiedNotes`, 상수, `transposeScore`, `TransposeSpec`, `analyzeScoreRange`, `recommendTranspositions`, `RangeAnalysis`, `TargetMidiRange`, `RangeRecommendation` |
| Domain · Music Theory | `@/domain/music-theory` | `midiFromSpelling`, `createPitch`, `letterName`, `koreanFixedDo`, `isDiatonicStep`, `KEY_SIGNATURE_OPTIONS`, `isSupportedKeySignature`, `intervalBetweenKeys`, `transposePitch`, `transposeKeySignature`, `TransposeInterval`, `TransposeResult`, `formatNoteLabel`, `NoteLabelMode` |
| Domain · Commands | `@/domain/commands` | `EditCommand`, `applyEditCommand`, 에러 코드 |
| Application | `@/application` | `EditSessionState`, `createEditSession`, `applyCommand`, `undo`, `redo`, `canUndo`, `canRedo`, `ScoreRepository` |
| Feature · Score Library | `@/features/score-library` | `useAutosave`, `SaveStatus`, `AutosaveHandle`, `SaveButton` |
| Feature · Playback | `@/features/playback` | `PlaybackControls`, `highlightPlayback` (런타임 UI/DOM 투영) |
| Feature · Score Editor | `@/features/score-editor` | `StaffView`, `ScoreSettings`, `EditCursor`, `NoteLabelsControl` |

내부 파일 직접 import는 같은 feature/모듈 내부에서만 허용한다.

## 3. 편집 Command 계약 (C-04)

```ts
type EditCommand =
  | { type: "TransposeScore"; spec: TransposeSpec; updatedAt: string }
  | { type: "RenameScore"; title: string; updatedAt: string }
  | { type: "SetTempo"; tempoBpm: number; updatedAt: string }
  | { type: "SetKeySignature"; partId; keySignature: KeySignature; updatedAt: string }
  | { type: "SetTimeSignature"; partId; timeSignature: TimeSignature; updatedAt: string }
  | { type: "AddNote"; partId; measureId; note: NoteEvent }
  | { type: "UpdateNote"; partId; noteId; patch: NotePatch }
  | { type: "DeleteEvent"; partId; eventId }
  | { type: "InsertRest"; partId; measureId; rest: RestEvent }
  | { type: "UpdateRest"; partId; restId; patch: { startTick?: number; durationTicks?: number } }
  | { type: "AddMeasure"; partId; measureId: string }
  | { type: "ResizeNote"; partId; noteId; durationTicks: number };
```

> Phase 1-B에서 `AddMeasure`, `ResizeNote`를 **추가**했다(기존 파이프라인·모델 유지, 명령 집합의 확장).
> Phase 1-D(ADR-009)에서 **마디 경계 분할·타이**를 도입했다: `AddNote`는 시작 마디만 지정하면 되고,
> 길이가 마디를 넘으면 `splitNoteIntoMeasures`가 표기가능 음가로 분할해 `Part.ties`로 연결한다.
> `ResizeNote`는 논리 음표(체인) 전체를 다시 레이아웃하고 뒤 이벤트를 순서대로 재배치한다.
> `UpdateNote`의 pitch/velocity 패치는 체인 전체에 적용되고 위치·길이 패치는 거부된다(`TIE_EDIT_UNSUPPORTED`).
> 자리가 없으면 `MEASURE_CAPACITY_EXCEEDED`로 실패하고, 마디 추가는 `AddMeasure`로 수행한다.

| 항목 | 계약 |
|---|---|
| 순수성 | `applyEditCommand(score, cmd)`는 **입력 Score를 변경하지 않고** 실제 편집 시 새 Score를 반환한다. 조옮김 no-op은 원본 Score를 반환한다. `Date.now()`/랜덤/IO를 호출하지 않는다 |
| 성공 | `{ ok: true, score }` — 새 Score는 전체 검증을 통과해야 한다 |
| 실패 | `{ ok: false, error: { code, message } }` — 원본 Score는 그대로 |
| 검증 시점 | 명령 적용 후 `validateScore`를 재실행하여 불변식을 보증 |
| 에러 코드 | `INVALID_TITLE`, `INVALID_KEY_SIGNATURE`, `TIME_SIGNATURE_REQUIRES_EMPTY_SCORE`, `PART_NOT_FOUND`, `MEASURE_NOT_FOUND`, `NOTE_NOT_FOUND`, `EVENT_NOT_FOUND`, `DUPLICATE_ID`, `INVALID_DURATION`, `MEASURE_CAPACITY_EXCEEDED`, `NOT_NOTATABLE`, `TIE_EDIT_UNSUPPORTED`, `INVALID_SCORE` 및 `TransposeErrorCode` |
| updatedAt | Command는 현재 시각을 생성하지 않는다. `RenameScore`·설정·`TransposeScore`는 경계에서 주입받은 `updatedAt`을 적용한다(재현성) |
| 이름 매핑 | ARCHITECTURE의 예시 `DeleteNote`는 note/rest 모두 삭제 가능한 `DeleteEvent`로 구현했다 |

## 4. 편집 세션/히스토리 계약

```ts
interface EditSessionState { current: Score; past: readonly Score[]; future: readonly Score[] }
```

- 실제 변경을 반환한 성공만 히스토리에 push 하고 `future`를 비운다(redo branch 무효화).
- 성공이 원본 Score 객체를 반환하면 동일 session을 유지한다. store는 session이 달라진 dispatch만 알린다.
  기존 Command의 의미적 no-op을 일괄 정규화하지 않으며 현재 TransposeScore가 이 규약을 사용한다.
- 실패한 명령은 **session 객체를 그대로 반환**한다(히스토리·Score 불변).
- `undo`/`redo`는 히스토리가 없으면 동일 session을 반환한다.
- 과거 스냅샷은 불변 Score 참조로 보관한다(원본 변경 금지).

### Phase 1-E — 제목 및 JSON 백업/가져오기

- `RenameScore`: 제목의 앞뒤 공백을 제거하며 빈 제목은 `INVALID_TITLE`로 거부한다.
  기존 명령/히스토리/store/자동 저장을 그대로 사용하며 음표와 `Part.ties`는 변경하지 않는다.
- `@/application`의 기존 score-library에 `exportScoreBackup`, `importScoreBackup`을 추가했다.
  기존 `ScoreRepository` 인터페이스는 변경하지 않았다.
- JSON은 envelope 없는 canonical Score다. `serializeScore`/`deserializeScore`를 재사용하며,
  중첩 구조를 먼저 확인하고 도메인 불변식·타이 연결을 검증한다. schemaVersion 2 유지, v1 변환 재사용.
- 가져오기는 경계에서 생성한 **새 Score ID**로 저장한다. 원래 ID와 동일하거나 기존 ID와 충돌하면
  거부한다. 음표/마디/파트 ID와 타이 참조, 원래 생성 시각은 보존하고 `updatedAt`은 가져온 시각이다.
  이는 검증된 저장본으로 새 악보를 생성하는 Application 작업이며 기존 편집 세션을 덮어쓰지 않는다.
- 악보함 파일 입력은 최대 5MiB다. 파싱·검증 실패 시 `save`를 호출하지 않고, 저장 실패도 사용자에게 알린다.
- `src/adapters/file-export/json.ts`는 Blob/다운로드 URL 수명만 관리한다. 기존 다운로드 구현이 없어
  최소 어댑터를 추가했으며 production 의존성·모델·저장 엔진 변경은 없다.
- ADR-010 이후 실제 생성은 원자적 create-if-absent다. UI는 새 UUID를 생성하고 Tombstone ID도 재사용하지 않는다.

### Phase 1-E — 쉼표 편집 계약 (2026-11-08)

- `RestEvent`, `NoteEvent`, `Part.ties` 및 schemaVersion 2는 변경하지 않는다.
- `planAppendRest`는 기존 `append-note.ts`의 끝 위치 계산을 음표 입력과 공유하고,
  `InsertRest`를 계획한다. 삽입은 마지막 이벤트 뒤이며 중간 삽입은 추가 후 위치 변경으로 한다.
- `InsertRest`/`UpdateRest`는 `NOTATABLE_DURATIONS`의 단일 음가만 허용한다.
  UI는 기존 네 길이(온음표/2분/4분/8분)를 재사용한다. 표기 불가 길이는 `NOT_NOTATABLE`로 거부한다.
- `UpdateRest`는 같은 ID의 쉼표에 `startTick`/`durationTicks`만 적용한다.
  시작 tick으로 소속 마디를 찾고 다른 마디로 이동할 수 있으나, 쉼표 전체는 한 마디 안에 있어야 한다.
- **비리플로우 유지:** 쉼표의 삽입·이동·길이 변경·삭제는 다른 이벤트를 이동하지 않는다.
  마디 초과/음표·쉼표 충돌은 기존 `validateScore`로 거부한다. 자동 분할·자동 마디 추가·타이 생성은 하지 않는다.
- `Part.ties`와 음표 값은 쉼표 편집에서 보존된다. 기존 `ResizeNote` 리플로우는 그대로이며,
  그 결과 타이 연속성이 깨지면 기존 검증이 전체 명령을 거부한다. 배치 정책을 바꾸지 않는다.
- 실패 시 기존 Score와 편집 세션의 past/future는 동일하게 유지된다. 성공 시 기존 Undo/Redo,
  scoreStore 및 IndexedDB 자동 저장을 사용한다. ScoreRepository 계약은 변경하지 않는다.
- 마디·박 입력은 UI에서만 tick으로 변환한다. 별도 영속 시간 모델이나 상태 관리 도구는 추가하지 않는다.
- VexFlow 어댑터는 이벤트를 읽기 전용으로 정렬하고 빈 구간을 `GhostNote`/`Fraction`으로 표시한다.
  렌더 전용 객체는 Score에 저장하지 않는다. 쉼표는 높은음자리표 B4/낮은음자리표 D3 기준으로 중앙 배치한다.

### Phase 1-E — 악보 설정 계약 (2026-11-08)

- `SetTempo`: 기존 정수 20–400 BPM 검증을 사용한다. 연습 속도와 구별되는 Score의 원래 템포다.
- `SetKeySignature`: `music-theory/key-signatures.ts`의 장조 15개/단조 15개(-7..+7 fifths) 중
  으뜸음·alter·mode·fifths가 일치하는 값을 허용한다. 불일치는 `INVALID_KEY_SIGNATURE`로 거부한다.
  이 목록은 기존 도메인에 조표 조합 검증이 없어 추가한 순수 조회 데이터이며 새로운 음악 모델이 아니다.
- 조표 변경은 **MIDI와 기존 Pitch(step/alter/octave), 이벤트 위치/길이/ID 및 Part.ties를 보존**한다.
  자동 이명동음 재표기나 조옮김은 하지 않는다. VexFlow가 새 조표에 따른 샵/플랫/제자리표를 계산한다.
  예: G 장조로 바꿔도 기존 F4는 F4이며 필요한 제자리표가 표시된다.
- `SetTimeSignature`: Score 전체의 모든 part에 이벤트와 타이가 없을 때만 대상 part의 박자를 변경한다.
  음표 또는 쉼표가 하나라도 있으면 `TIME_SIGNATURE_REQUIRES_EMPTY_SCORE`로 거부한다.
  UI 선택지는 2/4·3/4·4/4·6/8이다. 도메인에서는 기존 박자 분자/분모 검증을 재사용한다.
  마디 ID/index/수는 유지하며 이벤트 재배치·자동 분할·타이 모델 수정은 하지 않는다.
- 세 명령은 경계에서 받은 `updatedAt`을 적용하고 기존 finalize/Undo/Redo/자동 저장/복원을 사용한다.
  잘못된 설정은 Score와 편집 세션의 past/future를 변경하지 않는다.
- `ScoreSettings`는 기존 score-editor feature 공개 진입점에 추가한 UI다.
  Score를 직접 변경하지 않고 기존 Command 진입점으로 요청한다. 별도 store나 영속 상태가 없다.
- UI에서 설정이 적용되면 재생을 정지하고, 다음 재생은 변경된 Score를 사용한다.
  초기화 중인 이전 재생 요청도 무효화한다. 재생 중 즉시 템포를 다시 스케줄하는 기능은 이번 범위에 없다.
- Score schemaVersion 2, Part.ties, ScoreRepository 및 아키텍처 레이어는 변경하지 않는다.

## 5. 상태 소유권과 3분할

| 파티션 | 소유자 | 내용 |
|---|---|---|
| 영속 음악 상태 | `EditSessionState.current` (단일 Score) | Score |
| UI 상태 | (Phase 1) 선택·도구·패널 | 선택 ID, 라벨 모드, 미리보기 |
| 런타임 상태 | (Phase 1~) 오디오/재생/연습 | 마이크, 스케줄 커서, loop/rate |

- Phase 0에서는 **React 상태 라이브러리를 도입하지 않는다**(ADR-001/AGENTS §5).
  단일 Score 소유자는 `EditSessionState`이며, React store 바인딩은 Phase 1에서
  기존 계약을 유지한 채 추가한다. 새 상태 시스템 도입은 승인 대상이다.
- `practiceSpeed`, loop, 재생 상태는 Score에 저장하지 않는다(ADR-004).

## 6. 포트

| 포트 | 상태 | 비고 |
|---|---|---|
| `ScoreRepository` | 인터페이스만 정의 (`src/application/ports.ts`) | IndexedDB adapter는 Phase 1 |
| `AudioTranscriptionPort` | **정의(2026-11-13, P4-05)** | 아래 "Phase 4 — 마이크 캡처 포트" 절 |
| `PlaybackPort`, `ExportPort` | 미정의 | Phase 1/5에서 계약화 |

어댑터는 App(조립 지점)에서만 구체 구현을 연결한다. Application은 포트만 참조한다.

## 7. 패키지·호환성 (P0-02, C-06)

설치된 버전(실측):

| 구분 | 패키지 | 버전 | 이유 |
|---|---|---|---|
| runtime | `next` | 16.4.4 | App Router 기반 모듈형 모놀리스(ADR-001) |
| runtime | `react` / `react-dom` | 19.3.0 | Next 16 peer 요구 |
| runtime | `vexflow` | 5.0.0 | 악보 렌더 어댑터(ADR-008, 승인) |
| runtime | `tone` | 15.1.22 | 스케줄 재생 어댑터(ADR-008, 승인) |
| dev | `typescript` | ^5 | strict 타입 검사 |
| dev | `@types/node` / `@types/react` / `@types/react-dom` | ^22 / ^19 / ^19 | 타입 |
| dev | `eslint` / `eslint-config-next` | ^9 / 16.4.4 | Next 권장 린트 |
| dev | `vitest` | ^5.1.0 | 단위 테스트 |
| dev | `dependency-cruiser` | ^18.7.2 | 레이어·순환 의존성 검사 |
| dev | `@playwright/test` | ^1.65.0 | 브라우저 E2E(Chromium, 프로덕션 빌드 대상) |
| dev | `fake-indexeddb` | ^6.2.7 | Node에서 IndexedDB 어댑터 검증용 테스트 대역(런타임 아님) |

**의도적으로 Phase 0에서 도입하지 않은 것**: Tailwind CSS(제품 UI 없음), Zod, IndexedDB 라이브러리. 각 기능 Phase에서 필요 시 사유와 함께 도입한다.
Phase 1에서 **VexFlow 5.0.0 / Tone.js 15.1.22**를 ADR-008(사용자 승인)로 도입했다. 두 패키지는
`src/adapters/*`에서만 초기화하고 서버 컴포넌트/SSR에서 import 하지 않는다.
Phase 1-C에서 **Playwright**를 도입했다(사용자 지시). E2E는 `tests/e2e`에서 프로덕션 빌드
(`npm run build && npm run start`)를 대상으로 실행하며, dev 서버 재사용 시 청크 컴파일 지연을 피한다.
`fake-indexeddb`는 어댑터 테스트 전용이며 프로덕션 번들에 포함되지 않는다.

## 8. 아키텍처 검사 구성 (P0-07)

`npm run check:architecture` =
`depcruise src --config .dependency-cruiser.cjs` **&&** `node scripts/check-boundaries.mjs`

| 검사 | 도구 | 규칙 |
|---|---|---|
| Domain → 외부 레이어 | dependency-cruiser | `domain-no-outer-layers` |
| Domain → 런타임 라이브러리 | dependency-cruiser | `domain-no-runtime-libraries` |
| Application → Adapter / React | dependency-cruiser | `application-no-adapters`, `application-no-react` |
| Adapter → feature | dependency-cruiser | `adapters-no-features` |
| 순환 의존성 | dependency-cruiser | `no-circular` |
| Domain 브라우저 전역 | check-boundaries | `domain-runtime-global` |
| 다른 feature private import | check-boundaries | `feature-private-import` |
| canonical 타입 외부 선언 | check-boundaries | `canonical-type-outside-domain` |

검사기는 의도적 위반 fixture로 실패를 확인했다(근거: `docs/TEST_PLAN.md` §4).

## 9. 미정·승인 필요 항목 (C-01~C-10 요약)

| ID | 상태 |
|---|---|
| C-01 라이브 피치 표시 | Phase 4에서 PRD 기준으로 구현·미지원 시 안내 |
| C-02 시간 모델 | **확정**(DATA_MODEL §2) |
| C-03 지원 음가·타이·조표 변경 | 음가·타이 ADR-009 유지. 현재 요청으로 전체 조표 편집·빈 악보 박자 편집 구현. 악보 중간 변경 지점/기존 이벤트 재배치는 미지원·별도 승인 대상 |
| C-04 명령·Undo 계약 | **확정**(§3·§4) |
| C-05 store 조립 | Phase 1에서 단일 Score 소유자 유지하며 추가 |
| C-06 의존성 도입 | Phase 0 목록 확정(§7), 이후 기능 Phase별 승인 |
| C-07 저장 버전·migration | **v2 확정**(`Part.ties`), v1 → v2 마이그레이션 구현·테스트 완료 |
| C-08 클립보드 의미 | **확정**(2026-11-11 사용자 승인, 아래 D-01 절). 구현은 P3-06~09에서 수행 |
| C-09 F1 게이트 | **채점 정의·합성 데이터 확정**(2026-11-13 사용자 승인 D-02, [PHASE4_MASTER_PLAN](PHASE4_MASTER_PLAN.md) §4·§5). note F1 ≥ 0.90은 목표이며 실적 아님. 실제 허밍 데이터셋과 최종 기준은 공개 베타 전 확정 |
| C-10 브라우저 매트릭스 | **Chromium(Playwright 1.65.0) 기록됨**. WebKit/Firefox/실기기는 미실행 |


## Phase 1 — 재생 커서·하이라이트·메트로놈 (2026-11-08)

- 기존 Tone 어댑터의 `playScore(score, options?)`/`PlaybackHandle.stop()`을 유지하고,
  `pause`, `resume`, `setMetronome`, `getPosition`과 선택적 `onPosition`, `onState`, `metronome`을 추가한다.
  `onEnd`는 자연 종료에 한 번만 호출한다. stop은 멱등이며 일시정지·정지는 예정된 음과 클릭을 dispose한다.
- `domain/score/playback.ts`는 기존 Score의 **읽기 전용** `PlaybackPosition`(절대 tick, 1부터 세는 마디/박,
  activeNoteIds)과 종료 위치를 계산한다. 별도 음악 데이터나 영속 시간 좌표계를 만들지 않는다.
- 위치는 `Tone.immediate()`의 AudioContext 시계와 시작 tick으로 계산한다. `Tone.now()`의 look-ahead와
  시작 여유 시간은 커서에 포함하지 않는다. 25ms 간격은 UI 알림 주기이며 누적 tick 시계가 아니다.
  정확한 정수 tick 경계의 부동소수점 오차만 보정한다. UI 알림은 메인 스레드 지연의 영향을 받을 수 있다.
- 첫 Part만 재생한다(기존 단선율 범위). 마지막 이벤트 끝까지 재생하므로 뒤 쉼표를 보존하고,
  이벤트가 없는 악보는 메트로놈 ON으로 전체 마디를 연습할 수 있다. 사용하지 않는 후행 빈 마디는 생략한다.
- `mergeTiedNotes`를 재사용해 체인당 **한 번의 어택과 전체 길이 지속**을 스케줄한다.
  하이라이트는 현재 tick의 기보 세그먼트로 이동한다(`[start, end)`). 쉼표/빈 구간에는 음표 하이라이트가 없다.
  일반 음표의 기존 90% gate는 유지한다. 타이 지속음 중간에서 재개하면 남은 길이만 한 번 다시 어택한다.
- 일시정지는 tick을 유지하고 하이라이트를 지운다. 재개는 해당 tick부터 남은 음/클릭을 새로 스케줄한다.
  정지/자연 종료는 tick 0 및 빈 하이라이트로 돌아간다. 성공한 Score 편집/Undo/Redo/설정 변경과
  화면 이탈은 이전 재생을 취소한다. 오디오 초기화 중이던 요청도 토큰으로 무효화한다.
- 메트로놈은 기본 OFF이며 Score에 저장하지 않는다. 분모 음가를 한 클릭으로 삼는다:
  2/4·3/4·4/4는 4분음표, 6/8은 8분음표 6클릭(첫 박 강조). 6/8 점4분음표 두 박 옵션은 제공하지 않는다.
  BPM은 기존 4분음표 기준이다. ON/OFF는 멜로디 재시작 없이 클릭만 취소/재스케줄한다.
  박자·템포 편집은 기존 정책대로 정지 후 다음 재생에서 새 설정을 사용한다.
- 기존에 고빈도 상태를 소유할 feature가 없으므로 기준선의 `features/playback`에 최소 UI를 구현한다.
  React 로컬 상태/ref만 사용하고 페이지 전체나 scoreStore를 매 프레임 갱신하지 않는다.
  VexFlow SVG 그룹과 목록 칩의 `data-event-id`를 통해 DOM 하이라이트를 갱신한다.
  선택의 `aria-pressed`와 재생의 `data-playing`은 독립적이다. SVG는 매 tick 다시 그리지 않는다.
- Score/schemaVersion 2/Part.ties/Command/Repository/production 의존성은 변경하지 않는다.
  연속 편집 회귀에서 재현된 늦은 저장 덮어쓰기를 막기 위해 기존 `useAutosave`의 쓰기를 순서대로 실행한다.
  cleanup의 마지막 저장도 같은 대기열을 사용하고 실패한 요청 다음의 저장은 계속한다.
  다중 탭 동시 편집과 브라우저 강제 종료 시 비동기 저장 보장은 기존 미해결 범위다.


## 저장 완료·편집기 이동 계약 보완 (2026-11-08)

- `useAutosave(repository, delayMs = 400, controlRef?)`의 기존 인자/`SaveStatus` 반환은 유지한다.
  선택적 React ref를 통해 기존 저장 대기열의 `AutosaveHandle.flush(): Promise<boolean>`을 제공한다.
  새 상태 시스템·Repository 포트·Score 모델을 만들지 않는다.
- 일반 자동 저장은 400ms 디바운스와 쓰기 직렬화를 유지한다. 명시적 flush는 대기 타이머를 취소하고
  기존 in-flight 쓰기 뒤에 최신 snapshot을 저장한다. 저장 중 추가 편집이 생기면 같은 Score의 최신본도
  저장한 뒤 true를 반환한다. 실패 시 false/error이며 편집 세션은 보존한다. 다음 호출로 재시도할 수 있다.
- 편집기의 일반 홈/악보함 링크 이동은 Next Link `onNavigate`에서 flush 완료를 기다린 후 진행한다.
  실패하면 이동하지 않고 “저장하지 못해 이동을 중단했습니다”와 재시도/JSON 백업 안내를 표시한다.
  cleanup 저장은 예비 수단이며, 악보함 목록 조회와의 동기화 수단으로 사용하지 않는다.
- IndexedDB의 `save` 성공은 put 요청 성공이 아니라 **transaction.oncomplete** 이후다.
  요청 성공 뒤 발생한 transaction abort/error도 실패로 전달한다. “저장됨”은 이 완료 시점과
  현재 Score snapshot 일치가 모두 확인된 경우에만 표시한다. read/delete도 같은 transaction 완료 처리를 쓴다.
- JSON 다운로드는 현재 메모리 Score를 백업하며 IndexedDB 저장 완료를 의미하지 않는다.
- Score schemaVersion 2, Part.ties, 기존 Command/Undo/Redo와 Repository 인터페이스는 불변이다.
  문서 계약의 호환 가능한 추가이며 레이어/의존성/기본 아키텍처 변경은 없다.
- 브라우저 강제 종료/탭 닫기/직접 URL 이동/브라우저 뒤로가기는 위 Link guard를 거치지 않는다.
  이 경우 비동기 cleanup 저장 완료는 보장하지 않으며 다중 탭 동시 쓰기도 이번 범위 밖이다.


## 실패 저장본 직접 열기와 원본 보존 (2026-11-08)

- `ScoreRepository.load(id): Promise<Score | null>`의 성공 반환 타입을 유지한다.
  **null은 해당 key가 실제로 없을 때만** 반환한다. 기존 Promise 거부 경로를
  application/ports의 `ScoreReadError`/`ScoreReadErrorCode`로 구체화한다.

| 조회 상태 | 계약 | Application/UI 동작 |
|---|---|---|
| A. 실제 미존재 | null | 기존 정책으로 생성 가능 |
| B. 정상 또는 지원 v1 | canonical Score(v2) | 검증 성공 후에만 편집 세션 시작 |
| C. 손상/구조·검증 실패 | INVALID_RECORD / INVALID_JSON / INVALID_SHAPE / INVALID_SCORE 오류 | 생성·편집·자동 저장 금지 |
| D. 미지원 버전 | UNSUPPORTED_SCHEMA 오류 | 동일, 원본 보존 |
| E. IndexedDB 읽기 실패 | STORAGE_READ_ERROR 오류 | 동일, 부재로 추정하지 않음 |

- 어댑터가 원시 envelope·문자열 JSON·canonical 검증·ID 일치를 판정하며, application은
  읽기 오류를 전파한다. `openOrCreateScore`는 실패를 catch하여 생성으로 전환하지 않는다.
- `save`도 기존 레코드 검증과 put을 **같은 readwrite transaction**에서 수행한다.
  조회 후 늦게 생긴 손상/미지원 레코드 및 이전 세션의 지연 저장도 덮어쓰지 못하게 차단한다.
  정상 저장본 간의 다중 탭 충돌 해결까지 제공하는 것은 아니다.
- 편집기 route의 로딩/오류 화면과 편집 작업 영역은 같은 presentation 파일 안에서 수명만 분리한다.
  성공 전에는 scoreStore.init/건반/Command UI/StaffView/useAutosave를 연결하지 않는다.
  실패 시 오류 코드·안내와 악보함 복귀 링크만 표시한다. 이전 세션의 Score를 실패 ID로 표시하지 않는다.
- `useAutosave`의 선택적 네 번째 `initiallySaved`는 성공적으로 읽은 baseline을 표시한다.
  편집하지 않았다면 flush/cleanup도 저장하지 않는다. 정상 v1은 메모리 v2 변환을 유지하되,
  읽기/이동만으로 자동 영속 마이그레이션하지 않는다. 정상 편집 후에는 기존 Command/Undo/Redo/저장을 쓴다.
- 목록은 읽을 수 없는 레코드를 계속 제외하지만 원본을 삭제·복구·정규화하지 않는다.
  JSON 가져오기의 새 ID가 읽을 수 없는 레코드와 충돌하는 경우도 저장을 거부한다.
- 원시 백업 검토: 별도 읽기 전용 export로 원본 json 문자열과 envelope/추가 메타데이터를
  보존하는 복구용 형식이 필요하다. 이번에는 자동 복구나 원시 백업 UI를 추가하지 않는다.
  손상 데이터를 canonical Score/일반 JSON 악보 백업으로 내보내지 않으며, 원시 레코드는 그대로 둔다.
- Score/schemaVersion 2/Part.ties 및 레이어·저장 엔진·상태 관리·생산 의존성은 불변이다.
  이번 요구로 오류 의미를 강화했으며 포트 반환 모양 교체나 별도 읽기 음악 모델은 만들지 않는다.


## 피아노 입력 소리 미리듣기 (2026-11-08)

- 기존 `PianoKeyboard`의 88건반·`midiToPitch`·컴퓨터 키 매핑과 기존 `onPitch` → Command →
  자동 저장 흐름을 재사용한다. Score/schemaVersion 2/Part.ties/Repository/재생 포트는 변경하지 않는다.
- `adapters/tone/pianoPreview.ts`의 `createPianoPreview()`는 MIDI를 받아 소리만 내는 런타임 어댑터다.
  기존 `playScore`는 전체 Score의 이벤트·타이·커서·메트로놈을 예약하므로 입력음 하나에 재사용하면
  임시 Score 또는 재생 세션 간섭이 필요하다. 같은 Tone 경계 안에 최소 미리듣기 음성을 추가한다.
  새 음악 모델·상태 관리·의존성·레이어 변경은 없다.
- `prepare`는 동적 import만 수행한다. `play(midi): Promise<boolean>`은 사용자 입력에서 Tone.start를
  호출하고 running context를 확인한 뒤 소리를 낸다. 준비된 경우 활성화 호출은 입력 핸들러 안에서
  동기적으로 시작한다. 차단/초기화 실패는 오류로 전달하고 다음 입력에서 재시도할 수 있다.
- 단일 triangle oscillator와 gain을 재사용해 약 200ms의 짧은 입력음을 낸다. 최신 입력이 음높이를
  교체하고 기존 gain 예약(이전 음의 종료 포함)을 취소한다. 음성 누적·오래된 비동기 활성화·종료가
  최신 음을 덮거나 끊지 않는다. JS 종료 타이머나 Tone.Transport를 사용하지 않는다.
- 포인터 누름은 미리듣기, 기존 click은 음표 입력을 각각 담당한다. 정상 미리듣기를 호환 click으로
  중복 재생하지 않으며, 대기/차단된 경우 native click에서 오디오 활성화를 재시도한다.
  터치 스크롤 취소는 해당 포인터의 소리만 정지하고 음표를 추가하지 않는다.
  컴퓨터 키/접근성 click도 지원하며 key repeat는 무시한다.
- 기본 ON인 “입력 소리 미리듣기”는 컴포넌트 로컬 UI 상태다. OFF/blur/탭 숨김은 미리듣기만
  정지하고 늦은 요청을 무효화한다. 언마운트는 노드를 dispose한다. 전역 AudioContext를 닫거나
  중단하지 않으므로 악보 재생·메트로놈의 수명과 독립적이다. 기존 Score 편집 시 재생 정지 정책은 유지한다.
- 미리듣기 오류는 안내 문구로 표시하며 `onPitch`/Command/저장 결과를 실패로 바꾸지 않는다.
  새 status/alert role을 추가하지 않아 기존 저장/오류 선택자와 충돌하지 않는다.
- 최초 Tone 번들 로딩 또는 브라우저 정책에 따라 첫 입력이 지연되거나 다음 사용자 입력이 필요할 수 있다.
  실제 스피커 출력·Safari·모바일 실기기의 활성화/지연/음질은 별도 수동 검증 대상이다.

- 동일 MIDI를 다시 눌러도 매 입력마다 현재 시각 기준의 종료 envelope로 갱신한다.
  컴퓨터 키의 별도 누름은 각각 입력하며 운영체제의 held-key repeat만 무시한다.
  미리듣기 실패 중 생성한 음표도 기존 Command 히스토리의 Undo/Redo 및 저장·복원을 따른다.
  미리듣기 자체는 음악 편집 이력을 추가하지 않는다(2026-11-08 반복 입력 회귀 검증 보완).


## Phase 1 — 편집 커서 위치 입력 (2026-11-08)

- `application/append-note.ts`의 기존 위치 계획/음표 생성을 공유한다. 기존
  `planAppendNote(score, input)`는 마지막 이벤트 뒤 입력과 기존 오류 안내를 유지한다.
  `planNoteAt(score, { pitch, durationTicks, id, startTick, partId? })`는 절대 tick 위치의
  기존 `AddNote`를 계획한다. 계획 성공은 음악 검증 성공을 뜻하지 않으며 Command 결과를 확인해야 한다.
- `noteInputTick(part, measure, beat)`은 1부터 세는 마디·분모 음가 박을 절대 tick으로 변환한다.
  마디 범위·마디 안 박 범위·정수 tick을 검증하며 잘못된 값은 null이다. 6/8은 8분음표 6박이다.
  UI 좌표를 음악 모델로 저장하거나 새 시간 모델을 만들지 않는다.
- 새 `EditCursor`는 기존 score-editor 공개 진입점의 작은 위치 선택 UI다. 기존 음표/쉼표 선택 패널은
  선택 이벤트 편집용이라 입력 위치를 소유하지 않는다. 마디/박 폼과 모드 선택만 별도로 추가한다.
- 편집기 기본 모드는 “악보 끝에 입력”(cursor null). “편집 커서에 입력” 전환 시 tick 0에서 시작하며,
  선택 위치는 React 로컬 UI 상태와 입력 콜백용 ref에만 둔다. ref는 같은 렌더 사이의 빠른 입력도
  직전 성공 위치 다음으로 입력하도록 동기 갱신한다. Score/store/IndexedDB에 커서를 저장하지 않는다.
- 피아노 입력은 기존 미리듣기와 onPitch → 계획 → scoreStore.dispatch 경로를 따른다.
  **성공한 AddNote만** cursor를 `startTick + durationTicks`로 이동시킨다. 실패 시 커서·Score·past/future 불변.
  기존 이벤트를 밀거나 덮거나 빈 곳으로 자동 건너뛰지 않는다. 다음 위치에 이벤트가 있으면 다음 입력을 거부한다.
- 기존 AddNote의 마디 경계 분할/표기가능 음가/Part.ties/중첩 검증을 유지한다. 마디를 넘는 음은
  기존 타이로 분할한다. 악보 전체 길이 초과나 후속 세그먼트 충돌도 원자적으로 거부한다.
  마지막 끝 tick은 커서로 표시하되 다음 입력은 거부하고 마디 추가/위치 변경을 안내한다.
- Undo/Redo는 기존 음악 히스토리만 변경한다. 커서 이동은 이력을 추가하지 않으며 Undo/Redo 후에도
  절대 tick을 유지한다. 박자 변경은 같은 tick을 새 마디/박으로 표시한다. 길이가 줄어 범위 밖이면
  명시적 위치 변경/마디 추가 전 삽입을 거부한다. 새로고침·다른 악보 열기는 끝 입력 모드로 초기화한다.
- 쉼표 삽입은 기존 끝 입력 정책을 유지하며 UI에 명시한다. 커서 위치에서 악보 재생 시작은 이번 범위가 아니다.
  커서 이동은 Score를 수정하지 않고 재생을 제어하지 않는다. 실제 삽입/Undo/Redo의 기존 재생 정지 정책은 유지한다.
- `StaffView`/`renderScoreInto`에 선택적 cursorTick을 추가한다(기존 호출 호환).
  VexFlow 음표/GhostNote의 x 좌표와 마디 경계를 이용해 파란 SVG 선을 표시하고,
  빈 구간은 해당 좌표 사이를 보간한다. 기보 그룹/타이/음표 tick은 변경하지 않는다.
  이 선은 읽기 전용 UI 투영이며 SVG 클릭으로 위치를 계산하거나 Score를 역산하지 않는다.
- Score/schemaVersion 2/Part.ties/Command/Repository/Tone 재생·미리듣기/의존성/레이어는 불변이다.
  호환 가능한 입력 계획·UI 확장이며 구조 변경 ADR은 필요하지 않다.


## Phase 1 — 명시적 수동 저장 (2026-11-08)

- `SaveButton`을 기존 score-library 공개 진입점에 추가하고 편집기 상단에 배치한다.
  기존 화면에 저장 버튼이 없으므로 작은 UI만 추가한다. Score/Repository를 소유하거나 직접 쓰지 않으며
  기존 `AutosaveHandle` ref와 `SaveStatus`만 받는다. 모바일 터치 영역은 최소 높이 44px다.
- 저장 클릭은 기존 `useAutosave.flush()`를 호출한다. 400ms 디바운스를 건너뛰고 기존 쓰기 대기열에 합류하며,
  저장 도중 바뀐 같은 악보의 최신 Score도 저장한 뒤 성공한다. 자동 저장과 편집/Undo/Redo는 계속 활성화한다.
- `useAutosave`의 진행 중 명시적 flush는 같은 Promise를 공유한다. 수동 저장/이동이 동시에 요청되어도
  별도 쓰기 루프를 시작하지 않는다. 완료/실패 후 공유 요청을 해제해 재시도를 허용한다.
  일반 자동 저장/cleanup은 기존 같은 직렬 쓰기 대기열을 유지한다. 동일 직렬화 내용은 중복 저장하지 않는다.
- 버튼은 동기 ref로 같은 렌더 사이의 연속 클릭도 차단하며, 요청 동안 버튼만 disabled/aria-busy로 표시한다.
  초기화되지 않은 handle/예상 밖 거부도 성공으로 표시하지 않으며, 언마운트 후 늦은 UI 결과는 무시한다.
  진행 중 저장 자체를 취소하거나 전역 저장 상태를 별도 복제하지 않는다.
- 완료 문구는 수동 요청 반환값만으로 결정하지 않는다. 기존 SaveStatus가 saved일 때만 최신 저장 완료를 표시한다.
  추가 편집은 즉시 saving으로 바뀌므로 이전 성공 문구를 숨긴다. 오류는 저장 재시도/JSON 백업 안내를 제공하며
  ADR-010 이후 저장 오류는 useAutosave 단일 소유다. 후속 자동 저장 성공도 이전 수동 실패 안내를 해제한다.
  새로운 status/alert role은 추가하지 않아 재생 output/기존 오류 선택자와 충돌하지 않는다.
- IndexedDB 성공은 기존 transaction.oncomplete 기준이다. transaction 실패는 put이 성공했더라도 실패이며,
  해당 transaction의 쓰기는 롤백되어 직전 커밋된 정상 레코드가 유지된다. 실패 시 메모리 Score와 편집 이력은 유지한다.
  여러 snapshot을 저장하는 flush 전체를 하나의 DB transaction으로 바꾸지는 않는다.
- 편집하지 않은 정상 baseline은 이미 저장된 것으로 확인하므로 버튼을 눌러도 중복 쓰기하지 않는다.
  지원 v1의 읽기만으로 자동 재저장하지 않는 정책과 손상/미지원 저장본의 쓰기 차단도 유지한다.
  제목/설정 폼의 미적용 입력값은 canonical Score가 아니므로 저장 버튼이 그 폼을 자동 적용하지 않는다.
- ScoreRepository 반환 계약/저장소/상태 관리/Command/Undo/Redo/Part.ties/schemaVersion 2/배포 설정 불변.
  기존 포트와 저장 흐름의 호환 가능한 보완이며 구조 변경 ADR은 필요하지 않다.
- 강제 종료/탭 닫기/직접 URL 이동/뒤로가기의 비동기 저장 완료, 정상 레코드 간 다중 탭 충돌,
  브라우저 데이터 삭제는 여전히 보장 범위 밖이다. 수동 저장은 완료 표시를 확인한 시점의 로컬 저장 확인 수단이다.


## ADR-010 — 현재 저장 계약 (이전 절의 저장 계약/제한보다 우선)

- ScoreRepository는 `read(id): Promise<{score: Score; revision: number} | null>`을 제공한다.
  `load(id)`는 Score만 반환하는 읽기 전용 호환 투영이다. null은 실제 미존재만 뜻한다.
  Tombstone은 `ScoreConflictError("DELETED")`, revision 불일치는 `CONFLICT`, 읽기/검증 실패는 기존 ScoreReadError다.
- `create(score): Promise<number>`는 없는 ID에만 최초 revision 1을 커밋한다.
  `save(score, expectedRevision)` / `delete(id, expectedRevision)`는 필수 CAS이며 새 revision을 반환한다.
  versionless upsert 없음. 기존 envelope 검증·revision 비교·put은 동일 readwrite transaction에서 실행한다.
  put 성공이 아닌 transaction.oncomplete 뒤에만 성공한다. abort는 원본 및 revision을 보존한다.
- `list()`의 summary에도 revision이 포함되며 삭제 UI는 목록에서 받은 revision을 전달한다.
  삭제는 물리 delete가 아니라 `{id, revision, deleted:true, deletedAt}` Tombstone을 쓴다. 자동 만료/정리 없음.
- DB version 2 / store `scores` 유지. 음악 JSON의 schemaVersion 2와는 별개다.
  정상 legacy envelope의 revision 부재는 0이다. 읽기만으로 row를 쓰지 않으며 다음 정상 수정/삭제 때 전환한다.
  손상/미지원/잘못된 revision 레코드는 쓰기·삭제 모두 거부한다. 지원 음악 v1→v2 메모리 변환은 유지한다.
- 구버전 v1 연결이 열려 있으면 blocked 오류로 백업/이전 탭 닫기/재진입을 안내한다.
  이미 발행된 IDB open 요청은 취소할 수 없어 이전 연결 종료 뒤 DB 버전 전환이 완료될 수 있지만 row를 변환하지 않는다.
  versionchange를 받은 새 코드 연결은 닫고 이후 쓰기를 거부한다. DB2에 구버전 v1 open은 VersionError다.
  재개하려면 최신 앱을 다시 연다. DB 삭제/다운그레이드/원본 일괄 변환은 하지 않는다.
- openOrCreateScore는 revision을 반환한다. 동시 최초 생성 경합은 편집 세션 생성 전 승자의 저장본을
  읽기만 해서 연다(쓰기 재시도 없음). 이미 열린 편집 세션의 충돌은 자동 재열기/병합하지 않는다.
- `subscribe?`는 `{id,revision,kind}` BroadcastChannel 힌트다. 커밋 후에만 전송한다.
  수신 시 DB를 재조회하며 payload의 revision을 baseline으로 사용하지 않는다. 누락/중복/지연/전송 실패/미지원에도 CAS는 동일하다.
- `useAutosave(repository, delayMs, controlRef, initiallySaved, initialRevision)`가 session baseline revision과
  `idle|saving|saved|error|conflict|deleted` 상태의 단일 소유자다. 자동/수동/cleanup 쓰기를 직렬화한다.
  같은 내용도 수동 flush에서는 DB revision을 확인한다. 실제 최신 snapshot의 commit 확인 없이 saved로 표시하지 않는다.
  SaveButton은 요청 진행/handle 호출 예외만 관리하고 영속 저장 오류를 별도로 보존하지 않는다.
- 충돌/삭제 시 예약·후속 자동/수동/cleanup 저장을 차단하며 메모리 Score와 past/future는 유지한다.
  JSON 백업, 새 ID로 검증 후 create, 확인 후 최신본 열기만 제공한다. 강제 덮어쓰기/자동 병합/자동 재시도 없음.
- 앱 내부 홈/악보함 이동은 기존 flush 성공 조건 유지. dirty 상태에만 beforeunload를 연결하고,
  hidden 시 동일 대기열로 조기 flush, focus/pageshow 시 DB revision을 확인한다. 확인 후 최신본 재열기만
  allowDiscard로 이탈 안내를 해제한다. 일반 브라우저 강제 종료/SPA 뒤로가기의 최종 비동기 commit은 보장하지 않는다.
- JSON 백업은 envelope 없는 canonical Score 그대로다. revision/Tombstone/UI 상태는 포함하지 않는다.
  Web Locks/복구 저널/새 저장소/상태 라이브러리/배포 변경 없음. ADR-010의 사용자 승인을 근거로 포트만 확장했다.


## Phase 2-1 — 조옮김 순수 도메인 엔진

- 사용자 승인 음악 정책(2026-11-08)에 따른 호환 가능한 도메인 기능 추가다. 이 엔진 자체는 UI/Command dispatch/저장을 수행하지 않는다.
  새 라이브러리/상태 관리/아키텍처 레이어/Score 모델/ADR-010 변경 없음.
- `@/domain/music-theory`:
  - `intervalBetweenKeys(source, target, direction = "nearest")` → 반음·음이름 이동량.
  - `transposePitch(pitch, interval)` → 특정 음정으로 옮긴 검증된 Pitch.
  - `transposeKeySignature(key, interval)` → 같은 음정·모드를 유지하는 지원 조표.
  - `TransposeInterval = {deltaSemitones, diatonicSteps}`. diatonicSteps는 0기준 문자 이동량이며 장2도는 {2,1}, 옥타브는 {12,7}이다.
- `@/domain/score`: `transposeScore(score, spec)` → `TransposeResult<{score, interval}>`.
  spec은 `{kind:"semitones", semitones}` 또는 `{kind:"targetKey", targetKey, direction?}`다.
  성공은 `{ok:true,value}`, 실패는 `{ok:false,error:{code,message,partId?,eventId?}}`이며 실패에 부분 Score를 포함하지 않는다.
- 목표 조성은 첫 Part를 기준으로 해석하고 동일한 반음·문자 음정을 모든 Part에 적용한다.
  각 Part의 원래 장단조/상대 조성을 유지한다. 어느 Part의 목표 조표도 표현 불가하면 전체 거부한다.
  지정한 목표 철자는 자동 교체하지 않는다. 장조↔단조 변환은 MODE_CHANGE_NOT_SUPPORTED다.
- nearest는 ±6 동률을 +6으로 선택한다. up/down은 해당 방향의 옥타브 미만 이동이며 같은 pitch class는 0이다.
  옥타브/복합 음정은 반음 입력으로 지정한다. C#→Db 등은 MIDI 이동 0이어도 다른 문자 이동량을 가질 수 있다.
- 표기는 원본의 문자·옥타브를 diatonicSteps만큼 이동하고 `newMidi - naturalMidi`로 alter를 구한다.
  음표마다 간단한 이명동음을 따로 고르지 않는다. 기존 피아노 midiToPitch는 사용하지 않는다.
- 자동 반음 조옮김은 지원 목록의 목표 조표 후보마다 전체 Score를 검증한다. 우선순위는:
  1. 전체 모델 표현 가능성, 2. 동일 음정으로 목표 조성에 맞는 철자,
  3. 모든 Part의 `abs(fifths)` 합 최소, 4. 원래 비중립 샵/플랫 부호와 달라지는 Part 수 최소,
  5. 기존 KEY_SIGNATURE_OPTIONS 순서(-7→+7)의 고정 우선순위.
  예: C장조 +1은 일반적으로 Db장조, 중립 C장조 +6 동률은 Gb장조다.
  표현 가능성이 우선이므로 C0의 -1은 B-1 대신 Cb0/Cb장조를 선택할 수 있다.
- 12의 배수 이동은 조표 철자를 유지하고, 0반음은 원본 Score를 그대로 반환한다(원본 검증 후).
  반음 입력/중간 계산의 안전한 정수 여부를 검사한다. 잘못된 입력/조표, MIDI 초과, 표기 불가,
  모드 변환, Score 불변식 실패를 구분한다. MIDI 0~127 외에 octave 0~9 및 alter -2~2를 독립 검사한다.
- 정상/실패 모두 원본을 수정하지 않는다. ID/ties/쉼표/위치/길이/박자/템포/velocity/provenance/
  createdAt/updatedAt 등 메타데이터를 유지한다. 타이를 병합·재분할하거나 이벤트를 재배치하지 않는다.
  결과 전체를 validateScore로 검증하며 source 조표도 isSupportedKeySignature로 확인한다.
  기존 validateScore/SetKeySignature/저장본 읽기 정책을 강화하거나 자동 보정하지 않는다.
- Phase 2-2의 Command/updatedAt/no-op/Undo·Redo/저장 경계 구현은 아래 절을 따른다.
  미리보기 무쓰기는 아래 Phase 2-3 계약을 따른다. 엔진에서 후보를 store.init/Repository에 쓰지 않는다.

## Phase 2-2 — TransposeScore Command / snapshot 이력

- 공개 EditCommand에 `{type:"TransposeScore", spec:TransposeSpec, updatedAt:string}` 추가.
  spec/엔진은 Phase 2-1 그대로 재사용하며 CommandErrorCode에 TransposeErrorCode를 포함한다.
  CommandResult의 성공/실패 모양과 기존 명령 의미는 유지한다.
- 새 case는 transposeScore를 한 번 호출한다. 모든 Part 검증 뒤 하나의 Score만 공개한다.
  실제 변경은 각 Part의 KeySignature 4필드와 모든 NoteEvent의 Pitch 4필드 값으로 비교한다.
  deltaSemitones 0, 참조/JSON property order, Score ID/timestamp/메타데이터만으로 판정하지 않는다.
  레이아웃/ID/리듬 보존은 기존 엔진 계약을 따른다.
- no-op은 `{ok:true,score:원본}`으로 반환한다. 빈/쉼표 악보의 옥타브 이동도 no-op이다.
  C#→Db 등의 MIDI 0 이동도 조표/철자가 다르면 실제 편집이다(음표 없는 조표 변화 포함).
- 실질 변화에만 주입받은 updatedAt을 적용하고 기존 finalize로 검증한다. 시각을 직접 읽지 않는다.
  기존 AddNote 등 다른 명령의 timestamp 정책은 바꾸지 않는다.
- applyCommand는 실패/같은 Score에 기존 session/past/future를 그대로 반환한다.
  실제 편집은 snapshot 1개를 past에 추가하고 future를 초기화한다. store.dispatch는 session 변경만 notify한다.
  no-op/실패는 autosave 상태와 debounce를 건드리지 않는다. undo/redo 로직 자체는 변경하지 않는다.
  undo는 원래 updatedAt, redo는 조옮김 때 주입한 updatedAt을 포함한 정확한 snapshot을 복원한다.
- 저장 상태/revision은 여전히 useAutosave 소유다. Command 성공은 메모리 편집이며 DB 커밋을 뜻하지 않는다.
  기존 구독→flush→expectedRevision CAS만 사용한다. no-op/실패는 무쓰기·revision 불변이다.
  저장 실패/OCC/삭제는 ADR-010이 처리한다. 저장 구현·스키마·정책 변경 없음.
- Phase 2-3 인수인계(Phase 2-2 당시; 구현은 다음 절): 미리보기는 순수 엔진 후보만 사용하고 store.init/dispatch/save 하지 않는다.
  취소는 후보만 폐기한다. 확정은 원본 세션 동일성/유효 후보/알려진 충돌·삭제 상태를 확인한 뒤
  최신 경계 timestamp로 Command를 한 번 dispatch한다. 오래된 후보를 자동 덮어쓰지 않는다.
  실제 미리보기·취소·화면 저장 경합은 Phase 2-3/2-4 별도 검증 대상이다.
- schemaVersion 2/Part.ties/JSON/DB2/ADR-010/SetKeySignature/렌더러/재생/의존성 불변.
  기존 아키텍처 안의 기능 추가이며 구조 변경 ADR/아키텍처 검사 규칙 변경은 없다.

## Phase 2-3 — 조옮김 미리보기 / 확정 / 취소

- `@/features/transposition` 공개 진입점의 `TransposeTool({autosave,status,onOpen?})`를 편집기에 연결한다.
  기존 UI 패턴에 맞춘 인라인 패널이며 컴포넌트 로컬 상태만 사용한다. 전역 Store/라이브러리를 추가하지 않는다.
- 열 때 `scoreStore.getState()`의 불변 EditSessionState 참조와 현재 저장 revision을 포착한다.
  목표 조성은 첫 Part와 같은 모드의 기존 지원 목록만 제공하고 방향은 nearest/up/down, 기본 nearest다.
  현재 조성·반음/방향 정보는 기존 목록과 `transposeScore` 결과를 표시한다. 별도 음악 이론 계산은 없다.
- 후보는 포착한 Score와 TransposeSpec에 대한 순수 엔진 결과를 useMemo로 계산한다.
  Store 초기화/Command/Undo/Redo/updatedAt/dirty/저장/revision/변경 알림을 발생시키지 않는다.
  `StaffView`에 후보를 전달한다. 기존 첫 Part 표시 정책을 유지하며 다중 Part이면 제한을 화면에 알린다.
  실제 변환/확정은 모든 Part를 대상으로 한다. 미리보기에는 편집/별도 재생 기능을 제공하지 않는다.
- `AutosaveHandle.getSnapshot?()`은 `{revision,status}`를 동기적으로 읽는 호환 가능한 추가 계약이다.
  기존 useAutosave 소유 revision과 report가 갱신하는 status의 읽기 전용 조회이며 Repository IO/flush를 수행하지 않는다.
  필드가 없는 구형 대역/초기화 전에는 미리보기 확정을 허용하지 않는다. Score/DB에는 필드를 추가하지 않는다.
- 렌더 시와 확정 직전에 동일 session 참조와 revision을 확인한다. 같은 ID/updatedAt만으로 판단하지 않는다.
  편집/Undo/Redo/다른 세션 또는 revision 변경은 stale이다. conflict/deleted/error는 확정을 막는다.
  확정 직전에는 React props보다 최신인 Store/저장 getter를 다시 읽는다. 검사와 dispatch 사이 await는 없다.
  알려지지 않은 외부 변경의 최종 저장 검증은 기존 ADR-010 OCC가 담당한다. UI 확인이 DB 잠금은 아니다.
- 확정은 기존 `{type:"TransposeScore",spec,updatedAt}`를 동기 dispatch 한 번만 수행한다.
  후보 자체를 Store에 덮어쓰지 않는다. timestamp는 기존 편집 UI와 같이 경계에서 생성한다.
  성공 때만 닫으며 실패는 사용자 설명과 함께 유지한다. 실제 변경/no-op/실패의 이력·timestamp 정책은 Phase 2-2 그대로다.
  중복 확정은 로컬 latch로 막으며 실패 후 재시도는 허용한다. MIDI 0만으로 no-op을 판단하지 않는다.
- 취소/Escape는 후보와 패널 상태만 폐기하고 진입 버튼으로 포커스를 되돌린다.
  커서/원본/이력/저장 상태/원시 레코드를 수정하거나 역방향 Command를 실행하지 않는다.
- 미리보기 열기는 PlaybackControls의 선택적 stopSignal로 기존 재생/미완료 초기화 정리 경로를 호출한다.
  Score와 메트로놈 선택은 보존한다. 재생 하이라이트 DOM 범위는 원본 편집 영역으로 한정하여 후보와 분리한다.
  Tone.js 어댑터/엔진 및 VexFlow 렌더러는 변경하지 않는다.
- schemaVersion 2/Part.ties/Command/Undo/Redo/JSON/DB2/ADR-010/저장 구현/의존성 유지.
  영속 모델·저장 포트의 구조 변경이나 새 ADR은 없다. 실제 기보·오디오·저장 복합 인수는 Phase 2-4다.

## Phase 2-4 — 조옮김 기보·재생·저장 정합성 검증

- 제품 계약/구현 변경 없이 기존 TransposeScore→snapshot 이력→VexFlow/Tone/IndexedDB/JSON 경계를 통합 검증한다.
  `tests/integration/transpose-consistency.test.ts`는 실제 VexFlow StaveNote/Accidental/Voice의 철자·오선 위치·임시표를 검사한다.
  DOM 그리기/레이아웃만 대역이며, Tone은 Frequency의 MIDI 단위 입력 및 어택 인자/지속시간을 캡처한다.
  실제 SVG 픽셀이나 스피커 출력이 검증됐다는 의미는 아니다.
- 첫 Part의 표기와 재생이 같은 canonical Pitch를 소비함을 확인한다. MIDI가 같은 E#/F, B#/C 등의
  표기 차이는 보존하며 타이 체인은 한 어택으로 전체 길이를 지속한다. 일반음 90% gate는 유지한다.
- 복수 Part는 기존 계약을 유지한다: 엔진·Command·저장/JSON은 모든 Part를 보존·변환하지만
  StaffView/playScore/재생 커서는 첫 Part만 표시·재생한다. 전체 Part의 동시 기보/재생은 미지원이다.
  이 제한을 테스트에 명시하며 이번 작업에서 다중 성부 재생 엔진이나 새 모델을 도입하지 않는다.
- 실제 IndexedDB adapter + fake-indexeddb에서 DB2, 동시 expectedRevision CAS 한 승자,
  원시 레코드/패자 메모리·Undo/Redo 보존, Tombstone 후 저장/직접 열기 차단을 재검증한다.
  알림 구독 없이도 OCC가 보호하며 BroadcastChannel을 동시성 보장의 대체물로 사용하지 않는다.
- 신규 브라우저 검증과 실제 오디오 청취/Safari/모바일 결과는 TEST_PLAN §26에 구분한다.
  schemaVersion 2/Part.ties/ADR-010/저장 쓰기 경로/의존성/렌더러/재생 구현은 변경하지 않는다.

## Phase 2-5 — 음이름·고정도법 악보 라벨

- `NoteLabelMode = "none" | "letter" | "fixed-do"`, `formatNoteLabel(pitch,mode): string|null`을
  music-theory 공개 진입점에 추가한다. 기존 letterName/koreanFixedDo를 호출하고 표시 기호만
  #/b/##/bb → ♯/♭/𝄪/𝄫로 바꾼다. 기존 ASCII 함수/피아노 키·선택 정보 계약은 유지한다.
  letter는 표기 octave 포함, fixed-do는 생략하며 조성과 무관하게 C=도다. none은 null이다.
- Pitch.step/alter/octave는 이미 완전한 기보 철자다. 조표를 다시 적용하거나 MIDI로 재표기하지 않는다.
  E#/F, B#/C, Cb/B와 겹임시표를 구별한다. Score/Pitch/schemaVersion/Command를 변경하지 않는다.
- Editor의 기존 로컬 표시 상태를 none 기본값으로 확장하고 기존 라벨 버튼 자리에
  `NoteLabelsControl`(표시 안 함/음이름/계이름)을 둔다. mode는 StaffView와 TransposeTool에 전달된다.
  악보 라벨을 숨겨도 기존 음표 목록의 식별용 음이름 버튼은 유지한다. 새로고침 시 none이다.
- StaffView/renderScoreInto의 선택적 labelMode 기본값은 none이며 기존 호출자와 호환된다.
  첫 Part만 표시한다. VexFlow Annotation을 음표 아래에 부착하고 tie.to 연장은 생략하며 쉼표도 제외한다.
  타이/음표/마디 ID나 리듬은 바꾸지 않는다. 별도 SVG/기보 엔진이나 라벨 음악 모델을 만들지 않는다.
- 라벨 모드는 VexFlow Annotation/Formatter의 최소 폭과 실제 clef/key/meter 이후 음표 시작 위치로
  마디 폭을 계산한다. 행 간격을 확보하고 전체 SVG viewBox를 라벨/음표 외곽까지 확장한다.
  none은 기존 기보 배치 경로를 유지한다. 실제 기기 폰트/극단 음역·다중 행 간격 인수는 TEST_PLAN §27에 남긴다.
- 라벨 SVG 그룹은 data-testid="note-label", data-label-event-id/aria-label로 식별하며
  pointer-events:none/user-select:none이다. 기존 data-event-id는 음표/쉼표 그룹에만 유지한다.
  표시 재렌더 때 현재 data-playing ID를 재적용한다. 원본/후보 DOM 하이라이트 범위 분리는 유지한다.
- 표시 변경은 setState와 read-only 렌더만 수행한다. dispatch/store.init/flush/repository 호출이 없다.
  Score/이력/updatedAt/dirty/revision/IndexedDB/JSON/BC는 변경하지 않는다. useAutosave/ADR-010/Tone 구현도 그대로다.
  알려진 충돌/삭제 상태를 라벨 변경으로 해제하거나 저장을 재개하지 않는다.
- 후보는 자신의 Pitch와 공유 mode로 표시되며 모드 변경은 preview baseline을 무효화하지 않는다.
  확정/취소/Undo/Redo는 기존 Command/세션 경로다. Label mode는 별도 Command/영속 필드가 아니다.
  Phase 2-6 음역 분석/추천은 아래 절을 따른다.

## Phase 2-6 — 전체 Part 음역 분석 및 조옮김 추천

- `analyzeScoreRange(score): RangeAnalysis`는 canonical NoteEvent.pitch 전체를 읽는 순수 투영이다.
  전체/Part별 minMidi/maxMidi, 복사된 lowest/highest Pitch와 기존 철자의 음이름, 반음 폭,
  noteEventCount/ logicalNoteCount, empty를 제공한다. 쉼표는 제외하며 tie.to는 발음 수에서만 제외한다.
  같은 MIDI의 서로 다른 철자는 Score 배열 순서에서 먼저 만난 것을 극값 이름으로 유지한다.
  음표가 없으면 extrema/이름/폭은 null이다. 화음 모델/새 음악 좌표계를 추가하지 않는다.
- 분석은 입력 검증을 대체하지 않는다. 기존 import/edit 경계에서 검증된 Score를 소비한다.
  숫자 분석은 MIDI 0도 읽지만, 현재 Score v2의 octave 0~9 제약상 C-1 저장본은 무효다.
  목표 MIDI 0~127 입력은 허용하되 실제 후보는 기존 엔진의 MIDI/octave/alter/Score 검증을 모두 통과해야 한다.
- `recommendTranspositions(score,{minMidi,maxMidi})`는 정수/0~127/min≤max를 검증하고
  기존 transposeScore의 0반음 호출로 원본 유효성·지원 조표를 확인한다. 빈 악보는 후보 없이 반환한다.
  같은 모드의 지원 조표 15개×nearest/up/down 3방향과 -127~127반음 255개, 총 300개 요청을
  명시적으로 열거하여 기존 엔진만 호출한다. 옥타브 이동도 포함하며 장↔단조 변환은 만들지 않는다.
- 성공 후보는 전체 Part 음역을 다시 분석한다. 임시 Score는 외부 Store/저장소에 전달하지 않고 폐기한다.
  동일 반음·음이름 이동량 쌍은 같은 원본에 동일 음악 결과를 주므로 하나로 합친다.
  다른 이명동음 철자는 별도 후보로 유지한다. 실패 spec/error는 rejected에 기록한다.
- 정렬은 전체 적합→abs(delta) 최소→동률 상행→동일 delta의 기존 반음 엔진 자동 철자 우선
  →지원 조표 고정 순서→음이름 이동량이다. 자동 철자/0·옥타브 보존 정책은 엔진 결과를 그대로 따른다.
  별도 음높이 변환·이명동음 선정 알고리즘이 없다. 부분 후보는 낮음/높음 초과 반음과
  논리적 발음별 위반(Part ID/이벤트 ID/철자/MIDI/초과량)을 제공한다.
- TransposeTool은 항상 현재 전체 음역을 표시하고 기존 미리보기 안에 RangeRecommendations를 둔다.
  공통 목표 음역은 컴포넌트 로컬 상태다. 기존 midiToPitch/formatNoteLabel은 목표 MIDI 이름 표시에만 사용한다.
  MIDI 기본 샵 표기는 목표 입력 설명에 한정하며 원본/후보 철자는 재선택하지 않는다.
- 추천 계산은 명시적 버튼에서 수행한다. 전체 적합 상위 8개, 없으면 부분 적합 상위 5개를 구분해 표시한다.
  목표 변경은 목록과 선택 추천을 무효화한다. 오래된 목표 요청의 버튼 콜백도 선택할 수 없다.
  모든 음을 목표에 넣는 유효 후보가 없다는 사실 및 범위 밖 음/초과량을 명시한다.
- 후보 선택은 원본 session 참조/revision/저장 상태를 다시 검사한 뒤 미리보기 spec만 갱신한다.
  원본 편집/Undo·Redo/세션·revision 변경, error/conflict/deleted에서 선택과 확정을 차단한다.
  최종 확정만 기존 TransposeScore Command 1회다. 후보 Score 대입/새 저장 경로/자동 병합은 없다.
  추천의 반음 spec은 옥타브를 포함하며 조성/방향을 수동 변경하면 추천 override를 해제한다.
- 분석·계산·선택·취소는 Score/이력/updatedAt/dirty/revision/IndexedDB/JSON/BC를 변경하지 않는다.
  최종 저장 충돌 보호는 기존 ADR-010 OCC다. schemaVersion2/Part.ties/DB2/기존 엔진·Command·저장·재생 구현 유지.
  분석은 모든 Part, 기보·재생은 기존 첫 Part 한정이다. 악기 프리셋/운지법/실제 연주 가능성 판단은 제공하지 않는다.

## H-01 — 유효한 긴 타이 체인 읽기·재생 (2026-11-09)

- Score schemaVersion 2/Part.ties/DB2/ADR-010/Command·저장 계약은 유지한다.
- `MAX_TIE_SEGMENTS = 64`는 `splitNoteIntoMeasures`의 **한 번의 생성/재분할 작업** 한계다.
  정상 저장본/JSON의 체인 길이 상한으로 사용하지 않는다. 기존 생성 한계·오류는 변경하지 않는다.
- `chainIdsOf`와 `mergeTiedNotes`는 순회 전에 기존 `findTieIssues`로 연결 관계를 검사한다.
  유효한 체인은 저장된 ID가 끝날 때까지 방문 집합으로 순회한다. 66·67·128세그먼트도 끝까지 처리한다.
  같은 ID 재방문은 순환 오류이며, 잘못된 참조·쉼표 참조·분기·불연속·Pitch 불일치를 부분 체인으로 숨기지 않는다.
- 직접 순회 함수에 잘못된 ties를 주면 `TIE_*` 코드를 포함한 Error를 던진다. 정상 편집 세션은 기존
  deserializeScore/validateScore 경계를 통과한 Score를 사용한다. JSON 오류는 기존 실패 결과로 반환되고 저장하지 않는다.
  기존 unknown event ID에 대한 chainIdsOf의 빈 목록 계약은 유지한다.
- 검증의 순환 검사도 방문 ID로 종료한다. 고정 64링크만 보고 긴 순환을 놓치지 않으며 무한 반복하지 않는다.
- 병합은 체인 머리의 MIDI/velocity·시작 tick과 마지막 세그먼트 끝으로 단일 지속음을 만든다.
  연속성이 검증되므로 총 길이는 각 세그먼트 길이의 합과 같다. Tone 예약·gate·pause/resume은 그대로 사용한다.
- 66×960 = **63360 ticks**, 120BPM에서 **33초**, 한 어택으로 전달됨을 호출 데이터로 검증했다.
  실제 스피커 청취를 자동 검증한 것은 아니다. H-02의 비표기 음가·VexFlow 근사 문제는 변경하지 않았다.

## H-02 — 정확한 렌더링 projection (2026-11-09)

- `decomposeNotationDuration(ticks)`는 기존18음가의 정확 합 또는 명시적 NotationIssue를 반환한다.
  반올림하지 않는다. 최소 요소 수/동률 긴 음가 우선. `planPartNotation(part)`은 원본 이벤트 ID와
  tick을 참조하는 읽기 전용 fragment 배열 또는 마디/이벤트/시작/길이가 있는 실패 결과다.
- 렌더 안전 상한: 이벤트64 fragment/430080ticks, Part1024마디/4096 tickable(GhostNote 포함).
  이는 저장·가져오기 검증 한계가 아니다. Score v2/Part.ties/Command/DB2/OCC에는 새 필드나 제한을 넣지 않는다.
- VexFlow는 정확 token+실제 Dot, note fragment 사이의 가상 타이, canonical tie의 양끝 fragment를 사용한다.
  rests는 타이 없이 분해한다. GhostNote의 rational tick과 후행 공백으로 비어 있지 않은 strict Voice를 채운다.
  first Part 표시 정책 유지. fragment의 data-event-id는 원본 ID, 라벨은 첫 fragment에만 표시한다.
- `renderScoreInto`는 기보 불가 시 NotationRenderError를 던지고 이전/부분 SVG를 지운다.
  AbortSignal/최신 요청 확인으로 폐기된 비동기 draw를 차단한다. StaffView는 notation-error 안내와
  기존 Score 접근을 유지하고, 선택 callback은 원본 이벤트로만 전달한다. 미리보기는 읽기 전용이다.
- 기보 불가 후보의 조옮김 확정은 UI에서 차단한다. 도메인 엔진/Command/저장 경로는 변경하지 않는다.
  기보 오류는 손상 저장본 오류가 아니며, 원래 음가의 재생·JSON 백업·정상 저장을 차단하지 않는다.

## D-01 — Phase 3 runtime·클립보드 정책 확정 (2026-11-11 사용자 승인)

Claude Code 세션에서 사용자가 질의에 직접 답해 확정했다. 새 모델/DB 필드/의존성/ADR 변경은 없다.

- **재생 중 연습 속도 변경 = 현재 위치에서 즉시 재예약.** playing은 이전 시계로 현재 tick을 확정하고
  이전 예약·음성·클릭을 모두 해제한 뒤 같은 tick부터 남은 음을 새 속도로 다시 예약한다.
  지속 중인 음(타이 포함)은 남은 길이만 1회 다시 어택한다. paused는 tick을 유지하고 resume부터 적용한다.
  stopped/자연 종료 후에는 다음 Play부터 적용한다. "정지 후 다음 Play부터 적용" 대안은 채택하지 않았다.
- **C-08 클립보드 = 기존 제안안 그대로 확정.** 첫 Part·같은 문서·메모리 clipboard(시스템 clipboard 미사용).
  선택은 연속 `[startTick,endTick)`이며 타이 체인을 자르는 선택은 거부한다(전체 체인 선택 안내).
  붙여넣기는 빈 대상에만 허용하고 충돌·마디 부족·표기 실패는 부분 적용 없이 거부한다.
  덮어쓰기·뒤 이벤트 자동 밀기·자동 마디 추가·자동 타이 절단 없음. Pitch 철자/MIDI는 보존하고 몰래 조옮기지 않는다.
  붙여넣는 이벤트는 fresh ID와 타이 참조 매핑, 단일 원자 Command/1회 Undo. Cut은 성공 시에만 clipboard를 교체한다.
- **A–B loop(2026-11-11 후속):** 사용자가 "A–B 반복 진행"을 지시했다. 끝 경계 예약 방식과
  설정 유지/초기화 정책은 개별 질의 없이 아래 "Phase 3 — A–B 반복" 절의 구현 기본값으로 정했다.
  당시에는 사용자 명시 승인 항목이 아니었으나 **2026-11-13 사용자가 그대로 확정했다**(TASKS §20).

## Phase 3 — 비파괴 연습 속도 (P3-01~03, 2026-11-11)

- `@/domain/score`(기존 `playback.ts`)에 순수 계산을 추가했다: `PRACTICE_RATE_MIN = 0.25`,
  `PRACTICE_RATE_MAX = 1.5`, `DEFAULT_PRACTICE_RATE = 1`, `isValidPracticeRate(rate)`,
  `effectiveTempoBpm(tempoBpm, rate)`, `playbackSecondsPerTick(tempoBpm, rate = 1)`.
  범위 밖·0·NaN·Infinity·비숫자는 반올림/clamp하지 않고 RangeError로 거부한다.
  실효 템포는 재생 계산 전용이며 Score의 20–400 BPM 검증 범위로 clamp하지 않는다(20×0.25=5, 400×1.5=600).
  5% 단계는 UI 정책이며 도메인은 범위 안의 유한 실수를 허용한다.
- `playScore(score, options)`에 선택적 `rate`(기본 1)를 추가했다. 기존 호출은 그대로 동작한다.
  잘못된 rate는 Tone import/음성 생성 전에 거부한다. 음표·쉼표 간격·타이·메트로놈 클릭·커서가
  같은 `tickSeconds` 하나를 사용한다. MIDI/주파수와 gate(일반 0.9/타이 1/최소 1ms)는 변경하지 않는다.
- `PlaybackHandle.setRate(rate)`를 추가했다(D-01 정책). 같은 값·종료 후 호출은 no-op, 잘못된 값은
  RangeError이며 진행 중 재생과 예약을 건드리지 않는다. 재예약은 기존 pause→resume과 같은
  release()/start() 수명을 재사용한다. 새 재생 엔진·전역 AudioContext·Tone.Transport를 도입하지 않았다.
  25ms 타이머는 여전히 UI 알림 주기이며 시계가 아니다.
- `PlaybackControls`에 연습 속도 슬라이더(25–150%, 5% 간격, 기본 100%)와 프리셋 50/75/100/125%,
  실효 BPM 표시를 추가했다. 정수 퍼센트의 컴포넌트 로컬 state/ref만 사용한다.
  Command/Store/IndexedDB/JSON/Undo/revision에 관여하지 않는다. 오디오 초기화 중 바꾼 값은 초기화 완료 직후 적용한다.
  새 status/alert role은 추가하지 않았다(`data-testid="practice-rate"` span).
- **세션 유지 정책(구현 기본값, 2026-11-13 사용자 확정):** 연습 속도는 Stop·Pause·Score 편집·Undo/Redo·
  조옮김 미리보기 진입 후에도 같은 편집기 세션에서 유지된다. 새로고침/편집기 재진입 시 100%로 초기화된다.
  Score 편집 시 재생을 정지하는 기존 정책은 그대로다.
- Score schemaVersion 2/Part.ties/Command/Repository/DB2/ADR-010/의존성/레이어 불변. ADR-004의 구현이며 새 ADR은 없다.
  녹음 오디오의 피치 보존 타임스트레치는 제공하지 않는다(PRD MVP-008).

## Phase 3 — A–B 반복 (P3-04~05, 2026-11-11)

- `@/domain/score`(기존 `playback.ts`)에 읽기 전용 계약을 추가했다: `PlaybackLoop {startTick,endTick}`(반열림 `[A,B)`),
  `PlaybackLoopIssue = NOT_INTEGER | EMPTY_RANGE | OUT_OF_SCORE`, `playbackLoopIssue(score, loop)`,
  `scoreLengthTicks(score)`(첫 Part 전체 마디 길이, 후행 빈 마디 포함), `measureRangeLoop(score, first, last)`
  (1부터 세는 포함 마디 → tick, 범위 밖은 null), `playbackLoopTick(loop, originTick, elapsedTicks)`.
  Score/Part.ties/JSON/Command에 필드를 추가하지 않는다. 첫 Part 한정(기존 재생 범위와 동일).
- `playScore(score, {loop})`와 `PlaybackHandle.setLoop(loop | null)`을 추가했다. 기존 호출은 그대로다.
  잘못된 범위는 Tone import/음성 생성 전(또는 live handle에서 예약을 건드리기 전) RangeError로 거부한다.
- **경계 의미:** loop가 있으면 A에서 시작한다. B 이후는 예약하지 않고 B에서 시작하는 이벤트는 다음 pass에 속한다.
  B를 넘는 음은 B에서 끝낸다. A가 지속음(타이 포함) 중간이면 남은 부분만 pass마다 1회 어택한다.
  gate는 기존 정책(일반 0.9/타이 머리 1/최소 1ms)을 잘린 길이에 그대로 적용한다. 타이 연결은 수정하지 않는다.
  메트로놈 클릭도 `[A,B)` 안의 박만 예약하며 경계 박은 한 번만 울린다. loop 재생은 스스로 끝나지 않는다(onEnd 없음).
- **예약 방식(rolling):** pass k의 시작 시각은 `startAt + ((B−origin) + (k−1)(B−A))·tickSeconds`의 순수 오디오 시각 계산이다.
  25ms 타이머는 앞으로 2초(`LOOP_LOOKAHEAD_SECONDS`) 안에 시작하는 pass를 미리 채우는 역할만 하며 경계 시계가 아니다.
  한 번의 보충은 최대 64 pass다. 음성(Synth)은 재생 구간 동안 하나를 재사용한다. 새 엔진/Transport/전역 AudioContext 없음.
  한계: 메인 스레드가 2초 넘게 멈추면 다음 pass 예약이 늦을 수 있다(실측 미수행).
- **live 변경:** `setLoop`/`setRate`는 같은 재예약 수명(현재 tick 확정 → release → start)을 공유한다.
  loop를 켤 때 현재 tick이 `[A,B)` 안이면 유지하고 밖이면 A로 이동한다. 끄면 현재 tick부터 끝까지 선형 재생한다.
  paused는 조용히 적용되어 resume부터 반영된다. 동일 범위/종료 후 호출은 no-op이다. Stop은 tick 0으로 돌아간다.
- `PlaybackControls`: "A–B 반복" 체크박스(기본 OFF)와 "반복 첫 마디"/"반복 마지막 마디" 숫자 입력(기본 1/1),
  상태 표시(`data-testid="practice-loop"`), 잘못된 범위 안내(`practice-loop-error`). 드래그·다중 loop·영속화는 없다.
  tick 범위는 저장하지 않고 **매 렌더마다 현재 Score에서 마디 번호로 다시 계산**한다.
- **설정 유지/무효화 정책(구현 기본값, 2026-11-13 사용자 확정):** 편집·Undo/Redo·조옮김 후에도 마디 번호와 ON 상태를 유지하고,
  새 Score에서 범위가 유효하면 그대로 쓰며 유효하지 않으면 loop를 적용하지 않고 안내를 표시한다(전체 재생으로 동작).
  Score 편집 시 재생 정지는 기존 정책 그대로다. loop가 켜진 재생은 탭이 hidden이 되면 정지한다.
  loop 없는 일반 재생의 hidden 동작은 바꾸지 않았다. 새로고침/편집기 재진입 시 OFF·1/1로 초기화한다.
- 속도/loop 변경만으로 Command/dirty/IndexedDB 쓰기/revision 증가가 없다. ADR-004의 구현이며 새 ADR/의존성/레이어 변경 없음.

## Phase 3 — 연속 구간 선택 projection (P3-06, 2026-11-12)

- `@/domain/score`(신규 `selection.ts`)에 순수 계산을 추가했다: `ScoreRange { startTick, endTick }`(반열린 `[start,end)`),
  `RangeSelection`(범위 + 시간순 원본 `eventIds` + `noteCount`/`restCount` + 범위 안에 완전히 든 `ties` 사본),
  `RangeSelectionIssue = PlaybackLoopIssue | CUTS_EVENT | CUTS_TIE`,
  `selectScoreRange(score, range)`, `selectMeasureRange(score, first, last)`(1부터 세는 포함 마디).
  결과는 `{ ok: true, selection }` 또는 `{ ok: false, issue, message, eventIds }`이며 예외를 던지지 않는다.
  범위 검증과 마디→tick은 기존 `playbackLoopIssue`/`measureRangeLoop`를 재사용한다. 첫 Part 한정.
- **포함 규칙(C-08):** `startTick ≤ event.startTick < endTick`인 이벤트를 담는다. 쉼표는 이벤트로, 빈 구간(gap)은
  범위 자체로 포함된다(이벤트 0개인 선택도 유효). 경계가 이벤트 중간을 지나면 `CUTS_EVENT`, 타이 링크의 한쪽만
  들어오면 `CUTS_TIE`로 거부하고 `eventIds`에 막는 이벤트/체인 전체를, 메시지에 체인이 걸친 마디를 준다.
  자르기·자동 확장·타이 절단은 하지 않는다. Score를 읽기만 한다.
- `RangeSelect`(score-editor 공개 진입점): "구간 첫 마디"/"구간 마지막 마디" 숫자 입력, "구간 선택"·"선택 해제" 버튼,
  상태(`data-testid="range-selection"`, `data-selected`, `data-start-tick`, `data-end-tick`, `data-event-count`),
  오류(`range-selection-error`). 새 status/alert role 없이 `aria-live="polite"`만 쓴다. 폼이므로 키보드로 조작된다.
- 선택 상태는 EditorWorkspace의 React 로컬 state `{ score, selection }` 하나다. 전역 Store/Undo/Command/저장 필드가 없고
  선택·해제는 dirty/IndexedDB 쓰기/revision 증가를 만들지 않는다.
- **stale 무효화:** 선택은 계산에 쓴 Score 객체에 묶인다. 현재 Score가 달라지면(편집·Undo/Redo·조옮김 확정·제목 변경 포함)
  렌더 중 state를 null로 지워 **영구 해제**한다. Undo가 예전 Score 객체를 되돌려도 선택은 되살아나지 않는다.
  다른 문서는 Workspace가 다시 마운트되어 초기화된다. 새로고침 시 선택 없음.
- **하이라이트:** `StaffView`에 선택적 `rangeEventIds`를 추가했다(기존 호출 호환). SVG를 다시 그리지 않고
  `[data-event-id]` 요소에 `data-range-selected="true"`만 붙이며, 다른 이유로 다시 그려진 뒤에도 다시 적용한다.
  VexFlow 어댑터는 변경하지 않았다. 조옮김 미리보기의 StaffView에는 prop을 넘기지 않아 후보 DOM에는 표시되지 않는다.
  음표·쉼표 목록 버튼에도 같은 속성을 준다. `data-playing`(재생)과 `aria-pressed`(단일 선택)와 독립이다.
- **구현 기본값(2026-11-13 사용자 확정):** (1) UI 입력은 마디 단위이며 박 단위 선택은 도메인만 지원한다.
  (2) 거부된 선택 요청은 이전 선택을 유지하지 않고 해제한다. (3) 단일 이벤트 선택(`selectedEventId`)과 구간 선택은
  서로 바꾸지 않는 독립 상태다(우선순위 규칙 없음, 편집 패널은 단일 선택만 따른다).
  (4) 이벤트가 없는 빈 구간도 선택으로 허용한다(복사 가능 여부는 P3-07에서 정한다).

## Phase 3 — Copy/Paste 엔진 (P3-07, 2026-11-12)

- `@/domain/score`(신규 `clipboard.ts`): `ClipboardPayload { lengthTicks, events, ties }`.
  `events[].startTick`은 선택 시작 기준 상대 tick이고 `lengthTicks`가 앞뒤 gap을 보존한다. 이벤트 ID는 원본 ID이며
  `ties`의 키로만 쓰인다. `copyScoreRange(score, range)`는 `selectScoreRange`로 **현재 Score에서 선택을 다시 계산**하므로
  stale 선택을 복사할 수 없다. 결과는 `{ ok, clipboard }` 또는 `{ ok: false, issue, message }`
  (`RangeSelectionIssue | EMPTY_SELECTION`). payload는 Score와 pitch/provenance 객체를 공유하지 않는다.
  Copy는 Score/이력/저장을 바꾸지 않는다. 시스템 clipboard를 쓰지 않는다. payload는 Score/JSON/DB에 저장하지 않는다.
- `@/application`(신규 `clipboard.ts`): `planPaste(score, clipboard, { startTick, createId, partId? })`는 순수 함수로
  모든 원본 ID를 `createId()` 값으로 바꾸고 타이 참조를 매핑한 `PasteEvents` Command 하나를 만든다.
- `EditCommand`에 `{ type: "PasteEvents", partId, startTick, clipboard }`를, `CommandErrorCode`에
  `NOTHING_TO_PASTE`, `PASTE_TARGET_OCCUPIED`를 **추가**했다(기존 형태 변경 없음). 적용 순서:
  Part 확인 → 빈 payload 거부 → 위치/길이 정수 검증 → 마디 용량(`MEASURE_CAPACITY_EXCEEDED`, 자동 마디 추가 없음)
  → 대상 `[startTick, startTick+lengthTicks)` 점유 검사 → 이벤트 배치 → 타이 매핑 → 기존 `finalize`(validateScore).
  어느 단계든 실패하면 입력 Score를 그대로 두고 오류만 돌려준다. 성공은 edit-session의 이력 1단위다.
- **배치 규칙:** 각 이벤트는 `startTick + 상대 tick`에 원래 길이·Pitch 철자/MIDI·velocity·provenance 그대로 놓는다.
  새 위치에서 마디 경계를 넘게 된 **음표만** 기존 `splitNoteIntoMeasures`로 나누고(`<id>:tieN`) 타이로 잇는다.
  payload의 타이 `from→to`는 `from`의 마지막 조각 → `to`의 첫 조각으로 연결한다. 경계를 넘지 않는 이벤트는 재분할하지 않는다.
  ID는 payload 안과 Score 전체에서 유일해야 한다(`DUPLICATE_ID`).
- **구현 기본값(2026-11-13 사용자 확정):** (1) "빈 대상"은 payload의 gap을 포함한 범위 전체가
  비어 있어야 한다는 뜻으로 구현했다(gap 자리에 기존 음표가 있어도 거부). (2) 경계를 넘게 되는 쉼표는 나누지 않고
  `NOT_NOTATABLE`로 거부한다. (3) 이벤트가 없는 구간은 선택은 되지만 복사는 거부한다. (4) Paste는 AddNote와 같이
  `updatedAt`을 바꾸지 않는다. (5) 덮어쓰기·뒤 이벤트 밀기·몰래 조옮김은 없다(C-08 확정안 그대로).

## Phase 3 — Copy/Paste UI 및 저장 통합 (P3-08, 2026-11-12)

- `@/features/score-editor`(신규 `ClipboardControls.tsx`): props `score`, `selection`(현재 Score에서 유효한 구간 선택 또는 null),
  `cursorTick`(append 모드는 null), `clipboard`, `onCopy(payload)`, `onPaste(command) → 오류 메시지 | null`, `onPasted(endTick)`.
  컴포넌트는 store/저장소를 직접 만지지 않는다. Copy는 `copyScoreRange`만 호출하고 Command를 만들지 않는다.
  Paste는 `planPaste`로 만든 `PasteEvents` Command 하나를 `onPaste`로 넘긴다.
- Editor(`page.tsx`): clipboard는 EditorWorkspace의 React 지역 상태다. Score/JSON/IndexedDB/이력/시스템 clipboard에 넣지 않는다.
  편집·Undo/Redo 후에도 유지되고 새로고침·악보 전환(재마운트) 시 사라진다. `pasteCommand`는 `scoreStore.dispatch` 1회이며
  저장은 기존 autosave(debounce·revision CAS·Tombstone 차단)만 사용한다. UI가 revision을 올리거나 별도 저장을 호출하지 않는다.
- stale 차단: 구간 선택은 Score 객체가 바뀌면 렌더 중 해제되므로 `selection`이 null이 되어 복사 버튼이 비활성화된다.
  payload는 Score와 객체를 공유하지 않으므로 복사 후 원본을 편집해도 clipboard 내용은 바뀌지 않는다.
- DOM 계약(테스트용): section `aria-label="복사·붙여넣기"`, 버튼 "구간 복사"/"커서에 붙여넣기",
  `data-testid="clipboard-status"`(`data-filled="on|off"`, `data-event-count`, `data-length-ticks`),
  `data-testid="clipboard-feedback"`(`data-kind="ok|error"`, `aria-live="polite"`).
- **구현 기본값(2026-11-13 사용자 확정):** append 모드에서는 붙여넣지 않고 안내한다. 성공 시 편집 커서를
  `startTick + lengthTicks`로 옮긴다. 저장 충돌/삭제 상태에서도 메모리 편집은 기존 편집과 같이 허용한다.
  키보드 단축키는 제공하지 않는다. 문서 간 붙여넣기는 없다(C-08 확정안).

## Phase 3 — 원자 Cut (P3-09, 2026-11-12)

- `EditCommand`에 `{ type: "CutEvents", partId, startTick, endTick }`를, `CommandErrorCode`에 `INVALID_SELECTION`,
  `NOTHING_TO_CUT`을 **추가**했다(기존 형태 변경 없음). 적용 순서: Part 확인(첫 Part만, 아니면 `PART_NOT_FOUND`) →
  `selectScoreRange`로 현재 Score에서 구간 재검증(실패는 `INVALID_SELECTION`과 선택 규칙의 메시지) → 이벤트 없음 거부
  (`NOTHING_TO_CUT`) → 구간 이벤트와 그 내부 타이 제거 → 기존 `finalize`(validateScore). 실패는 입력 Score 그대로다.
  구간이 타이로 닫혀 있으므로 범위 밖 타이는 건드리지 않고 dangling tie가 생기지 않는다. 다른 이벤트·마디는 이동·삭제하지 않는다.
- `@/application`: `planCut(score, range)` → `{ ok, command, clipboard }` 또는 `{ ok: false, message }`. 순수 함수다.
  `clipboard`는 `copyScoreRange`와 같은 payload다. **호출 측은 command dispatch가 성공한 뒤에만 clipboard를 교체한다.**
- `ClipboardControls`: 버튼 "구간 잘라내기"(유효한 구간 선택이 없으면 비활성). prop `onPaste`는 `onCommand`로 이름을 바꿨다
  (Cut·Paste 공용, 반환은 오류 메시지 또는 null). 실패 시 이전 clipboard를 유지한다.
- **구현 기본값(2026-11-13 사용자 확정):** 이벤트 없는 구간 Cut 거부, Undo/Redo는 clipboard를 바꾸지 않음,
  Cut 후 편집 커서 유지, `updatedAt` 미변경.

## 악보 줄 캐시(H-03, 2026-11-13, 로컬 커밋 `6b70db9`)

- 위치: `adapters/vexflow/renderScore.ts` 내부. 공개 시그니처 `renderScoreInto(element, score, options)`는 그대로다.
- 단위: 줄(4마디). 줄마다 SVG `<g class="vf-staff-row" data-staff-row="n">` 하나.
- 캐시 키(줄 서명): 줄 번호, 라벨 모드, 음자리표, 조표, 박자, 마디별 [index, 이벤트 수, 조각별 이벤트 id·종류·음높이·
  시작 tick·길이·조각 순번·타이 연속 여부], 그 줄에 닿는 타이 목록. 서명이 같으면 기존 줄 노드를 그대로 둔다.
- 무효화: 서명이 다른 줄만 다시 그려 제자리 교체한다. 라벨·조표·음자리표·박자 변경은 모든 줄 서명을 바꾼다.
  렌더 실패, Part 없음, 기보 계획 실패, 캐시된 SVG가 요소에서 떨어진 경우에는 캐시를 버리고 전체를 다시 그린다.
  편집 커서 선은 캐시하지 않고 매번 다시 만든다. 재생 하이라이트(`data-playing`)·구간 선택 속성은 기존대로 호출 측이 다시 적용한다.
- 메모리 상한: 요소별 `WeakMap` 항목 하나. 화면에 있는 SVG의 줄 그룹(최대 ceil(마디 수/4)개)과 줄별 커서 기준점만 가진다.
  과거 Score·Undo 이력·화면 밖 노드는 보관하지 않으며 요소가 사라지면 함께 회수된다.
- 첫 그리기 높이 예약(2026-11-13): 유지할 SVG가 없을 때는 VexFlow 동적 import를 기다리기 전에 그려질 높이
  (줄 수 × 줄 높이 + 위 여백)를 요소의 `min-height`로 잡고, 그리기 완료·실패·Part 없음·기보 계획 실패 때 해제한다.
  아래 건반이 누르는 도중에 밀려 클릭이 유실되는 것을 막기 위한 DOM 전용 처리다(TASKS §17).
- Score·JSON·저장 이력에는 아무것도 쓰지 않는다. 실제 `SVGContext`가 아니면(단위 테스트 double) 캐시 없이 전부 그린다.
- 내부 모듈 `domain/score/transpose-core.ts`: `transposeScore`(공개, 입력 검증 포함)와 `transposeValidatedScore`
  (비공개, 이미 검증된 같은 Score 객체에만 사용). 추천 엔진만 후자를 쓰며 후보별 결과 검증은 생략하지 않는다.

## Phase 4 — 음높이 추정 (P4-02, 2026-11-13)

- 공개 진입점 `@/domain/transcription`. Domain 순수 함수이며 브라우저·오디오·런타임 의존성이 없다(결정 1).
- `estimatePitchTrack(samples: Float32Array, sampleRate: number, options?: PitchTrackOptions): PitchFrame[]`
  - 입력 PCM은 mono, 메모리에만 있다. 입력을 수정하지 않고, 같은 입력에 같은 결과를 낸다.
  - `PitchFrame`: `timeSeconds`(분석 창 중심, 첫 표본 기준 초), `voiced`, `frequencyHz`/`midi`(무성이면 null, midi는 소수),
    `confidence`(1 − aperiodicity, 0–1), `rms`.
  - 옵션 기본값: `minHz` 70, `maxHz` 1100, `hopSeconds` 0.01, `minRms` 0.01, `maxAperiodicity` 0.2.
  - 거부(RangeError): 양수가 아닌 표본화율·hop·주파수, `minHz ≥ maxHz`, 분석 Nyquist 이상인 `maxHz`, 유한하지 않은 표본.
  - 분석 창보다 짧은 입력은 빈 배열.
- `smoothPitchContour(midi: readonly number[]): number[]`: 한 유성 구간의 옥타브 튐 보정과 중앙값 평활화.
- 초 단위 시각과 tick 변환은 이 모듈의 책임이 아니다(P4-04). 녹음 시각은 tick과 별도로 보존한다(ARCHITECTURE §6).

## Phase 4 — 음 분할 (P4-03, 2026-11-13)

- `segmentNotes(frames: readonly PitchFrame[], options?: NoteSegmentOptions): NoteSegment[]` (`@/domain/transcription`).
  - 입력은 `estimatePitchTrack`의 프레임(시간 오름차순). 순서가 아니면 RangeError. 입력을 수정하지 않는다.
  - `NoteSegment`: `startSeconds`/`endSeconds`(입력과 같은 초 기준), `midi`(정수), `pitchMidi`(중앙값, 소수), `confidence`(평균 0–1), `frameCount`.
    결과는 시간순이며 겹치지 않는다. 쉼표는 별도 객체 없이 음 사이 빈 구간이다.
  - 옵션: `minNoteSeconds`(기본 0.06, 0 이상), `levelDipRatio`(기본 0.5, 0 초과 1 미만).
- 초 → tick 변환·표기 가능 길이 맞춤은 P4-04의 책임이다.

## Phase 4 — 격자 맞춤과 후보 변환 (P4-04, 2026-11-13)

- `spellMidiInKey(midi, key): Pitch` (`@/domain/music-theory`). 조성 음계음은 조표 철자, 그 밖은 fifths ≥ 0이면 샵, < 0이면 플랫.
  0–127 정수가 아니면 RangeError. 기존 Pitch/MIDI 보존 규칙과 같은 `createPitch`를 쓴다.
- `quantizeSegments(segments, options): QuantizeResult` (`@/domain/transcription`).
  - 옵션: `tempoBpm`(> 0), `timeSignature`(지원 분모), `downbeatSeconds`(≥ 0, 기본 0), `gridTicks`(기본 240, 4분음표와 마디를 나눠야 함). 위반은 RangeError.
  - 결과 `notes`: 시간순·비중첩 `{ midi, startTick, durationTicks, confidence, onsetShiftSeconds, endShiftSeconds }`, tick은 첫 박 기준.
    `lengthTicks`는 마지막 음 끝. `dropped`: `BEFORE_DOWNBEAT` | `COLLISION`(입력 index).
  - 양자화는 연주 시각의 명시적 격자 맞춤이며 저장된 Score를 근사하지 않는다(H-02와 별개). 모든 길이는 격자 배수라 표기 가능하다.
- `transcriptionToClipboard(result, { key, timeSignature, nextId }): ClipboardPayload`.
  - 음표는 `provenance: { source: "transcription", confidence }`, 빈 곳은 쉼표(마디 시작 기준으로 마디마다 분할). `ties`는 비어 있다.
  - ID는 호출 측이 새로 발급한다. 확정은 기존 `PasteEvents` 1회(결정 5)이며 그 검증·분할·타이 규칙을 그대로 따른다.

## Phase 4 — 마이크 캡처 포트와 녹음 유스케이스 (P4-05, 2026-11-13)

- 포트 `AudioTranscriptionPort.startCapture(options): Promise<AudioCaptureSession>` (`@/application/ports`).
  - `options`: `maxSeconds`(> 0, 카운트인 + 8마디 길이; 아니면 RangeError), `onLevel({ rms, peak })`(chunk마다), `signal`(AbortSignal).
  - 세션: `sampleRate`, `finished`(종료 시 `AudioRecording` 또는 `AudioCaptureError`), `stop()`(같은 결과 반환, 반복 호출 안전), `cancel()`.
  - `AudioRecording`: `{ samples: Float32Array(mono), sampleRate, durationSeconds, stoppedBy: "user" | "limit" }`. 메모리 전용이며
    Score·JSON·이력·IndexedDB에 넣지 않고 업로드하지 않는다.
  - `AudioCaptureError.code`: `UNSUPPORTED` | `PERMISSION_DENIED`(NotAllowed·Security) | `NO_DEVICE`(NotFound·Overconstrained) |
    `DEVICE_BUSY`(NotReadable·Abort) | `DEVICE_LOST`(트랙 ended) | `ABORTED` | `FAILED`. 메시지는 한국어 안내문이다.
  - 종료(정지·상한·오류·취소) 시 트랙 정지, 노드 해제, `onmessage` 해제, AudioContext close를 한 번만 수행한다.
- 구현 `createMicrophoneCapture(environment?)` (`@/adapters/web-audio`). 녹음마다 AudioContext를 만들고 종료 시 닫는다(Tone 재생 컨텍스트와 별개).
  AudioWorklet 처리기(`PCM_CAPTURE_PROCESSOR_SOURCE`, Blob URL로 로드)는 첫 입력을 mono로 섞어 512프레임마다 보낸다.
  정지 시 처리기 안에 남은 512프레임 미만(48kHz 약 11ms)은 버린다. 제약: `noiseSuppression`·`autoGainControl` 끔, 에코 제거는 브라우저 기본값.
- 유스케이스 (`@/application`):
  - `RECORDING_MAX_MEASURES = 8`, `recordingLimitSeconds(tempoBpm, timeSignature, measures = 8)`: 카운트인 제외 초. 잘못된 값은 RangeError.
  - `transcribeRecording(recording, { tempoBpm, timeSignature, key, downbeatSeconds?, nextId })` →
    `{ ok: true, notes, clipboard }` | `{ ok: false, issue: "SILENT" | "NO_NOTES", message }`. 최고 표본 < 0.01이면 SILENT.
    Domain 파이프라인(음높이 → 분할 → 격자 → 후보)을 메인 스레드에서 실행하며 녹음을 수정하지 않는다.

## Phase 4 — 채보 확정 (P4-07, 2026-11-13 사용자 승인)

- `PasteEvents`에 선택 필드 `newMeasureIds?: readonly string[]` 추가(하위 호환 확장). 주지 않으면 기존과 같다.
  - 대상 끝이 마디 용량을 넘을 때만, 필요한 수만큼 앞에서부터 이 ID로 빈 마디를 해당 Part 뒤에 덧붙이고 같은 Command에서 붙여넣는다.
  - ID가 모자라면 `MEASURE_CAPACITY_EXCEEDED`, 비었거나 중복·기존 마디 ID면 `DUPLICATE_ID`. 실패는 Score 불변. 빈 대상·덮어쓰기 금지 규칙은 그대로다.
  - 결과는 Command 1개이므로 Undo 1회로 새 마디까지 되돌린다.
- `planTranscriptionCommit(score, clipboard, { target: "end" | "cursor", cursorTick, nextMeasureId })` (`@/application`).
  - `end`: 첫 Part에서 이벤트가 있는 마지막 마디의 다음 마디 시작(빈 악보는 1마디). `cursor`: 커서가 있는 마디의 시작. 커서가 없으면 실패.
  - 필요한 새 마디 수만큼 `nextMeasureId`로 ID를 만들어 `PasteEvents` 명령과 시작 마디 번호를 돌려준다. 빈 후보는 실패.
- `RecordingPanel` 검토 단계: 후보 음 목록(신뢰도 0.8 미만 `?` 표시), 위치 선택, 같은 명령을 현재 Score에 적용한 읽기 전용 미리보기(`StaffView`),
  "악보에 넣기"(편집기의 기존 단일 dispatch), "후보 버리기". 확정 직전 최신 Score로 다시 계획한다.
