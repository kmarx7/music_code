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
| Domain · Score | `@/domain/score` | `Score`/`Part`/`TieLink` 등 타입, `createEmptyScore`, `createNoteEvent`, `createRestEvent`, `validateScore`, `serializeScore`, `deserializeScore`, `measureTicks`, `measureStartTick`, `NOTATABLE_DURATIONS`, `splitNoteIntoMeasures`, `chainIdsOf`, `mergeTiedNotes`, 상수 |
| Domain · Music Theory | `@/domain/music-theory` | `midiFromSpelling`, `createPitch`, `letterName`, `koreanFixedDo`, `isDiatonicStep`, `KEY_SIGNATURE_OPTIONS`, `isSupportedKeySignature` |
| Domain · Commands | `@/domain/commands` | `EditCommand`, `applyEditCommand`, 에러 코드 |
| Application | `@/application` | `EditSessionState`, `createEditSession`, `applyCommand`, `undo`, `redo`, `canUndo`, `canRedo`, `ScoreRepository` |
| Feature · Score Library | `@/features/score-library` | `useAutosave`, `SaveStatus`, `AutosaveHandle` |
| Feature · Playback | `@/features/playback` | `PlaybackControls`, `highlightPlayback` (런타임 UI/DOM 투영) |
| Feature · Score Editor | `@/features/score-editor` | `StaffView`, `ScoreSettings` |

내부 파일 직접 import는 같은 feature/모듈 내부에서만 허용한다.

## 3. 편집 Command 계약 (C-04)

```ts
type EditCommand =
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
| 순수성 | `applyEditCommand(score, cmd)`는 **입력 Score를 변경하지 않고** 새 Score를 반환한다. `Date.now()`/랜덤/IO를 호출하지 않는다 |
| 성공 | `{ ok: true, score }` — 새 Score는 전체 검증을 통과해야 한다 |
| 실패 | `{ ok: false, error: { code, message } }` — 원본 Score는 그대로 |
| 검증 시점 | 명령 적용 후 `validateScore`를 재실행하여 불변식을 보증 |
| 에러 코드 | `INVALID_TITLE`, `INVALID_KEY_SIGNATURE`, `TIME_SIGNATURE_REQUIRES_EMPTY_SCORE`, `PART_NOT_FOUND`, `MEASURE_NOT_FOUND`, `NOTE_NOT_FOUND`, `EVENT_NOT_FOUND`, `DUPLICATE_ID`, `INVALID_DURATION`, `MEASURE_CAPACITY_EXCEEDED`, `NOT_NOTATABLE`, `TIE_EDIT_UNSUPPORTED`, `INVALID_SCORE` |
| updatedAt | Command는 현재 시각을 생성하지 않는다. `RenameScore`와 설정 명령은 경계에서 주입받은 `updatedAt`을 적용한다(재현성) |
| 이름 매핑 | ARCHITECTURE의 예시 `DeleteNote`는 note/rest 모두 삭제 가능한 `DeleteEvent`로 구현했다 |

## 4. 편집 세션/히스토리 계약

```ts
interface EditSessionState { current: Score; past: readonly Score[]; future: readonly Score[] }
```

- 성공한 편집만 히스토리에 push 하고 `future`를 비운다(redo branch 무효화).
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
- 다중 탭의 ID 생성/확인/저장은 원자적 create-if-absent가 아니다. UI는 매번 새 UUID를 생성하며,
  임의 덮어쓰기를 제공하지 않는다. 다중 탭 동시 편집 충돌은 기존 미해결 범위다.

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
