# H-02 — 음가 정합성 정책 조사 및 설계 제안

- 조사일: 2026-11-09, 기준 main `2d7c776` (H-01 수정 포함), 시작 작업 트리 clean.
- 초기 조사 상태: **정책 제안 / 제품 미구현**. 이후 사용자 승인에 따른 구현·검증은 §11–14에 기록한다.
- 근거: [AGENTS](../AGENTS.md), [PRD](PRD.md), [아키텍처](ARCHITECTURE.md),
  [데이터 모델](DATA_MODEL.md), [ADR-009/010](DECISIONS.md), [모듈 계약](MODULE_CONTRACTS.md),
  [기존 감사](PHASE2_ACCEPTANCE_REPORT.md), [테스트 기록](TEST_PLAN.md), [백로그](PHASE3_BACKLOG.md).
- 기존 제품·테스트 파일, 실제 IndexedDB, Score/JSON, 의존성 및 배포 설정은 변경하지 않았다.
  임시 Node 스크립트에서 실제 함수를 호출하고 Tone 대역/fake-indexeddb로 조사했다. SVG 그리기·실제 청취·브라우저 E2E는 실행하지 않았다.

## 1. 결론 및 권고

불일치 발생 지점은 [renderScore.ts](../src/adapters/vexflow/renderScore.ts)의 **vexDurationOf**다.
1,000ticks가 표기 목록에 없으면 그 이하의 첫 음가 960ticks를 고르고, 음표/쉼표의 VexFlow 객체를 생성한다.
Score와 재생용 tick은 바꾸지 않으므로 기보만 짧아진다. 1tick처럼 목록 최솟값보다 짧으면 오히려120ticks로 늘어난다.

**D 혼합 정책을 권고한다.** 기존 읽기 계약은 유지하고, 기보 가능한 길이는 **읽기 전용 렌더 projection에서만 정확히 분해**한다.
분해 불가/예산 초과는 **해당 Part의 정상 오선 렌더링을 명시적으로 중단하고 정확한 tick·위치·원인을 표시**한다.
편집기 전체의 로딩·기존 이벤트 목록·재생·JSON 백업·저장 접근까지 막지 않는다.
새 편집 요청의 제한은 별도 Command 경계에서 다루고, JSON/저장본 복원용 validateScore를 일괄 강화하지 않는다.

1,000ticks를960으로 반올림/절삭하거나, q glyph의 내부 tick만1000으로 바꿔 정상 기보처럼 보이는 방안은 채택하지 않는다.
1,000ticks를 현재 승인된 음가 집합으로 정확히 분해하는 것도 불가능하다(§5).
음악적 tuplet 의미를 임의 추정하지 않는다. 새 Score 모델, schemaVersion/DB 변경, 자동 마이그레이션은 필요 없다.

## 2. 실제 모델과 입력 경계

### 2.1 필드·범위

- 실제 필드는 `Note.duration`이 아니라 [NoteEvent/RestEvent.durationTicks](../src/domain/score/types.ts)다.
  위치는 `startTick`, 해상도960 PPQ, 온음표3840ticks이며 모두 Score 시작부터의 절대 좌표다.
- [validateScore](../src/domain/score/validate.ts)는 **durationTicks가 양의 정수**인지 검사한다.
  NOTATABLE_DURATIONS 소속 여부는 검사하지 않는다. 따라서 최단 유효 길이는1tick이다.
- 이벤트 전체가 소속 마디 안에 있어야 하며 음표·쉼표 중첩은 거부한다.
  주어진 마디에서 상한은 `measureEnd - startTick`; 4/4 마디 시작이면3840ticks다.
  모든 박자에 적용되는 독립적인 전역 최대 음가는 정의되어 있지 않다.
  검증은 Number.isInteger이며 safe integer 검사는 아니다. 큰 분자/자원 한계는 별도 위험으로 기록하고 이번에 읽기 범위를 바꾸지 않는다.
- schemaVersion2/Part.ties는 유지된다. 타이는 같은 Part의 동일 Pitch, 시간적으로 연속인 음표만 연결한다.
  쉼표에는 타이를 만들지 않는다.

### 2.2 표기 규약과 실제 수락 범위의 차이

[DATA_MODEL §2](DATA_MODEL.md)는 단일 점0~2 음가와 필요 시 분할을 설명하지만,
현재 저장본 검증은 더 넓은 tick 값을 수락한다. 문서의 의도만으로 기존 파일을 갑자기 손상 데이터로 분류하면 안 된다.

| 경계 | 실제 동작 |
|---|---|
| JSON/IndexedDB read | 양의 정수·마디 범위 등 기존 Score 검증. 1/150/300/1000ticks도 유효하면 수락 |
| AddNote | splitNoteIntoMeasures로 분해하고 실패 시 NOT_NOTATABLE. 1000ticks 거부 |
| ResizeNote | 같은 분해기를 사용. 새 체인은 생성64세그먼트 제한을 적용 |
| InsertRest/UpdateRest | 18개 단일 음가 목록에 정확히 일치해야 함. 비리플로우/한 마디 제한 |
| untied UpdateNote의 durationTicks patch | 현재 별도의 음가 목록 검사 없이 finalize 검증. 1000ticks 패치 성공을 확인 |
| tied UpdateNote의 길이·위치 patch | 기존 TIE_EDIT_UNSUPPORTED. Pitch/velocity 변경은 체인 전체 적용 |
| 편집기 일반 음가 UI | 온음표/2분/4분/8분 선택. 길이 변경은 ResizeNote 경로 |

따라서 C안도 '입력은 이미 전부 제한됨'이라고 단정할 수 없다.
단, 이번에는 Command API를 고치거나 새 입력 음가를 확대하지 않는다.

## 3. 두 경로의 추적

### 3.1 JSON → 검증 → VexFlow → SVG

```text
JSON.parse → nested shape → deserializeScore → validateScore
  → canonical Score (durationTicks=1000)
  → StaffView → renderScoreInto
  → vexDurationOf(1000, false/true)
  → exact match 없음 → ticks<=1000 첫 항목960 → q/qr
  → StaveNote의 glyph·ticks=960 상당
  → Voice/Formatter/Accidental → SVG draw
```

[serialize.ts](../src/domain/score/serialize.ts)는 v1을 메모리 v2로 변환하고 기존 검증을 호출한다.
[score-library.ts](../src/application/score-library.ts)의 가져오기는 새 Score ID로 생성하며,
[IndexedDB repository](../src/adapters/indexeddb/scoreRepository.ts)의 복원도 같은 deserializeScore를 사용한다.
읽기 과정에 음가 양자화나 렌더러 역변환은 없다.

현재 배열은 내림차순18개 음가다. exact가 없으면 아래 항목을 고르는 fallback이 문제이며,
최소120보다 작으면 마지막120을 고른다. `Voice.setStrict(false)`는 부족한 tick을 오류로 막지 않는다.
GhostNote는 원래 이벤트 끝/다음 시작의 빈 구간을 계산하므로, 실제 note tick을 근사한 손실을 복구하지 못한다.
예: 첫1000tick 음 뒤 startTick1000의 음은 빈 구간이0인데 VexFlow 첫 note는960만 차지해 이후 누적 배치도 달라질 수 있다.
이는 소스 경로 분석이며 이번 실제 SVG 좌표 측정은 아니다.

### 3.2 JSON → 재생 이벤트 → Tone.js

```text
동일 canonical Score → mergeTiedNotes(part)
  → 원래 startTick/durationTicks 또는 타이 마지막 끝-머리 시작
  → tickSeconds=60/tempoBpm/960
  → onset/남은 길이 계산
  → triggerAttackRelease(MIDI frequency, max(0.001, nominalSeconds*gate), onsetSeconds)
```

[playback.ts](../src/adapters/tone/playback.ts)는 VexFlow duration을 참조하지 않는다.
H-01 이후 유효한 긴 체인은 끝까지 병합한다. 1000tick은1000으로 유지되고 tempo120에서 명목 길이는0.520833333초다.
다만 일반 음의 **gate0.9**로 Tone 어택/릴리스 호출 길이는0.46875초이며 타이 머리는gate1이다.
최소0.001초 clamp도 있어1tick의 명목0.000520833초는 Tone 호출에서0.001초가 된다.
따라서 'Score/tick을 보존한다'와 '실제 gate 길이가 항상 원 tick과 정확히 같다'는 구분해야 한다.
이 기존 오디오 정책은 H-02에서 변경하지 않는다. 쉼표는 어택하지 않고 다음 onset까지 시간을 보존한다.

## 4. 재현 결과

Node v22.21.0 / 설치 VexFlow5.0.0 / HEAD2d7c776. note와rest 각각 검사했다.
실제 `vexDurationOf`를 **메모리에서만 export**하고 실제 StaveNote.getTicks를 호출했다.
VexFlow 해상도16384/온음표를 canonical3840/온음표로 환산했다.
Tone는 실제 adapter를 실행하되 start/시계/Synth/Frequency를 대역으로 교체했다.
다음 값은 음가 계산·예약 인자이며 스피커 출력·SVG 레이아웃 PASS가 아니다.

| 원래 ticks | JSON 검증 | 음표 / 쉼표 token | Vex 환산 ticks | 120BPM 명목 초 | 일반 음 Tone gate 초 |
|---:|---|---|---:|---:|---:|
| 1 | 성공 | `32` / `32r` | 120 | 0.000520833 | 0.001000000 |
| 120 | 성공 | `32` / `32r` | 120 | 0.062500000 | 0.056250000 |
| 150 | 성공 | `32` / `32r` | 120 | 0.078125000 | 0.070312500 |
| 210 | 성공 | `32dd` / `32ddr` | 210 | 0.109375000 | 0.098437500 |
| 300 | 성공 | `16` / `16r` | 240 | 0.156250000 | 0.140625000 |
| 960 | 성공 | `q` / `qr` | 960 | 0.500000000 | 0.450000000 |
| 1000 | 성공 | `q` / `qr` | 960 | 0.520833333 | 0.468750000 |
| 1920 | 성공 | `h` / `hr` | 1920 | 1.000000000 | 0.900000000 |
| 3840 | 성공 | `w` / `wr` | 3840 | 2.000000000 | 1.800000000 |

- note/rest 모두 원본 JSON, transpose 결과 duration, Undo/Redo snapshot이 보존되었다.
- fake-indexeddb에1000ticks를 생성한 뒤 openOrCreateScore로 복원: DB2/revision1/created=false,
  원시 row 및 json 문자열 동일, 복원 duration1000. 실제 사용자 DB에는 접근하지 않았다.
- 마디 경계 사례: start2880/총1920 AddNote는 `[2880,960]`·`[3840,960]`과 타이1개로 성공한다.
  병합 길이는1920으로 보존된다. 반면 이 범위를 한 event로 직접 넣은 JSON은 EVENT_OUT_OF_MEASURE로 거부된다.
  JSON read가 자동 분할하는 것은 아니다.
- AddNote1000 거부. AddNote300도 현재 그리디 선택240+잔여60 때문에 거부된다.
  AddNote600은480+120으로 성공한다. 분석용 완전 탐색에서는300=180+120,510=210+180+120이 가능했다.
- 150 및1000은 현재 목록으로 분해 불가. JSON/Score 수락과 표기 가능성은 다른 판정이다.

## 5. VexFlow 지원 범위와 정확 분해의 한계

### 5.1 현재 프로젝트의 표기 집합

`base∈{1,2,4,8,16,32}`, dots0..2:
`[6720,5760,3840,3360,2880,1920,1680,1440,960,840,720,480,420,360,240,210,180,120]`.
어떤 마디에나 이 길이들이 모두 들어가는 것은 아니다. 마디 길이 제약은 별개다.
모든 길이는30의 배수이므로 합으로1000을 만들 수 없다. 30의 배수라는 조건만으로 충분하지도 않다(150은불가).
기존 splitNoteIntoMeasures는 그리디이고 '표현 가능하면 항상 성공'하는 알고리즘이 아니다(300 사례).

### 5.2 설치된 VexFlow5의 실제 API

근거는 설치 소스/타입과 위 Node 진단이다. 패키지 소스 경로는 버전 고정된 로컬 확인용이며 의존성을 추가하지 않는다.

- `node_modules/vexflow/build/esm/src/tables.js`: 기본 duration token의 numeric tick 표는
  `1/2,1,2,4,8,16,32,64,128,256`, 별칭w/h/q/b(256)다.
  Node에서64→60ticks,128→30ticks,256→15ticks의 **생성/계산**을 확인했다.
  이것만으로256의 완전한 glyph/flag·폰트 렌더링 지원을 인증하지 않는다. 현재 프로젝트는32분음표까지다.
- `note.js`/타입 `note.d.ts`: duration suffix d/dd의 tick 계산을 지원한다.
  그러나 qd/qdd StaveNote 생성만으로는 Dot modifier가 붙지 않았다(dotModifiers0/isDotted=false).
  현 어댑터도 Dot을 추가하지 않는다. **정확한 dotted tick과 실제 점 glyph 표시를 따로 시험해야 한다.**
  후속 정확 기보에서는 승인된 dots 수에 따라 기존 VexFlow Dot API를 명시적으로 연결할 필요가 있다.
  이번에는 실제 SVG 점 glyph를 실행·관찰하지 않았으므로 폰트/레이아웃 결함을 별도로 단정하지 않는다.
- `tickable.js`: setDuration(Fraction) 및 durationOverride로 내부 tick을 지정할 수 있다.
  q에 Fraction(1000,3840)을 주면 환산1000.0000000000001이지만 getDuration은q 그대로다.
  부동소수점 오차도 보이므로 정확성 판단은 canonical 정수 합으로 하고, Vex 환산 시험은 정해진 수치 오차만 허용한다.
  이 API는 glyph 의미를 자동으로 고치지 않으므로 단독 해결책이 아니다.
- GhostNote/Fraction은 현재도 빈 구간을 정확한 시간 비율로 배치한다. **보이지 않는 시간 간격**이며 올바른 음표/쉼표 glyph가 아니다.
- Annotation('1000 ticks') 추가는 가능하고 text를 확인했다. 그러나 q의 tick960은 그대로다.
  경고·설명에는 사용 가능하나 q를 정확한1000tick 기보라고 주장할 수 없다.
- `Tuplet`은 numNotes/notesOccupied를 지원한다. 실제 8분음표3개를3:2로 설정하면 각320ticks다.
  현재 Score에는 tuplet 그룹/비율/기보 의도가 없으므로1000을 맞추려고 임의 ratio를 만들지 않는다.
- `3840/1000` 같은 임의 duration token은 constructor에서 거부되었다.
  정규식에 '/'가 있다고 임의 유리수 음가를 직접 지원하는 것은 아니다.

## 6. 정책 비교

| 대안 | 장점 | 한계·비용 | 기존 파일/모델 영향 |
|---|---|---|---|
| A 정확 분해 | 지원 집합으로 합이 정확하면 음악적 길이·일반 기보를 함께 보존 | 300 가능/1000 불가. 그리디 보완, 렌더용 fragment/타이/ID/선택/라벨/마디 배치가 필요. 비용 중~높음 | canonical을 자동 분할하면 원래 event ID/duration/ties/이력 변경 위험. 렌더 projection만 분해하면 v2/원본 유지 |
| B 명시 표시/오류 | 가장 빠르게 거짓 근사를 없애고 원본 tick을 안내. 기존 Annotation/StaffView 가능 | 경고만 붙인 q는 여전히 다른 음가. 내부 tick override도 정상 기보가 아님. 명시적 기보 불가 화면이 더 정직함 | 원본/저장 변경 없음. 정상 오선을 표시하지 못하는 구간의 UX를 결정해야 함 |
| C 새 입력 제한 | 앞으로 생길 비표기 음가를 편집 경계에서 차단 | JSON backup/import도 신규 생성이라는 이유로 거부하면 복구 호환성이 깨짐. 기존 파일 자체의 표시 문제는 남음 | validateScore/deserialize 강화 금지 권고. UpdateNote 직접 patch의 별도 guard는 승인 후 가능 |
| D 혼합 | 가능한 음은 정확히 표시하고 불가능한 음은 명시 안내, 기존 데이터 접근 유지 | capability 결과·fragment mapping·fallback·자원 예산 시험 필요. 비용 중~높음 | renderer 전용 readonly projection + 기존 broad read 계약 유지. 모델/DB/음악 Command 구조 변경 불필요 |

**채택 권고: D, 단계적 도입.** 우선 fallback 근사를 없애고 capability 오류를 명확히 표시하는 안전 단계,
다음 정확한 렌더 분해 단계를 분리한다. 어느 단계도 저장된 Score를 재작성하지 않는다.
C는 보조 정책으로만 적용하며 현재 AddNote/ResizeNote의 생성 한계를 자동 확대하지 않는다.

## 7. 구체적인 구현 설계 (제안, 미구현)

### 7.1 읽기와 기보 가능성의 분리

- `deserializeScore`/repository.read는 지금 유효한 저장본을 계속 연다. notation 불가를 INVALID_SCORE/미존재로 바꾸지 않는다.
- 순수 `planDurationNotation`/`planPartNotation`(가칭)을 기존 domain/score 경계에 둔다.
  canonical 타입과 기존 NOTATABLE_DURATIONS를 import하는 **읽기 전용 projection**이며 두 번째 Score가 아니다.
- 결과 제안: `{ok:true, fragments, visualTies}` 또는 `{ok:false, issues}`.
  fragment는 originalEventId/partId/measureId/absoluteStartTick/exactDurationTicks/base/dots를 포함한다.
  issues는 part/event·마디/박·원래duration과 '분해 불가/지원 밖/자원 예산'을 구별한다.
  이 타입·이름은 구현 전에 중복 기능 조사 후 정하며 Score/직렬화에는 넣지 않는다.
- 실제 렌더 대상 첫 Part만 preflight한다. 다른 Part의 비표기 음가 때문에 첫 Part 기보를 막지 않는다.
  Part 선택/기보 범위를 확대하지 않으며, 분석/transpose는 여전히 전체 Part다.

### 7.2 정확 분해와 glyph

1. 기존 마디 안 event의 원래 시작·끝을 고정한다. read 단계에서 이벤트를 이웃 마디로 이동시키지 않는다.
2. 정확히 단일 음가이면 기존 base/dots 사용. 아니면 현재18개 길이의 **완전한 bounded 탐색/DP**로 합을 찾는다.
   300에240을 고른 뒤 실패했다고 전체 불가로 판정하면 안 된다.
3. 결정적 순서 제안: fragment 수 최소 → 같은 수면 긴 음가 우선(고정 목록 순서).
   박의 강약에 따른 더 세밀한 표기 재배치는 후속 정책이며 이번에 임의 추정하지 않는다.
4. 양의 길이/동일 마디/오버랩 없음/합=원래duration/첫시작=원래start/마지막끝=원래end를 모두 확인한다.
   GCD30은 빠른 불가 판정에 쓸 수 있지만 충분 조건으로 쓰지 않는다.
5. 음표 fragment 사이에는 렌더 전용 타이를 연결한다. 쉼표는 여러 rest glyph로 분해하며 타이는 만들지 않는다.
   dotted 음가는 tick token뿐 아니라 Dot modifier 수도 확인한다. 음높이·임시표는 원래 Pitch만 사용한다.
6. 무제한 `O(durationTicks)` 배열을 만들지 않는다. 최대 탐색량/fragment 수/Part 예산을 사전에 정하고
   초과 시 명시적 capability 오류로 종료한다. 예산은 읽기 거부/원본 삭제 사유가 아니다.
   구체적 수치는 벤치마크/UX 승인 전 임의 확정하지 않는다. Number.isSafeInteger 밖 값도 기보 capability에서 명시 거부를 검토한다.

`splitNoteIntoMeasures`는 생성 정책·64한계·canonical ID를 다루므로 renderer에서 호출해 Score를 재생성하지 않는다.
상수/표기 지식은 공유하되 정확 탐색은 별도 순수 projection으로 구현한다.
이 단계에서는 AddNote300을 새로 허용하도록 Command를 변경하지 않는다. 별도 승인이 필요한 입력 확장이다.

### 7.3 ID·타이·선택·커서

- 현재 renderer의 `Map<eventId,{note,row}>`를 event당 **glyph 배열/첫 glyph/마지막 glyph** mapping으로 확장한다.
  렌더용 인덱스는 Score ID로 승격하지 않고 저장하지 않는다.
- canonical `Part.ties`의 from은 원본 event의 마지막 glyph, to는 다음 event의 첫 glyph에 연결한다.
  fragment 내부 visual tie와 구분하고 행 경계 partial tie를 기존 StaveTie 정책대로 그린다.
- 각 glyph에 원래 `data-event-id`를 매핑한다. 하나의 canonical event가 여러 SVG glyph일 수 있음을 시험한다.
  클릭은 원래 event를 선택하고 하이라이트도 같은 원래 ID를 따르게 한다. 원본/후보 DOM root 분리 유지.
- 라벨은 canonical tie 머리의 첫 glyph만 표시한다. 쉼표/연장 음/내부 fragment에 중복 라벨을 만들지 않는다.
- 편집 커서는 fragment 시작 tick과 정확한 glyph anchor를 이용하고 빈 구간은 기존 GhostNote/Fraction으로 처리한다.
  viewBox/마디 폭/라벨·타이 충돌을 새 fragment 수 기준으로 시험한다.

### 7.4 분해 불가와 실패 UX

- 1000/1/150처럼 현재 집합으로 불가능하면 해당 Part의 오선 **전체를 정상 기보처럼 그리지 않는다**.
  기존 SVG/후보 SVG를 남겨 오래된 기보를 보여주지 않고, '이 음가는 현재 정확히 기보할 수 없습니다'와
  마디/박/event·원래 tick을 표시한다. 상세 ID는 진단용, 주 안내는 사용자가 이해할 수 있는 위치/길이를 쓴다.
- 이벤트 목록·Pitch/길이 조회·재생·저장/JSON 백업은 계속 사용한다. 음악 편집 세션을 새 빈 Score로 대체하지 않는다.
  자동 수리·tick 반올림·오류를 숨기는 q 표시·자동 migration 금지.
- 정상 기보 가능한 다른 Part로 바꾸는 UI는 새로 만들지 않는다. 부분 오선을 그리는 대안은 후속 승인을 받는다.
- 구체적인 renderer 실패도 partial SVG를 지우고 오류로 표시한다. 실패를 repository 상태의 충돌/삭제/손상 오류로 바꾸지 않는다.
- 미리보기의 기보가 불가능하면 기존 설계처럼 '미리보기를 확인했다'고 오인하지 않도록 **확정 차단**을 권고한다.
  순수 transpose/Command 자체의 지원 범위를 축소하지는 않는다. 이 UI 동작 변경은 명시적 승인 항목이다.

### 7.5 저장·Command·H-01 보존

- 기보 계산·오류·라벨 전환으로 dispatch/Store 변경/Undo 증가/updatedAt/dirty/IDB 쓰기/revision 증가가 없어야 한다.
  OCC/Tombstone/BC/원시 손상본 보호·v1 메모리 변환을 그대로 유지한다.
- H-01은 **canonical ties의 재생/편집 순회**다. visualTies를 Part.ties에 넣거나 mergeTiedNotes에 전달하지 않는다.
  기존66/67/128 체인의63360 등 지속시간이 유지되어야 한다. 생성64한계도 변경하지 않는다.
- transpose는 원래 duration을 보존하고, 후보/확정/Undo/Redo의 각 Score로 notation plan을 다시 계산한다.
  renderer 결과로 Command payload나 음높이/길이를 역산하지 않는다.
- C 보완안: untied UpdateNote의 새 duration patch를 기존 허용 정책과 맞추는 guard를 별도로 설계한다.
  Pitch/velocity만 바꾸는 기존 비표기 event의 편집·title/tempo/transpose/save를 막지 않는다.
  no-op duration patch와 실제 길이 변경의 차이도 승인 후 시험한다. 공통 read validator를 좁히지 않는다.

## 8. 예상 파일과 구현 순서

| 단계 | 예상 파일(신규는 예정) | 작업·완료 기준 |
|---|---|---|
| H02-1 안전한 실패 | renderScore.ts, StaffView.tsx, 관련 tests | fallback 제거, 먼저 preflight/명확한 오류, 정상 단일 음가 유지, 원본·저장 무변경 |
| H02-2 정확 plan | domain/score/notation-duration.ts(신규 예정), public index, unit tests | 기존 집합의 정확 bounded 분해, 300/510 성공·1000/150 불가, 결정적 순서·합/예산 검사 |
| H02-3 렌더 통합 | renderScore.ts, StaffView.tsx, TransposeTool.tsx 최소 연결 | glyph 배열/visual tie/Dot/ID·라벨·커서, 원본/후보 분리, capability 실패의 확정 정책 |
| H02-4 회귀·인수 | tests/unit·integration·e2e, TEST_PLAN/TASKS/MODULE_CONTRACTS/DATA_MODEL 최소 설명 | 전체642/55 보존+신규, 실제SVG·무쓰기/저장/OCC, 청취·Safari·모바일 별도 |
| 선택적 C | commands/apply.ts의 새 duration patch guard 및 tests | **별도 승인 후에만** 입력 제한 정합화. 기존 read/import/restore/다른 편집 유지 |

H02-1과H02-2/3은 별도 작은 커밋으로 검토할 수 있다. 중간 단계의 단순 실패가 최종 기능 완료는 아니다.
application/score-library·serialize·IndexedDB·Tone·H-01 walker·저장 스키마의 수정은 기본 예상 범위에 포함하지 않는다.
문서의 규약과 실제 broad read 지원 범위를 함께 명시하되 PRD/ADR 기본 결정을 바꾸지 않는다.

## 9. 테스트 설계 및 수용 기준

| 범주 | 필수 사례 | 검증 의미 |
|---|---|---|
| 순수 plan | 960/1000/1920/1/120/150/210/300/510, 모든 단일 음가, 여러 마디/음표·쉼표 | 합·시작·끝/Part·마디 경계/원본 불변, greedy 오판 방지, unsupported 명시 |
| 경계/자원 | 큰 duration/큰 numerator/예산 초과, 빈 악보/비표기 다른 Part | 빠르고 명시적 종료, 기존 파일 접근 유지, 첫 Part 정책 유지 |
| Vex 실제 객체 | fragment tick 환산, dots0/1/2 modifier 수, 쉼표/임시표/타이 | 내부tick만 맞고 glyph가 다른 거짓 정확성 방지. Fraction 오차와 canonical 정수 합 구분 |
| SVG/DOM | 300→2glyph+visual tie, rest300→2rest/no tie, 행간 canonical tie+내부 tie, 라벨/고밀도 | 정확 event mapping·viewBox/선택/하이라이트·커서, 원본/후보 섞임 없음 |
| 오류 | 1000tick note/rest 및1tick, renderer 예외 | 가짜 q/32 SVG/이전 SVG 없음, 위치·원래 tick 안내, 편집/재생/백업 접근 유지 |
| 음악 통합 | note/rest/gap, 1920 경계분할, 긴66/67/128 체인, transpose/Undo/Redo | canonical/Pitch/ties/합/재생 인자 보존. gate0.9/1 및1ms clamp 기존 정책 유지 |
| 저장 | 실제 repository+fake-indexeddb/브라우저 raw row, legacy/v1, 미지원/손상 구분 | 읽기/plan만으로 row·json bytes·revision·dirty/Undo 변화 없음. 정상 저장만 기존CAS |
| E2E |1000tick JSON 가져오기/기존ID직접열기→오류안내→Play/Stop→JSON백업→저장·재열기 | 접근 가능/원본tick 보존·거짓정상SVG없음. BC/OCC/Tombstone 기존검증 유지 |
| E2E |300tick 가져오기→정확2glyph→label→transpose 후보/취소/확정·Undo/Redo→save/reload | 데이터는 단일 event300 유지, 기보만 분해. 후보와원본DOM분리 |

실제 구현 검증: 기존642개/55개 assertion을 유지하고 신규 unit/integration을 실행한 뒤
`npm run typecheck`, `npm run lint`, `npm run check:architecture`, `npm run test`, `npm run build`, `npm run test:e2e`.
EPERM이면 E2E 미실행으로 기록하고 Mac 전체검증 전 완료 커밋을 보류한다.
실제 청취/Safari/모바일·폰트/점/타이·폭 인수는 자동 PASS로 대체하지 않는다.
이번 임시 진단을 신규 등록 테스트 수에 포함하거나 기존 전체 회귀를 재실행했다고 보고하지 않는다.

## 10. 구현 전 명시적 결정사항

1. 기존 broad read/import/restore 호환성을 유지하고 renderer capability를 분리하는 D안 승인.
2. 정확 분해는 canonical 재분할이 아닌 읽기 전용 projection만 사용. Part.ties/ID/duration 불변.
3. 불가 시 첫 Part 전체 오선 중단+위치/tick 안내, 이벤트 목록/재생/저장/백업 유지. 부분 기보는 초기 제외.
4. 불가 후보 미리보기의 확정 차단 여부. Command/엔진 유효성을 바꾸는 정책과 구별.
5. 기존18개 집합 유지, tuplet/64분음표 이하 확대·임의 ratio 추정 없음. Dot modifier 보완 포함 여부.
6. fragment 최소 수→기존 고정 순서의 결정적 분해, 탐색/렌더 예산과 safe integer 범위의 명시적 기보 오류 정책.
7. C 보완 guard를 이번 구현에 포함할지 별도 분리할지. no-op patch/새 길이/기존비표기음 보존 기준.
8. DATA_MODEL의 이상적 표기 규약과 현재 read 수락 범위의 차이를 설명할 문구.

이 제안은 기존 아키텍처의 read-only projection·presentation 경계 안에서 해결 가능하다.
새 모델/라이브러리/저장 계약 변경이나 자동 복구를 요구하는 대안으로 확대되면 별도 ADR 승인을 먼저 받아야 한다.
H-02 구현 및 Phase3 기능은 이번 작업에서 수행하지 않았다.

## 11. 이번 조사 검증 및 Git 결과

- 문서 상대 링크/파일 경로/코드 fence/공백 검사를 통과했다. 부록 코드를 문서에서 추출하여
  Node 구문 검사와 재실행을 통과했다. 제품·기존 테스트·package/lock 파일의 diff 없음.
- 전체 회귀/typecheck/lint/architecture/build/E2E는 문서 조사이므로 이번에 재실행하지 않았다.
  기존 H-01의642/55 PASS는 기준 기록이며 이번 임시 진단을 새 등록 테스트로 세지 않는다.
- 문서만 선택적으로 stage하려 했지만 `.git/index.lock: Operation not permitted`로 실패했다.
  공식 권한 상승 요청도 `sandbox_approval: false` 정책으로 거부되어 커밋하지 못했다.
  HEAD2d7c776과 문서2개 변경을 보존했다. 권한 우회/push/Vercel 작업 없음.

## 부록 — 진단 재현

프로젝트 루트에서 아래 코드를 `/tmp/h02-duration-diagnostic.cjs`에 저장하고
`node /tmp/h02-duration-diagnostic.cjs`로 실행한다. 설치된 TypeScript/VexFlow/fake-indexeddb만 사용한다.
메모리 모듈 export/Tone 대역/테스트용 in-memory DB이며 제품 파일/실제 사용자 DB는 바꾸지 않는다.
DP는 대안 타당성의 **분석 전용**이며 제품용 bounded planner 구현이 아니다.

```js
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=process.cwd(),ts=require(path.join(root,'node_modules/typescript'));
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,...args){return resolve.call(this,request.startsWith('@/')?path.join(root,'src',request.slice(2)):request,...args);};
const compile=(source)=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
require.extensions['.ts']=(m,f)=>m._compile(compile(fs.readFileSync(f,'utf8')),f);
const attack=[];const tone={start:async()=>{},now:()=>10,immediate:()=>10,Frequency:(midi)=>({toFrequency:()=>midi}),Synth:class{toDestination(){return this;}triggerAttackRelease(...args){attack.push(args);}dispose(){}}};
const load=Module._load;Module._load=function(request,...args){return request==='tone'?tone:load.call(this,request,...args);};
const domain=require(path.join(root,'src/domain/score/index.ts'));
const {applyEditCommand}=require(path.join(root,'src/domain/commands/apply.ts'));
const session=require(path.join(root,'src/application/edit-session.ts'));
const {playScore}=require(path.join(root,'src/adapters/tone/playback.ts'));
const vf=require(path.join(root,'node_modules/vexflow'));
const file=path.join(root,'src/adapters/vexflow/renderScore.ts'),instrumented=new Module(file,module);
instrumented.filename=file;instrumented.paths=Module._nodeModulePaths(path.dirname(file));
instrumented._compile(compile(fs.readFileSync(file,'utf8')+'\nexport { vexDurationOf };'),file);
const tokenFor=instrumented.exports.vexDurationOf;
function fixture(ticks,kind='note',start=0){const s=domain.createEmptyScore({id:'h02',createdAt:'fixed',measureCount:2});s.parts[0].measures[0].events=[kind==='rest'?domain.createRestEvent({id:'e',startTick:start,durationTicks:ticks}):domain.createNoteEvent({id:'e',step:'C',octave:4,startTick:start,durationTicks:ticks})];return s;}
function equivalent(note){return note.getTicks().value()/vf.RESOLUTION*3840;}
async function run(){
 console.log(JSON.stringify({node:process.version,vexflow:JSON.parse(fs.readFileSync(path.join(root,'node_modules/vexflow/package.json'),'utf8')).version,head:require('node:child_process').execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim(),notatable:domain.NOTATABLE_DURATIONS.map(x=>x.ticks)}));
 for(const ticks of [1,120,150,210,300,960,1000,1920,3840])for(const kind of ['note','rest']){
  const source=fixture(ticks,kind),before=JSON.stringify(source),parsed=domain.deserializeScore(before);assert(parsed.ok);
  const token=tokenFor(ticks,kind==='rest'),note=new vf.StaveNote({keys:['c/4'],duration:token});
  const shifted=domain.transposeScore(parsed.score,{kind:'semitones',semitones:2});assert(shifted.ok);
  assert.equal(shifted.value.score.parts[0].measures[0].events[0].durationTicks,ticks);
  const edit=session.applyCommand(session.createEditSession(parsed.score),{type:'TransposeScore',spec:{kind:'semitones',semitones:2},updatedAt:'changed'});assert(edit.result.ok);
  assert.equal(session.undo(edit.session).current,parsed.score);assert.equal(session.redo(session.undo(edit.session)).current,edit.session.current);
  attack.length=0;const h=await playScore(parsed.score);h.stop();assert.equal(JSON.stringify(source),before);
  console.log(JSON.stringify({kind,ticks,import:true,token,notationTicks:equivalent(note),nominalSeconds:ticks/1920,attack:attack.slice(),transposeDurationPreserved:true,undoRedoPreserved:true,inputUnchanged:true}));
 }
 const crossed=fixture(1920,'note',2880);console.log(JSON.stringify({case:'crossing raw JSON',parse:domain.deserializeScore(JSON.stringify(crossed))}));
 const base=domain.createEmptyScore({id:'split',createdAt:'fixed',measureCount:2}),p=base.parts[0];
 for(const ticks of [1920,1000,300,600]){
  const startTick=ticks===1920?2880:0;
  const result=applyEditCommand(base,{type:'AddNote',partId:p.id,measureId:p.measures[0].id,note:domain.createNoteEvent({id:'n',step:'C',octave:4,startTick,durationTicks:ticks})});
  console.log(JSON.stringify({case:'AddNote',ticks,startTick,ok:result.ok,result:result.ok?{segments:result.score.parts[0].measures.flatMap(m=>m.events).map(e=>[e.startTick,e.durationTicks]),ties:result.score.parts[0].ties,merged:domain.mergeTiedNotes(result.score.parts[0])}:result.error}));
 }
 const u=fixture(960),part=u.parts[0];const updated=applyEditCommand(u,{type:'UpdateNote',partId:part.id,noteId:'e',patch:{durationTicks:1000}});console.log(JSON.stringify({case:'untied UpdateNote duration1000',ok:updated.ok}));
 for(const duration of ['w','h','q','qd','qdd','64','128','256','3840/1000']){
  try{const n=new vf.StaveNote({keys:['c/4'],duration});console.log(JSON.stringify({case:'VexFlow constructor',duration,ok:true,canonicalTicks:equivalent(n),glyphDuration:n.getDuration()}));}
  catch(e){console.log(JSON.stringify({case:'VexFlow constructor',duration,ok:false,error:String(e)}));}
 }
 const overridden=new vf.StaveNote({keys:['c/4'],duration:'q'});overridden.setDuration(new vf.Fraction(1000,3840));
 console.log(JSON.stringify({case:'setDuration Fraction',canonicalTicks:equivalent(overridden),glyphDuration:overridden.getDuration()}));
 const annotated=new vf.StaveNote({keys:['c/4'],duration:'q'});annotated.addModifier(new vf.Annotation('1000 ticks'),0);
 console.log(JSON.stringify({case:'Annotation',text:annotated.getModifiers()[0].getText(),canonicalTicks:equivalent(annotated),glyphDuration:annotated.getDuration()}));
 for(const duration of ['qd','qdd']){const n=new vf.StaveNote({keys:['c/4'],duration});console.log(JSON.stringify({case:'dotted modifiers',duration,canonicalTicks:equivalent(n),dotModifiers:n.getModifiersByType('Dot').length,isDotted:n.isDotted()}));}
 function exact(total){const dp=Array(total+1).fill(null);dp[0]=[];for(let n=1;n<=total;n++)for(const d of domain.NOTATABLE_DURATIONS.map(x=>x.ticks))if(n>=d&&dp[n-d]!==null&&(!dp[n]||dp[n-d].length+1<dp[n].length))dp[n]=[d,...dp[n-d]];return dp[total];}
 for(const ticks of [150,300,510,1000])console.log(JSON.stringify({case:'analysis-only exact decomposition',ticks,parts:exact(ticks)}));
 require(require.resolve('fake-indexeddb/auto',{paths:[root]}));
 const {createIndexedDbScoreRepository}=require(path.join(root,'src/adapters/indexeddb/scoreRepository.ts'));
 const {openOrCreateScore}=require(path.join(root,'src/application/score-library.ts'));
 const dbName='h02-memory-diagnostic',repository=createIndexedDbScoreRepository({dbName}),stored=fixture(1000);
 assert.equal(await repository.create(stored),1);
 async function raw(){const r=indexedDB.open(dbName);const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{const r=db.transaction('scores','readonly').objectStore('scores').get(stored.id);return {version:db.version,record:await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);})};}finally{db.close();}}
 const rawBefore=await raw();const reopened=await openOrCreateScore(repository,{id:stored.id,createdAt:'unused'});const rawAfter=await raw();assert.deepEqual(rawAfter,rawBefore);assert.deepEqual(reopened.score,stored);
 console.log(JSON.stringify({case:'existing IndexedDB restore (fake-indexeddb only)',version:rawAfter.version,revision:reopened.revision,duration:reopened.score.parts[0].measures[0].events[0].durationTicks,created:reopened.created,rawRecordUnchanged:true,jsonUnchanged:rawAfter.record.json===JSON.stringify(stored)}));
 const triplet=[0,1,2].map(()=>new vf.StaveNote({keys:['c/4'],duration:'8'}));new vf.Tuplet(triplet,{numNotes:3,notesOccupied:2});
 console.log(JSON.stringify({case:'VexFlow triplet',canonicalTicks:triplet.map(equivalent)}));
}
const warn=console.warn;console.warn=()=>{};run().catch(e=>{console.warn=warn;console.error(e);process.exitCode=1;});
```

## 11. 승인 정책 구현 및 현재 검증 (2026-11-09)

위 조사·진단은 수정 전 기준의 기록이다. 특히 부록의 `vexDurationOf(ticks)` 계측 스크립트는
수정 전 어댑터를 대상으로 하며, 현재 어댑터의 정확 음가 spec 인터페이스에서 그대로 실행하는 스크립트가 아니다.
사용자가 승인한 **렌더 전용 정확 분해 + 표현 불가 시 명시적 오류**를 다음과 같이 구현했다.

- [`notation.ts`](../src/domain/score/notation.ts)의 `decomposeNotationDuration`은 기존
  `NOTATABLE_DURATIONS` 18개를 재사용한다. 안전한 양의 정수 tick만 처리하고 30tick 정수 단위의
  제한된 동적 계획법으로 정확 합을 찾는다. 최소 glyph 수, 동률이면 긴 음가 우선으로 결정한다.
  960은 단일 음가, 300은 180+120이며, 1000/1/150은 표현 불가다. 반올림·그리디 fallback은 없다.
- 한 이벤트 최대64개 분해, 최대430080ticks(DP 최대14336단위), 표시 Part 최대1024마디,
  GhostNote 포함 최대4096 tickable을 적용한다. 이는 **렌더 자원 한계**이며 Score 검증·읽기·저장 제한이 아니다.
  초과 시 기보 오류로 보고하고 원본을 유지한다. Part 내부 같은 길이 분해 결과는 재사용한다.
- `planPartNotation`은 원본 이벤트를 참조하는 읽기 전용 projection이다. 원본 ID/startTick/durationTicks,
  Part.ties, velocity/provenance/metadata를 수정하거나 영속 이벤트를 생성하지 않는다.
- VexFlow 어댑터는 정확 duration token과 실제 Dot modifier를 사용한다. 분해 음표만 렌더 전용
  StaveTie로 연결하고, 쉼표는 분해하되 묶지 않는다. canonical tie는 앞 이벤트의 마지막 fragment와
  뒤 이벤트의 첫 fragment를 연결하며, 행 경계의 부분 타이 정책을 유지한다.
- 선행·내부·후행 공백은 정수 tick 비율의 GhostNote로 처리한다. 비어 있지 않은 Voice의 전체 tick이
  마디 길이와 같도록 하고 strict 검증한다. 분해/라벨 마디는 VexFlow 최소 폭을 반영한다.
  모든 fragment의 `data-event-id`는 원본 ID다. 클릭은 원본 이벤트를 선택하고, 하이라이트는 모든 fragment에 적용한다.
  라벨은 원본 이벤트 첫 fragment에만 표시하고 기존 canonical 연장음 생략 정책을 유지한다.
- 표현 불가 시 첫 Part 전체 기보를 중단한다. `NotationRenderError`에 이벤트 ID·마디·시작tick·길이를 담고,
  StaffView가 `notation-error` 안내를 표시한다. 이전/부분 SVG는 제거한다. AbortSignal 및 최신 요청 확인으로
  오래된 비동기 렌더가 현재 결과를 덮지 않는다. 다음 정상 Score에서는 다시 렌더할 수 있다.
- 미리보기 후보도 동일 planner로 검사하고 기보 불가 시 확정을 차단한다. 취소·백업은 가능하며
  순수 조옮김 엔진/Command 자체는 변경하지 않는다. 기존 Score의 재생·저장·JSON 접근은 유지한다.
- Tone 예약은 원본 duration을 사용한다. 300/1000ticks의 원래 명목 길이와 기존 gate0.9,
  H-01 타이gate1을 구분한다. Tone·Command·Repository·Score 스키마 변경은 없다.

실제 실행 결과:

| 검사 | 결과 |
|---|---|
| 단위·통합 전체 | 45파일 **704/704 PASS** (기존642 + 신규62) |
| H-01 회귀 | 기존 long-tie/playback/통합 유지, 66×960=63360ticks 검증 포함 |
| typecheck / lint / architecture / production build | PASS, lint 경고 없음 |
| Chromium E2E | 서버 listen EPERM 0.0.0.0:3010으로 **미실행** |
| 신규 E2E | 2개 작성; 기존55와 합계57개, 브라우저 통과 미확인 |
| 실제 SVG 육안·오디오 청취·Safari·모바일 실기기 | 미검증 |

단위 렌더 테스트는 실제 VexFlow 음가·Dot modifier·Voice·Formatter를 쓰되 DOM drawing은 대역이다.
CSS font 파서만 Node 테스트 환경에 맞게 대역 처리했다. 따라서 실제 브라우저 glyph·간격 인수는 E2E/육안 확인이 필요하다.
실제 repository+fake-indexeddb로 원시 row/revision 불변과 JSON·조옮김·Undo/Redo·재생 호출 데이터를 확인했다.
사용자 실데이터에 대한 검사나 실제 청취 완료를 의미하지 않는다.

Mac 재검증:

```bash
cd /Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
npm run test:e2e
```

정책 문서2파일은 먼저 별도로 스테이징했으나 커밋은 `.git/index.lock: Operation not permitted`로 실패했다.
공식 권한 요청은 `sandbox_approval: false`로 거부되었으며 우회하지 않았다. 원래 정책 내용의 index와
후속 구현 변경은 분리해 보존한다. E2E 미실행 때문에 제품 커밋도 보류한다. GitHub/Vercel 작업은 없다.


## 12. Mac 점 glyph 검사 실패 후속 분석 (2026-11-09)

Mac56/57의 실패는 기보 누락이 아니라 `.vf-dot`이라는 존재하지 않는 wrapper 선택자다.
보존된 trace의 실제 SVG에는 note/rest 각각의 첫180tick fragment의 `.vf-notehead` 안에
`<text>\uE1E7</text>`(실제 문자는 SMuFL augmentationDot)가 하나씩 있다. Dot.draw는
Element.renderText→SVGContext.fillText로 이 문자를 그리며 별도 Dot 그룹을 열지 않는다.
E2E는 원본 이벤트 범위에서 이 문자를 정확히 선택하고 총2개 및 note/rest 각각 가시성을 검사한다.
음가 분해/점 생성의 제품 로직은 변경하지 않았다.

같은 trace에서 확인된 SVG 루트의 pointer-events=none 상속은 H-02 fragment 클릭과 충돌한다.
이벤트 그룹에만 visiblePainted를 설정해 기존 원본 ID 클릭 위임을 허용한다. 오선·타이·커서·라벨은
포인터 대상으로 확대하지 않는다. 포인터 속성 회귀를 먼저 실패시킨 후 최소 DOM 수정으로 통과시켰다.
Score/음가/Part.ties/Command/Tone/IndexedDB/ADR-010/JSON에는 변경이 없다.
현재 단위·통합은705/705 PASS이며, 수정 후 Mac 전체57개와 실제 클릭은 재검증이 필요하다.


## 13. SVG 투명 선택 영역과 정상 클릭 계약 (2026-11-09)

사용자 후속 Mac56/57 실패의 rect를 실제 trace에서 확인했다. 설치 VexFlow5
`StaveNote.draw()`는 ledger/stem/notehead/flag 뒤에 `getBoundingBox()`를 구하고,
`ctx.pointerRect(...)`를 호출한 후 stavenote 그룹을 닫는다.
`SVGContext.pointerRect`가 `opacity=0, pointer-events=auto`인 rect를 생성한다.
이는 음표 전체의 선택 영역이다. 기본 SVG 루트의 pointer-events=none과 별도로 동작한다.
이전 §12의 visiblePainted 조치는 trace의 그룹 속성에 실제 반영되어 있으나,
명시적으로 auto인 자식 rect를 제거하거나 비활성화하는 설정은 아니다.

차단된 rect는 `g.vf-stavenote[data-event-id="exact-note"]`의 두 번째 fragment
(start300/duration120)에 속한다. x199.408/y95/width56.273/height35이며
대상 `.vf-notehead`의 뒤에 그려진 **같은 그룹의 형제**다. 다른 Score 이벤트의 덮개가 아니다.
첫 fragment rect는 x111.748/width88.66로 둘 사이 약1px 겹침이 있지만 같은 원본 ID다.
별도 쉼표 rect는 exact-rest 그룹에 속한다. SVG root/group/rect 계층은 trace로 확인했고,
React 이벤트 전달은 StaffView의 target.closest('[data-event-id]') 경로와 대조했다.
실제 브라우저 이벤트 전파 로그를 수집했다고 주장하지 않는다.

Playwright의 notehead 전용 클릭은 hit target인 형제 rect를 허용하지 않는다.
원본 이벤트 ID와 fragment 순서로 한정한 **그룹**을 일반 click/tap 대상으로 삼으면
원래 의도된 pointerRect를 자식으로 수신하고 같은 ID로 위임할 수 있다. 이를 E2E 수정 정책으로 사용한다.
제품 코드는 추가 변경하지 않고, rect 삭제/일괄 비활성화/force/timeout 증가는 하지 않는다.

E2E는 별도 D4 인접 음표를 추가한다. 두 조각과 인접 음표·쉼표를 번갈아 선택하고,
매번 클릭 중심의 elementFromPoint가 해당 fragment 내부인지 확인한다(단순 ID 일치만으로 통과하지 않음).
라벨 전환 후에도 선택/원시 row를 확인하고, Undo/Redo·저장·재열기와 모바일 에뮬레이션 일반 tap도 검사한다.
모바일 실기기 인수와 구분한다. 선택 위임 단위 테스트는 rect 대상에서 원본/인접/쉼표/미지 ID 및 후보 읽기 전용을 검사한다.

최종 자동 검사: 단위·통합706/706, typecheck/lint/architecture/build PASS.
Chromium 전체57개는 Codex listen EPERM으로 미실행이다. 수정 후 실제 첫·둘째 조각/인접/쉼표 클릭·터치 결과는
Mac에서 확인해야 한다. 기존 Mac56/57을 수정 후 통과로 보고하지 않는다. 제품 커밋 보류/정책 index 유지.


## 14. 최종 사용자 Mac 검증 및 커밋 검토 (2026-11-09)

사용자가 수정된 H-02 전체 **Mac Chromium E2E57/57 PASS**를 직접 확인했다.
앞선 Codex EPERM과 Mac56/57 실패는 당시 기록으로 유지하며, 최종 검증 결과와 구분한다.
기존 단위·통합 **706/706 PASS**, typecheck/lint/architecture/build 및 diff 검사 PASS.
H-01 긴 타이63360ticks, 300=180+120/960 단일 기보/1000 명시 오류,
점 glyph·가상/기존 타이·fragment/인접 음표/쉼표 선택·모바일 에뮬레이션,
원본 Score/저장/Undo·Redo 불변 검증을 유지한다.
Score schemaVersion2/Part.ties/DB2/ADR-010/Command/Tone gate/조옮김·JSON 계약은 변경하지 않는다.
실제 오디오 청취/Safari/모바일 실기기 인수는 별도이며 Chromium 에뮬레이션과 혼동하지 않는다.

사용자 지시에 따라 이 정책 문서와 TASKS의 후속 H-02 기록을 첫 문서 커밋에 포함하고,
남은 H-02 제품·테스트·MODULE_CONTRACTS/TEST_PLAN 변경은 별도 제품 커밋 대상으로 검토한다.
새 기능/Phase3/GitHub push/Vercel 작업은 수행하지 않는다. 실제 커밋 성공 여부는 Git 결과로 확인한다.
