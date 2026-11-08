# Phase 2 최종 인수 감사

- 감사일: 2026-11-09 (Asia/Seoul)
- 대상: main, `5d43471c7ffa383797340d29d40dd051828482c2`; 시작 작업 트리 clean.
- 범위: 코드·테스트·기존 기록 검토, 순수 함수 임시 진단/성능 측정, 문서 작성만 수행. 제품 수정 없음.
- 근거: [PRD](PRD.md), [아키텍처](ARCHITECTURE.md), [데이터 모델](DATA_MODEL.md),
  [계약](MODULE_CONTRACTS.md), [ADR-009/010](DECISIONS.md), [테스트 기록](TEST_PLAN.md), [작업 기록](TASKS.md).
- 후속: [마스터 플랜](PHASE3_MASTER_PLAN.md), [실행 백로그](PHASE3_BACKLOG.md).

## H-01 후속 진행 (2026-11-09, 최종 검토)

아래 본문과 벤치마크는 제품 기준5d43471의 감사 시점 기록으로 보존한다.
후속 H-01은 tie.ts의 유효 체인 순회/긴 순환 감지를 방문 ID 기반으로 수정했다.
66체인63360ticks, 67/128체인·명령·재생 호출·JSON/IndexedDB 복원의 신규28개 및 전체642개가 통과했고
정적 검사/architecture/build도 통과했다. 생성64한계는 유지한다.
당시 Codex Chromium55개는 listen EPERM으로 미실행하여 커밋을 보류했다.
이후 사용자가 수정된 H-01의 Mac Chromium **55/55 PASS**를 확인하여 로컬 커밋 검증 조건을 충족했다.
[TEST_PLAN §30](TEST_PLAN.md) 및 [백로그 H-01](PHASE3_BACKLOG.md)을 따른다.
H-02와 수동 인수는 여전히 미해결이며 아래 최종 무조건 인수 보류 판정은 유지한다.

## 1. 인수 판정

**Phase 2 의 통상 편집 흐름은 자동 검증을 충족하지만, 최종 무조건 인수는 보류한다.**
기존 614 개와 사용자 Mac Chromium 55 개 통과는 유효한 증거다. 그러나 이번 경계 진단에서
긴 타이 체인의 재생 길이 누락을 재현했고, 가져온 비표기가능 음가가 실제 VexFlow 음가 계산에서 근사됨을 확인했다.
기존 PASS 를 취소하거나 이 결함이 이미 테스트되었다고 간주하지 않는다.

Phase 3 설계/계약 작업은 진행 가능하다. 재생 속도·A–B 및 클립보드의 본 구현은
백로그 H-01/H-02 의 경계 정책 결정과 회귀 수정 후 시작하는 것을 조건으로 권고한다.
공개 출시나 Safari/모바일/실제 청취까지 인수 완료했다는 판정은 아니다.
치명적 저장 덮어쓰기 결함은 이번 검토에서 재현되지 않았다. 이는 모든 저장 실패가 없다는 보장은 아니다.

## 2. 증거와 검증 범위

| 증거 | 상태 | 확인 범위 / 한계 |
|---|---|---|
| 이번 `npm run test` | PASS, 41 파일 **614/614** | 기존 테스트 무수정. Node 기반; 오디오/DOM/React 대역 포함 |
| 이번 `npm run check:architecture` | PASS | 62 모듈/186 의존성, 경계 55 파일 위반 0 |
| Chromium E2E | **사용자 Mac 55/55 PASS** | 사용자 직접 확인 및 TEST_PLAN §28 기록. 이번 감사에서 브라우저 재실행하지 않음 |
| typecheck/lint/build | 기준 커밋의 직전 실행 PASS | 이번 문서 전용 감사에서는 재실행하지 않음 |
| 임시 순수 함수 진단/벤치마크 | 실행 완료 | Node/Apple M2, 아래 재현 코드·원시 시간 참조; 새로운 회귀 테스트 등록은 아님 |
| Safari/WebKit/실제 모바일/실제 청취 | **미검증** | 자동화 PASS 로 대체하지 않음 |
| 실제 SVG 전반 시각 인수 | **미완료** | Chromium E2E 의 특정 SVG 속성 검사는 존재. 전체 글꼴/다중 행/극단 음역 눈검사는 별도 |

기존 Codex E2E `listen EPERM 0.0.0.0:3010` 기록과 이후 사용자 Mac 성공을 구분한다.
이 감사는 서버 실행을 다시 시도하지 않았으므로 새 EPERM 발생으로 기록하지 않는다.
Playwright 는 Desktop Chrome 한 프로젝트/단일 worker 이며 Safari·모바일 매트릭스가 아니다.

## 3. 기능별 실제 상태

상태: **자동 완료**=선언된 지원 범위의 구현·자동 검증, **인수 미완료**=구현/자동 증거는 있으나 실기기 등 미완료,
**부분**=요구 중 일부만 구현, **미구현**, **지원 밖**=현재 승인 범위에서 제외.
자동 완료와 인수 미완료는 서로 다른 검증 축이며 아래에서 함께 표시한다.

| 기능 | 판정 | 실제 코드 / 검증 근거 | 제한·미검증 |
|---|---|---|---|
| canonical Score/Part/Measure/Event/Pitch | 자동 완료 | [types](../src/domain/score/types.ts), [validate](../src/domain/score/validate.ts), score-validation/serialize 테스트 | Part 당 단선율, NoteEvent 당 Pitch 하나. 타입의 schemaVersion 은 number, 런타임 검증이 2 강제 |
| 음표·쉼표·타이·ID/메타데이터 | 자동 완료 + 경계 결함 | [tie](../src/domain/score/tie.ts), tie-* 및 rest-* 테스트 | 긴 가져오기 타이·비표기 음가 아래 H-01/H-02 |
| 박자·템포·조표 설정 | 제한적 구현/자동 완료 | ScoreSettings, SetTempo/SetKeySignature/SetTimeSignature; settings 테스트 | 템포 20–400, UI 2/4·3/4·4/4·6/8. 박자 변경은 모든 Part 에 이벤트·타이가 없을 때만 |
| Command/Undo/Redo/단일 Store | 자동 완료 | [apply](../src/domain/commands/apply.ts), [edit-session](../src/application/edit-session.ts), [store](../src/store/score-store.ts) | 스냅샷 메모리 이력, 영속 Undo 없음. 이력 크기 제한 없음 |
| 입력 커서/음표 삽입·수정·삭제 | 제한적 구현/자동 완료 | append-note, EditCursor, Editor; edit-cursor/commands-* | 마디·박 폼→절대 tick, 빈 위치 충돌 거부. 오선 클릭으로 구간 선택/클립보드 없음 |
| 쉼표 편집/리플로우 | 자동 완료 | InsertRest/UpdateRest/DeleteEvent, rest-editing/rest-persistence | 쉼표 비리플로우·한 마디 한 음가. ResizeNote 의 뒤 이벤트 리플로우와 구별 |
| 88 건반·컴퓨터 키·입력음 | 자동 완료/인수 미완료 | PianoKeyboard/keys/pianoPreview; piano-* 단위 및 E2E | MIDI21–108, 샵 고정 신규 입력. 짧은 단일 미리듣기 음성, 실제 피아노 샘플/폴리포니 아님 |
| VexFlow 악보/커서/라벨/하이라이트 | 제한적 구현/인수 미완료 | renderScoreInto/StaffView; notation/rest/note-label/transpose-consistency 및 E2E | 첫 Part, 4 마디/행, 가로 스크롤. 전체 시각·모바일 인수 없음 |
| Tone 악보 재생·정지·일시정지·재개 | 제한적 구현/인수 미완료 | playScore/PlaybackControls, playback/tie-playback/transpose-playback | 첫 Part, 시작 tick0. 편집 커서부터 재생·속도·반복 없음. 실제 청취 없음 |
| 재생 커서/메트로놈 | 자동 완료/인수 미완료 | playbackPositionAt, highlightPlayback, playback 테스트/E2E | 25ms 갱신, 6/8 은 8 분음표 6 클릭(복합박 2 클릭 아님) |
| 조옮김 순수 엔진 | 자동 완료 | music-theory/transpose, score/transpose, transpose.test.ts | 동일 모드, 모든 Part, 표현 불가 전체 실패 |
| TransposeScore Command | 자동 완료 | applyEditCommand, transpose-command.test.ts | 1 명령/1Undo. 순수 엔진은 updatedAt 보존, 실제 Command 변경만 주입 시각 적용 |
| 미리보기·확정·취소 | 자동 완료/인수 미완료 | TransposeTool, transpose-preview 단위/E2E | 세션 참조/revision/저장 상태 검사, 후보 읽기 전용. UI 직접 임의 반음 입력은 없음(엔진/추천으로 반음·옥타브 지원) |
| 음이름·고정도법 | 자동 완료/인수 미완료 | formatNoteLabel, NoteLabelsControl, Annotation | Pitch 철자 사용, 로컬 모드, 타이 머리만. 이동도법 지원 밖 |
| 전체/Part 별 음역·추천 | 자동 완료/성능 인수 미완료 | range/range-recommendations, RangeRecommendations; score-range/UI/추천 E2E | 모든 Part 공통 목표. 전체 적합 상위 8 또는 부분 적합 상위 5. 악기 능력 판단 아님 |
| IndexedDB 자동/수동 저장·재열기 | 자동 완료/복구 인수 미완료 | repository/useAutosave/SaveButton; repository/autosave/manual-save 및 E2E | 강제 종료 최신 메모리 무손실 보장 없음 |
| JSON 백업·새 ID 가져오기 | 자동 완료 | score-library/serialize/file-export/json, score-backup 및 E2E | 5MiB UI 제한, v1→v2 메모리 변환. PDF/MIDI/MusicXML 아님 |
| OCC/Tombstone/BC/읽기 실패 보호 | 자동 완료/실환경 인수 미완료 | ADR-010, storage-concurrency/score-open-preservation 및 실제 두 탭 E2E | 알림 유실에도 CAS 보호. 원시 손상 데이터 백업 UI 없음 |
| 모바일 대응 | 부분/실기기 미검증 | flexWrap, maxWidth, Staff/Piano overflowX, 일부 44px 컨트롤, pointer 입력 | 전체 버튼 터치 크기 보장·반응형 재설계·VoiceOver 미검증 |
| 구간 선택·복사·잘라내기·붙여넣기 | 미구현 | 현재 selectedEventId 단일 선택뿐, 관련 Command 없음 | Phase3 계획 |
| 연습 속도/A–B 반복 | 미구현 | 현재 PlaybackHandle 에 rate/loop API 없음 | Score 템포 변경과 구분 필요 |
| PDF/MIDI/MusicXML 출력 | 미구현 | file-export 는 JSON 만 | 승인된 Phase5 범위 |
| MusicXML 입력 | 미구현/현재 MVP 밖 | XML parser/importer 없음 | PRD 의 JSON 복원과 혼동 금지, 별도 범위 승인 |
| 허밍/녹음/채보 | 미구현 | recording/transcription 런타임·route 없음 | Phase4 의 확정 MVP, 현재 provenance 값만 존재 |
| 다중 Part 기보·동시 재생/화음 | 현재 지원 밖 | 저장/변환/분석은 복수 Part 가능, renderer/player 는 parts[0] | 승인된 확장 없이 동일 스프린트 포함 금지 |

## 4. Phase 2 데이터 흐름과 보존 계약

### 4.1 음악 표현

- `Pitch.midi`와 `step/alter/octave`는 같은 소리의 **완전한 철자**다. 조표를 중복 적용하지 않는다.
  E#와 F, B#3 와 C4, Cb4 와 B3 는 같은 MIDI 라도 다른 표기를 유지한다.
- `intervalBetweenKeys`는 반음 이동과 문자 이동을 분리한다. nearest 의 ±6 동률은 상행.
  목표 조성의 up/down 은 옥타브 미만, 같은 pitch class 는 0 이며 이명동음 문자 이동은 가능하다.
- 반음 엔진은 표현 가능한 동일 모드 후보를 비교해 조표 단순성/기존 경향/고정 순서로 선택한다.
  12 의 배수는 조표 철자를 보존한다. 장조↔단조는 거부한다.
- MIDI0–127, octave0–9, alter−2–2 를 **모두** 만족해야 한다. MIDI0 이 허용된다고 C−1 이 유효한 Score Pitch 인 것은 아니다.
  target MIDI 입력의 C−1 표시는 설명용이며 Score 제약을 완화하지 않는다.
- 모든 Part 에 같은 반음·문자 음정을 적용하고 하나라도 실패하면 전체 결과를 반환하지 않는다.
  첫 Part 가 목표 조성 기준이다. 다른 조성의 Part 를 임의로 첫 Part 와 같은 조성으로 만들지 않는다.
- Note/Event/Measure/Part ID, ties, 쉼표, 시작/길이, 템포·박자, velocity/provenance, 생성/수정 시각은 순수 변환에서 보존된다.
  [transpose-consistency](../tests/integration/transpose-consistency.test.ts)는 실제 VexFlow 음높이/임시표 계산을 쓰되 DOM 그리기를 대체하고 Tone 호출을 대역으로 확인한다.

### 4.2 편집과 임시 후보

`Score → transposeScore(임시) → StaffView(후보)`는 Command/저장을 실행하지 않는다.
확정은 `scoreStore.dispatch(TransposeScore) → applyCommand → applyEditCommand → 새 Score → 구독 → useAutosave` 경로다.
원본·후보 StaffView 는 같은 event ID 를 갖지만 Editor 의 하이라이트 root 는 원본만 감싼다.

- 확정 직전 세션 객체 참조와 revision 을 다시 검사하고 오류/충돌/삭제 시 차단한다.
  ID/updatedAt 비교만으로 신선도를 판단하지 않는다. 동기 dispatch 전 await 없음.
- 추천 목표 변경은 결과·추천 ref 를 무효화한다. 원본 편집/Undo/Redo/다른 Score/revision 변경은 오래된 추천·확정을 차단한다.
- 실제 변경만 이력에 추가하고 Redo 를 지운다. 실패/no-op 은 Score·session·Redo·updatedAt 을 보존한다.
  0 반음 이명동음 재기보는 no-op 으로 단정하지 않는다.
- Undo/Redo 는 snapshot 과 그 timestamp 를 복구하며 DB revision 을 되돌리지 않는다.
  기존 음표/쉼표 Command 에는 timestamp payload 가 없는 것들도 있으므로 모든 편집이 updatedAt 을 갱신한다고 단정하지 않는다.
  저장 목록의 updatedAt 정렬이 모든 음표 편집 시각을 반영하는지는 별도 정리 후보다.
- SetKeySignature 는 기존 MIDI/철자를 보존하는 조표 편집이며 실제 음높이 변경인 TransposeScore 와 다르다.

### 4.3 렌더링·재생

- VexFlow 는 Pitch 철자로 key 를 만들고 `Accidental.applyAccidentals`로 조표·마디 내 임시표를 계산한다.
  단조는 fifths 에 해당하는 같은 조표 모양을 사용한다. 메이저로 소리를 재해석하지 않는다.
- Annotation 은 읽기 전용/포인터 비간섭, 타이 뒤 세그먼트와 쉼표 라벨 생략. none/letter/fixed-do 는 로컬 UI 상태다.
  모드 변경은 Score/Undo/dirty/revision/JSON 에 포함되지 않는다.
- 재생은 `mergeTiedNotes`의 MIDI 를 Tone.Frequency 에 전달한다. 일반 음 gate0.9, 타이 머리 gate1.
  쉼표/빈 구간은 절대 tick 으로 간격 유지. pause/resume 은 남은 지속음에 한 번 재어택하는 정책이다.
- Score 변경/Undo/Redo/미리보기 진입은 재생을 정지·비동기 요청 무효화한다.
  취소가 이전 재생을 자동 재개하는 정책은 아니다. stale 오디오 handle 은 늦게 도착해도 정지한다.
- 현재 Tone 호출은 velocity 인자를 전달하지 않는다. 값 보존과 강약 청취 검증은 다르며 강약 반영은 미구현 한계다.

### 4.4 저장 안전성

- 정상 envelope `{id,json,updatedAt,revision}`, Tombstone `{id,revision,deleted:true,deletedAt}`.
  read/load 에서 null 은 실제 미존재만 의미하며 손상/미지원/읽기 오류/삭제는 오류다.
- create 는 absent 일 때만. save/delete 는 expectedRevision 필요. 비교+put+커밋을 같은 readwrite 트랜잭션에서 수행한다.
  revision 은 커밋 성공 후에만 증가하고 알림도 그 뒤 발행한다. BC 는 DB 재확인 힌트일 뿐 권위가 아니다.
- legacy revision0 은 읽기 무수정, 정상 수정/삭제 CAS 에서 지연 전환. v1 음악은 메모리에서 v2 로 변환한다.
  DB2 blocked/versionchange 는 실패 안내/연결 종료로 구 writer 를 차단한다.
- Loader 성공 전 편집기/useAutosave 미마운트. 손상 저장본을 빈 Score 로 대체하지 않는다.
  목록은 손상 row 를 숨기지만 삭제하지 않는다. 원시 row 전용 백업 UI 는 아직 없다.
- useAutosave 가 debounce400ms, 쓰기 직렬화, 최신값까지 flush, 저장 상태/revision 을 소유한다.
  동일 내용 수동 저장도 DB revision 을 확인한다. 충돌/삭제 후 자동·수동 저장 차단, 메모리/Undo 유지.
- 복구 선택: JSON 백업, 새 ID 로 저장, 명시 확인 후 최신본 열기. 강제 덮어쓰기/자동 병합 없음.
- 앱 내부 연결은 flush 후 이동. dirty beforeunload 안내/hidden 조기 저장/focus·pageshow 재확인은 보조 보호다.
  강제 종료·OS 종료·브라우저 저장소 삭제/용량 제한·직접 URL 이동/뒤로가기에서 미커밋 내용까지 보장하지 않는다.
  네이티브 경고는 환경에 따라 표시되지 않을 수 있으므로 실제 환경 인수 필요. 저장됨은 실제 트랜잭션 완료 후다.

## 5. 결함 및 위험 등록부

심각도는 이번 감사의 평가다. **P0**=즉시 데이터 파괴/핵심 동작 전면 불가, **P1**=중요 정확성/보존 위험,
**P2**=지원 제약·품질 개선. 이번에 재현된 P0 없음.

| ID | 등급/상태 | 근거·영향 | 조치 및 게이트 |
|---|---|---|---|
| R1 / H-01 | **P1, 재현 결함** | 유효 JSON 으로 수락된 66 개 타이 세그먼트(65 링크). 기대 63360 ticks, mergeTiedNotes 결과 62400, chainIdsOf(head)65 개. MAX_TIE_SEGMENTS 루프와 검증/import 허용 범위 불일치 | 임의 데이터 수정 없이 정책 결정 후 긴 체인 회귀 수정. A–B/클립보드 전 차단 |
| R2 / H-02 | **P1, 음가 계산 재현** | 1000ticks 음표를 validate/import 가 수락. 실제 vexDurationOf(1000,false)는 q, 실제 VexFlow StaveNote 는 4096/16384 온음표=canonical960ticks 를 반환. Tone 는 원래 1000 사용. 저장을 바꾸지는 않지만 기보/소리 길이 불일치 | 이번 진단을 회귀 테스트로 등록한 뒤 거부/정확한 표시 정책 승인. 무조건 인수 차단 |
| R3 / H-03 | **P1, 부하 측정 위험** | 동기 추천: 1024 음표/255 타이 중앙값 610.022ms. 메인 스레드 UI 입력·저장 타이머 처리를 지연시킬 수 있음 | 브라우저 측정/목표 합의 후 최적화 별도 작업. 이번 Node 수치를 UI 지연 보장값으로 쓰지 않음 |
| R4 / UAT-R | **P1, 잔존 저장 위험** | 마지막 커밋 이후 메모리는 강제 종료 시 잃을 수 있음. BC 누락 시 충돌 인지가 늦어도 CAS 는 보호 | JSON/수동 저장 운영, 실제 이탈 인수. 복구 저널은 ADR-010 제외·별도 승인 |
| R5 / UAT | **P2, 인수 공백/범위 차이** | Safari/모바일/실제 청취·SVG 시각 미검증. 전체 Part 분석/변환과 첫 Part 기보·재생의 차이 | 사용자에게 범위 명시, 아래 수동 체크. 다중 Part 확장은 별도 프로젝트 |

추가 P2: 무제한 Undo 스냅샷 메모리, 전체 JSON 비교/직렬화·악보함 getAll 파싱 비용,
라벨 없는 고밀도 마디 고정 폭, 재생 velocity 미반영, 편집 시각/목록 정렬 의미, 원시 손상본 export UI 부재.
StaffView 는 import 대기 이후 DOM 을 그리며 cleanup 의 cancelled 는 오류 문구만 막는다.
지연 렌더 완료 순서의 역전은 코드상 검토 후보이나 이번에 재현하지 않았고 확정 결함으로 분류하지 않는다.

## 6. 성능·확장성

### 6.1 측정 방법과 결과

Node v22.21.0, darwin arm64, Apple M2, HEAD5d43471. 동일 프로세스에서 모듈 로딩/TypeScript 변환을 먼저 완료하고
8 마디 추천 1 회 warm-up 후 각 함수 3 회 측정. 아래는 다른 검증 명령과 병행하지 않은 최종 실행값이다.
자연음 C4/D4/E4/G4 를 각 마디 4 분음표로 배치한 **합성 데이터**이며 실제 사용자 악보 샘플은 아니다.
전체 Score 를 validateScore 로 검사하고 전후 JSON 동일성을 확인했다. tied 는 매 마디 첫 음을 앞 마디 마지막 G4 와 연결한
길이 2 체인 255 개다(위 R1 의 긴 단일 체인과 다름). 모든 데이터의 목표는 MIDI62–74.

| 데이터 | Part 당 마디 | Part | 음표 / 타이 링크 | JSON bytes | 추천 3 회(ms) | 추천 중앙값(ms) | 위치 1000 회 중앙값(ms) | 타이병합 중앙값(ms) |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| small | 8 | 1 | 32 / 0 | 6021 | 8.368, 6.146, 5.149 | 6.146 | 0.821 | 0.013 |
| medium | 64 | 1 | 256 / 0 | 46368 | 28.710, 30.921, 25.333 | 28.710 | 4.834 | 0.037 |
| large | 256 | 1 | 1024 / 0 | 185928 | 101.541, 101.632, 100.645 | 101.541 | 13.094 | 0.159 |
| multi | 64 | 4 | 1024 / 0 | 184992 | 113.222, 108.748, 102.876 | 108.748 | 3.172 | 0.038 |
| tied | 256 | 1 | 1024 / 255 | 195909 | 613.030, 607.090, 610.022 | 610.022 | 13.204 | 0.652 |

각 데이터에서 유효 중복제거 후보 116 개/실패 요청 145 개를 얻었다. 300−145=155 성공 요청 중 중복이 제거된 것이며
후보 116 과 실패 145 를 더해 전체 요청 수로 오해하지 않는다. 대형 데이터는 256 마디/1024 음표, 4Part 데이터는 각 64 마디다.
초대형·복잡한 조표·긴 체인·저사양 기기·브라우저 UI·SVG·Tone 실제 예약 시간/메모리는 측정하지 않았다.
3 회는 안정적 백분위/성능 SLA 를 정할 표본이 아니다. raw 측정과 재현 스크립트는 아래 부록에 보존한다.

### 6.2 계산 비용과 개선 후보 (이번에 구현하지 않음)

- 추천은 15 같은모드 조성×3 방향 45 + 반음−127..127 의 255 =300 요청. 엔진 내부 이명동음 후보 검사는 추가로 발생한다.
- E=이벤트, T=타이, k_m=마디별 이벤트 수로 두면 검증은 마디 정렬과 각 타이의 noteById 전체검색 때문에
  대략 `O(E + Σ k_m log k_m + T·E + 64T)` 비용을 갖는다. C=300 인 추천은 이 검증/복사를 반복하며
  성공 후보마다 분석·초과음 목록도 계산한다. 입력 검증과 출력 검증이 반복되므로 단순 300×상수 계산이 아니다.
- 변환은 Score 전체를 JSON 으로 복제하지 않고 Part/Measure/Note/Pitch 새 객체를 만들며 쉼표·타이는 공유한다.
  후보 Score 는 영속화하지 않지만 임시 객체/GC 비용은 발생한다. 결과는 K 개후보의 위반음 목록으로 최악 O(K·E) 메모리를 점유한다.
- React useMemo 는 score/목표 객체가 유지되는 동안 재사용하지만 입력 변경→다시 계산은 새 요청이다.
  명시 계산 버튼은 매 키 입력의 반복 계산을 막는다. 결과 상위 8/5 제한은 전체 엔진 탐색 비용을 줄이지 않는다.
- 개선 순서 제안: 측정 가능한 브라우저 fixture → 타이 ID 조회 인덱스 → 동일 불변 snapshot 의 검증/후보 재사용 검토
  → 범위와 무관한 변환 분석 캐시(세션 참조+spec, 목표별 순위 재계산) → 필요 시 Worker.
  캐시는 ID/updatedAt 만 키로 쓰지 않고 세션 변경 시 무효화·크기 제한이 필요하다.
  검증 생략·최종 Command 검증/OCC 우회는 허용하지 않는다. Worker 경계 도입은 구조 영향 검토/승인 후다.
- SVG: 마디/이벤트/타이에 비례해 DOM 이 늘고 cursorTick/label/Score 변경마다 전부 다시 그린다.
  4 마디/행, 라벨 모드는 폭/행높이 180·BBox 확대, none 은 폭 220/행높이 130. 라벨 없는 고밀도·극단음은 별도 인수 필요.
  페이지 나눔/viewport 렌더링/다중 Part 시스템 배치는 현재 없다. 이번 SVG 노드 수·렌더 시간은 미측정.
- 재생: 첫 Part 의 병합 음 전체와 모든 메트로놈 클릭을 시작/재개에 예약한다. 긴 Score 의 시작 비용/예약량은 증가한다.
  merge 의 타이 대상 선형 검색, 25ms 마다 playbackPositionAt 의 이벤트 순회와 highlightPlayback 의 DOM 순회가 있다.
  위 위치 1000 회는 순수 함수만 측정했으며 React/DOM 시간을 포함하지 않는다.
  look-ahead 스케줄러/활성 음 인덱스는 향후 개선 후보이며 rate/loop 전 계약·시험으로 설계한다.

## 7. 수동 인수 시나리오 (모두 아직 미실행)

준비: 원본을 JSON 백업하고 테스트용 새 ID 를 사용한다. 저장소 초기화/기존 row 삭제로 테스트하지 않는다.
Mac Chrome/Safari 는 각각 브라우저·버전/OS 를 기록하고 아래 M-01~M-09 를 **별개 실행**한다.
모바일은 실제 iPhone Safari/Android Chrome 의 기종·OS·화면 방향·브라우저를 별도 기록한다.
모든 항목 기본 상태는 **NOT RUN**이며 Chromium 자동 E2E 성공을 수동 PASS 로 복사하지 않는다.

| ID | 조작 절차 | 기대 결과 | 증거/실패 기록 |
|---|---|---|---|
| M-01 생성/입력 | 악보함 새 악보→제목→C4,D4,E4,G4 클릭·컴퓨터키→음표 선택 후 음높이/길이 변경·삭제 | 88 건반 스크롤, 이벤트·오선·라벨 일치, 빈 위치만 입력. 충돌 거부 후 원본 불변 | 화면 캡처+JSON 전후, 클릭/키 매핑·선택 위치 기록 |
| M-02 커서/Undo | 커서 2 마디 2 박→빈곳 입력→Undo/Redo→충돌위치 입력 | 절대 tick·다음커서·한 Undo 단위, 실패 이력 불변 | 커서 tick/음표 ID/undo 전후 JSON |
| M-03 조옮김 | C→D/Db/C# 및 단조의 후보→취소→다시 확정→Undo/Redo | 정확한 철자/조표/소리, 취소 무쓰기. 0 반음 이명동음 편집과 no-op 구별 | 원본/후보 SVG, DB revision 전후, JSON |
| M-04 라벨/시각 | none→letter→fixed-do→none, 겹임시표·B#/Cb·높낮은 음·5 마디이상·행간 타이 | 라벨·기둥/타이 안겹침/잘림 없음, 원본·후보 분리, dirty/이력 불변 | 100%/확대 화면, 폰트/배율·SVG 캡처 |
| M-05 추천 | 목표 62–69→추천/취소→84–91 옥타브 추천→확정; 좁은 64–64; 잘못된 min/max | 전체/부분 분리, 초과음 설명, 목표/원본 변경 시 stale 차단 | 입력값/추천순위/반응시간·JSON |
| M-06 저장 | 연속편집→수동저장연속 클릭→도중편집→저장됨 확인→새로고침→악보함 재열기 | 최신 ID/제목/음표복원, 저장중 이전값을 완료로 표시하지 않음 | 원시 row revision/저장 UI/JSON/콘솔 |
| M-07 JSON/손상 | 백업→새 ID 가져오기; 별도시험 ID 에 손상 JSON/미지원 schema 주입→직접 URL | 정상 parts/ties 동등, 실패원시 row 보존·편집기/자동저장 미시작 | 주입원시값 전후·오류코드. 정상 저장본에 주입 금지 |
| M-08 두 탭 | 같은 ID 두탭→A 조옮김저장→B 저장; A 삭제→B 직접 URL/저장 | 한승자/OCC, 패자메모리·Undo/JSON 유지, Tombstone 재생성차단 | 양탭영상·row/revision·알림유무·패자복구선택 |
| M-09 이탈/오류 | dirty 새로고침 취소→hidden→복귀→저장확인; 뒤로가기/URL 이동; 별도시험저장오류→재시도 | 취소 시 편집 유지, 커밋확인 후 복원, 오류 후 성공은 이전실패문구 제거 | 경고유무/선택/마지막 커밋 row. 강제종료손실은 시각·마지막저장값 기록 |

### 실제 오디오 (A-01~A-05, NOT RUN)

- A-01: 입력 C4/A4(69)와 검증된 기준음/튜너를 비교한다. 입력 미리듣기와 전체재생 각각 녹취(동의된 합성음만).
  기대: 같은 MIDI 기준 높이, 이명동음 B#3/C4 는 같은 소리이며 라벨은 다름. 스피커/헤드폰/볼륨/기준 튜닝을 기록한다.
- A-02: C→D/Db/C# 확정 전후 같은 선율 청취→Undo/Redo→재생. 기대: 반음 이동량과 실제 소리 일치,
  Db/C#는 같은 소리·다른 철자. 틀린음은 part/event ID·tick·예상/실측음으로 기록한다.
- A-03: 정상 2~3 세그먼트 행간 타이→지속 청취→중간 Pause/Resume→Stop.
  기대: 경계 중복어택 없음, 재개 시 남은 지속음 1 회, Stop 후 잔음 없음. R1 긴체인은 알려진 결함으로 따로 기록한다.
- A-04: 2/4·3/4·4/4·6/8, 60/120BPM, 메트로놈 ON/OFF. 기대: 분모음가 클릭/첫박강조,
  클릭과 음표 정렬. 별도 속도/반복은 아직 없으므로 테스트 PASS 대상 아님.
- A-05: 입력음 OFF/ON·빠른반복·탭숨김·스피커음소거/해제·오디오활성화거부 후 다시입력/Play.
  기대: 음표입력·저장 유지, 오류명확, 해제/사용자제스처 후 복구, 이전 음남음/이중어택 없음.
  OS 음소거는 앱의 오디오 실패와 구분한다. 전체악보용 별도 mute UI 는 현재 없음.

### 모바일 (T-01~T-04, NOT RUN)

- T-01 세로/가로에서 악보·건반 각각 가로스크롤→터치입력/스크롤취소. 기대: 의도치 않은 입력 없음,
  화면 전체 가로넘침/잘림 없이 핵심제어 접근. 기종·viewport·회전 전후 화면 기록.
- T-02 목록 음표선택→커서폼이동→수정/Undo. 기대: 라벨이 터치를 가로채지 않고 선택·커서 유지.
- T-03 표시모드→조옮김→추천입력→취소/확정. 기대: 읽기쉬운 글꼴/임시표, 버튼/입력에 접근 가능.
- T-04 저장→앱백그라운드→복귀→새로고침/재열기. 기대: 완료된 최신커밋 복원·오류안내, 강제종료무손실로 해석하지 않음.

실패 티켓 형식: `ID / 기준커밋 / 기기·OS·브라우저·배율 / Score JSON 또는 원시 row(민감정보 제거) /
정확한 재현순서 / 기대·실제 / 마지막저장 revision·상태 / 캡처·콘솔·trace / 심각도 / 재검증 결과`.
수동 PASS 는 실행자/일시/증거 위치가 있어야 기록한다. P0/P1 이 남으면 해당 인수 게이트를 통과시키지 않는다.

## 8. 문서 일관성 및 범위

TASKS/TEST_PLAN 에는 과거 EPERM·부분 단계 기록을 유지하고 최신 감사 링크만 추가한다.
MODULE_CONTRACTS 의 과거 Phase0 표(Repository 인터페이스만 등)와 과거 저장보호 절의 '정상 다중탭 해결 아님'은
당시 단계 기록이며, 현재 계약은 ADR-010 절과 실제 구현이 우선한다. 필요 시 별도 문서 정리 작업으로 다룬다.
14 개 MVP 요구를 삭제하거나 완료로 일괄 승격하지 않는다. Phase3 는 speed→loop→selection/clipboard,
Phase4 는 허밍, Phase5 는 PDF/MIDI/MusicXML 출력이라는 승인 기준을 유지한다.
MusicXML 입력·다중 Part 표현 확장은 승인 없이 추가하지 않는다. UI 전면개편은 독립 작업이다.

## 부록 A. 성능 측정 재현 코드

프로젝트 루트에서 아래를 `/tmp/music-score-phase2-bench.cjs`로 저장한 뒤
`node /tmp/music-score-phase2-bench.cjs`로 실행한다. 기존 TypeScript 패키지만 사용하며 제품/DB 를 변경하지 않는다.

```js
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), os = require('node:os');
const root = process.cwd();
const ts = require(path.join(root, 'node_modules/typescript'));
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, ...args); };
require.extensions['.ts'] = function(module, filename) { module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename); };
const { createEmptyScore, createNoteEvent } = require(path.join(root,'src/domain/score/create.ts'));
const { validateScore } = require(path.join(root,'src/domain/score/validate.ts'));
const { recommendTranspositions } = require(path.join(root,'src/domain/score/range-recommendations.ts'));
const { playbackPositionAt } = require(path.join(root,'src/domain/score/playback.ts'));
const { mergeTiedNotes } = require(path.join(root,'src/domain/score/tie.ts'));
function fixture(bars, parts, tied) {
 const score=createEmptyScore({id:'bench',measureCount:bars,createdAt:'2026-11-09T00:00:00.000Z'});
 const template=score.parts[0]; score.parts=[];
 for(let p=0;p<parts;p++) {
  const part={...template,id:`p${p}`,ties:[],measures:[]};
  for(let m=0;m<bars;m++) {
   const events=Array.from({length:4},(_,j)=>createNoteEvent({id:`p${p}:m${m}:n${j}`,step:['C','D','E','G'][j],octave:4,startTick:m*3840+j*960,durationTicks:960}));
   if(tied && m>0) {events[0].pitch={...part.measures[m-1].events[3].pitch};part.ties.push({from:`p${p}:m${m-1}:n3`,to:events[0].id});}
   part.measures.push({id:`p${p}:m${m}`,index:m,events});
  }
  score.parts.push(part);
 }
 const issues=validateScore(score);if(issues.length)throw Error(JSON.stringify(issues)); return score;
}
function times(run,n) {const samples=[];let value;for(let i=0;i<n;i++){const t=performance.now();value=run();samples.push(performance.now()-t);}return {samplesMs:samples.map(x=>+x.toFixed(3)),value};}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,head:require('node:child_process').execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim()}));
recommendTranspositions(fixture(8,1,false),{minMidi:62,maxMidi:74});
for(const [name,bars,parts,tied] of [['small',8,1,false],['medium',64,1,false],['large',256,1,false],['multi',64,4,false],['tied',256,1,true]]) {
 const score=fixture(bars,parts,tied), before=JSON.stringify(score);
 const rec=times(()=>recommendTranspositions(score,{minMidi:62,maxMidi:74}),3);
 if(!rec.value.ok)throw Error(JSON.stringify(rec.value));
 const pos=times(()=>{for(let i=0;i<1000;i++)playbackPositionAt(score,(i*960)%(bars*3840));},3);
 const merge=times(()=>mergeTiedNotes(score.parts[0]),3);
 if(JSON.stringify(score)!==before)throw Error('mutation');
 console.log(JSON.stringify({name,bars,parts,notes:bars*parts*4,ties:score.parts.reduce((n,p)=>n+p.ties.length,0),jsonBytes:Buffer.byteLength(before),recommendMs:rec.samplesMs,candidates:rec.value.candidates.length,rejected:rec.value.rejected.length,position1000Ms:pos.samplesMs,mergeMs:merge.samplesMs}));
}
```

## 부록 B. 경계 진단 재현

부록 A 의 로더/import 및 fixture/times 정의까지 사용하고, console.log 로 시작하는 측정 부분 대신 아래를 실행한다.
R1 은 실제 순수 함수 출력 재현이다. R2 는 메모리에서만 기존 비공개 음가 함수를 export 하여 호출하고 실제 VexFlow StaveNote 의 tick 을 계산했다.
VexFlow resolution16384 와 canonical 온음표 3840 의 비율로 환산했다. DOM/SVG 그리기·폰트는 시험하지 않았다.
Node 의 텍스트 canvas 없음 경고는 음가 계산과 별개이며 실제 레이아웃을 검증했다는 뜻이 아니다.

```js
const { deserializeScore } = require(path.join(root,'src/domain/score/serialize.ts'));
const { chainIdsOf } = require(path.join(root,'src/domain/score/tie.ts'));
const score=createEmptyScore({id:'long-tie',measureCount:17,createdAt:'fixed'});
for(let i=0;i<66;i++) {
 score.parts[0].measures[Math.floor(i/4)].events.push(createNoteEvent({id:`n${i}`,step:'C',octave:4,startTick:i*960,durationTicks:960}));
 if(i)score.parts[0].ties.push({from:`n${i-1}`,to:`n${i}`});
}
console.log(JSON.stringify({case:'66 tied segments',validation:validateScore(score),importAccepted:deserializeScore(JSON.stringify(score)).ok,expectedDuration:66*960,merged:mergeTiedNotes(score.parts[0]),chainIds:chainIdsOf(score.parts[0],'n0').length}));
const unusual=createEmptyScore({id:'duration',measureCount:1,createdAt:'fixed'});
unusual.parts[0].measures[0].events.push(createNoteEvent({id:'n',step:'C',octave:4,startTick:0,durationTicks:1000}));
console.log(JSON.stringify({case:'1000 ticks imported',validation:validateScore(unusual),importAccepted:deserializeScore(JSON.stringify(unusual)).ok}));

const filename=path.join(root,'src/adapters/vexflow/renderScore.ts');
const instrumented=new Module(filename,module); instrumented.filename=filename; instrumented.paths=Module._nodeModulePaths(path.dirname(filename));
instrumented._compile(ts.transpileModule(fs.readFileSync(filename,'utf8')+'\nexport { vexDurationOf };', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const duration=instrumented.exports.vexDurationOf(1000,false);
const { StaveNote, RESOLUTION }=require(path.join(root,'node_modules/vexflow'));
const note=new StaveNote({keys:['c/4'],duration});
console.log(JSON.stringify({case:'actual renderer duration mapping + real VexFlow tick calculation',canonicalTicks:1000,duration,vexTicks:note.getTicks().value(),vexResolution:RESOLUTION,canonicalEquivalentTicks:note.getTicks().value()/RESOLUTION*3840}));
```

실측 진단: R1 validation=[], importAccepted=true, expectedDuration=63360, merged.durationTicks=62400, chainIds=65.
R2 validation=[], importAccepted=true, duration=q, vexTicks=4096, vexResolution=16384, canonicalEquivalentTicks=960.
기존 614 개에는 이 두 경계의 회귀 assertion 이 없다.
