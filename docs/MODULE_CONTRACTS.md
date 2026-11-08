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
| Domain · Score | `@/domain/score` | `Score`/`Part`/`TieLink` 등 타입, `createEmptyScore`, `createNoteEvent`, `createRestEvent`, `validateScore`, `serializeScore`, `deserializeScore`, `measureTicks`, `measureStartTick`, `NOTATABLE_DURATIONS`, `splitNoteIntoMeasures`, `chainIdsOf`, `mergeTiedNotes`, 상수, `transposeScore`, `TransposeSpec` |
| Domain · Music Theory | `@/domain/music-theory` | `midiFromSpelling`, `createPitch`, `letterName`, `koreanFixedDo`, `isDiatonicStep`, `KEY_SIGNATURE_OPTIONS`, `isSupportedKeySignature`, `intervalBetweenKeys`, `transposePitch`, `transposeKeySignature`, `TransposeInterval`, `TransposeResult` |
| Domain · Commands | `@/domain/commands` | `EditCommand`, `applyEditCommand`, 에러 코드 |
| Application | `@/application` | `EditSessionState`, `createEditSession`, `applyCommand`, `undo`, `redo`, `canUndo`, `canRedo`, `ScoreRepository` |
| Feature · Score Library | `@/features/score-library` | `useAutosave`, `SaveStatus`, `AutosaveHandle`, `SaveButton` |
| Feature · Playback | `@/features/playback` | `PlaybackControls`, `highlightPlayback` (런타임 UI/DOM 투영) |
| Feature · Score Editor | `@/features/score-editor` | `StaffView`, `ScoreSettings`, `EditCursor` |

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
| `AudioTranscriptionPort` | 미정의 | Phase 4에서 계약화 |
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
| C-08 클립보드 의미 | Phase 3 전 확정 |
| C-09 F1 게이트 | Phase 4 전 데이터셋 확정 |
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
