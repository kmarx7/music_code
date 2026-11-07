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
| Domain · Score | `@/domain/score` | `Score` 등 타입, `createEmptyScore`, `createNoteEvent`, `createRestEvent`, `validateScore`, `measureTicks`, `measureStartTick`, 상수 |
| Domain · Music Theory | `@/domain/music-theory` | `midiFromSpelling`, `createPitch`, `letterName`, `koreanFixedDo`, `isDiatonicStep` |
| Domain · Commands | `@/domain/commands` | `EditCommand`, `applyEditCommand`, 에러 코드 |
| Application | `@/application` | `EditSessionState`, `createEditSession`, `applyCommand`, `undo`, `redo`, `canUndo`, `canRedo`, `ScoreRepository` |

내부 파일 직접 import는 같은 feature/모듈 내부에서만 허용한다.

## 3. 편집 Command 계약 (C-04)

```ts
type EditCommand =
  | { type: "AddNote"; partId; measureId; note: NoteEvent }
  | { type: "UpdateNote"; partId; noteId; patch: NotePatch }
  | { type: "DeleteEvent"; partId; eventId }
  | { type: "InsertRest"; partId; measureId; rest: RestEvent }
  | { type: "AddMeasure"; partId; measureId: string }
  | { type: "ResizeNote"; partId; noteId; durationTicks: number };
```

> Phase 1-B에서 `AddMeasure`, `ResizeNote`를 **추가**했다(기존 파이프라인·모델 유지, 명령 집합의 확장).
> `ResizeNote`는 편집된 음표 뒤 이벤트를 순서대로 재배치하며, 마디를 넘는 음표(타이)는 만들지 않는다.
> 자리가 없으면 `MEASURE_CAPACITY_EXCEEDED`로 실패하고, 마디 추가는 `AddMeasure`로 수행한다.

| 항목 | 계약 |
|---|---|
| 순수성 | `applyEditCommand(score, cmd)`는 **입력 Score를 변경하지 않고** 새 Score를 반환한다. `Date.now()`/랜덤/IO를 호출하지 않는다 |
| 성공 | `{ ok: true, score }` — 새 Score는 전체 검증을 통과해야 한다 |
| 실패 | `{ ok: false, error: { code, message } }` — 원본 Score는 그대로 |
| 검증 시점 | 명령 적용 후 `validateScore`를 재실행하여 불변식을 보증 |
| 에러 코드 | `PART_NOT_FOUND`, `MEASURE_NOT_FOUND`, `NOTE_NOT_FOUND`, `EVENT_NOT_FOUND`, `DUPLICATE_ID`, `INVALID_DURATION`, `MEASURE_CAPACITY_EXCEEDED`, `INVALID_SCORE` |
| updatedAt | Command는 스탬프하지 않는다. 시간은 Application/경계에서 주입한다(재현성) |
| 이름 매핑 | ARCHITECTURE의 예시 `DeleteNote`는 note/rest 모두 삭제 가능한 `DeleteEvent`로 구현했다 |

## 4. 편집 세션/히스토리 계약

```ts
interface EditSessionState { current: Score; past: readonly Score[]; future: readonly Score[] }
```

- 성공한 편집만 히스토리에 push 하고 `future`를 비운다(redo branch 무효화).
- 실패한 명령은 **session 객체를 그대로 반환**한다(히스토리·Score 불변).
- `undo`/`redo`는 히스토리가 없으면 동일 session을 반환한다.
- 과거 스냅샷은 불변 Score 참조로 보관한다(원본 변경 금지).

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

**의도적으로 Phase 0에서 도입하지 않은 것**: Tailwind CSS(제품 UI 없음), Zod, IndexedDB 라이브러리, Playwright. 각 기능 Phase에서 필요 시 사유와 함께 도입한다.
Phase 1에서 **VexFlow 5.0.0 / Tone.js 15.1.22**를 ADR-008(사용자 승인)로 도입했다. 두 패키지는
`src/adapters/*`에서만 초기화하고 서버 컴포넌트/SSR에서 import 하지 않는다.
**Playwright**는 렌더링 화면 구현 이후(사용자 결정) 도입한다.

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
| C-03 지원 음가·타이·조표 변경 | Phase 0은 마디 내 이벤트만 허용, 나머지는 후속 승인 |
| C-04 명령·Undo 계약 | **확정**(§3·§4) |
| C-05 store 조립 | Phase 1에서 단일 Score 소유자 유지하며 추가 |
| C-06 의존성 도입 | Phase 0 목록 확정(§7), 이후 기능 Phase별 승인 |
| C-07 저장 버전·migration | v1 확정, migration은 구버전 발생 시 |
| C-08 클립보드 의미 | Phase 3 전 확정 |
| C-09 F1 게이트 | Phase 4 전 데이터셋 확정 |
| C-10 브라우저 매트릭스 | E2E 도입 시 실제 버전 기록 |
