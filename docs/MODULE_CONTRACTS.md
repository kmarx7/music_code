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
