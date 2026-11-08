# Phase 3 마스터 플랜

- 작성: 2026-11-09, 기준 main `5d43471c7ffa383797340d29d40dd051828482c2`.
- 문서 상태: **제안/실행 전 계획**. 새 API·정책·시간 목표는 구현된 계약이 아니다.
- 근거: [인수 감사](PHASE2_ACCEPTANCE_REPORT.md), [실행 백로그](PHASE3_BACKLOG.md),
  [PRD](PRD.md), [아키텍처](ARCHITECTURE.md), [ADR](DECISIONS.md), [모듈 계약](MODULE_CONTRACTS.md).
- 이번 작업은 문서만 작성한다. Score v2/DB2/Part.ties/ADR-010 유지, 기능 구현·배포 없음.

## 1. 우선순위와 단계 경계

**권고 순서: 경계 안전성 보완 → 재생 속도 → A–B → 구간 선택 → 복사/붙여넣기 → 잘라내기 → 통합 인수.**
공통 시간축을 먼저 안정화하면 A–B 가 같은 runtime 경계를 재사용하고, 구간 선택이 나중에 A–B 지정 UX 에도 연결된다.
Clipboard 는 타이 경계·새 ID·원자 편집이라는 별도 위험이 있어 playback 변경과 같은 커밋에 섞지 않는다.

| 순서 대안 | 이점 | 비용/위험 | 판정 |
|---|---|---|---|
| 복사·붙여넣기 먼저 | 반복구절 입력 가치 큼, 오디오와 독립 | C-08 미결, 타이 잘림/ID/충돌/원자성 설계 필요. 재생 기초 문제는 해결되지 않음 | 선택 기반 설계는 병행 가능, 첫 제품 단계로는 보류 |
| 속도→A–B→클립보드 | 기존 ADR-004·AGENTS 순서와 일치, 오디오 tick/경계 회귀 순차 검증 | 재생 예약 취소/재개 계약부터 명확히 해야 함 | **권고**, 앞에 H-01/H-02 게이트 |
| A–B 먼저 | 연습 가치가 즉시 보임 | 속도 결합 때 scheduling 을 다시 수정할 가능성, 경계 타이 결함 확대 | 속도 시간축 다음 |
| PDF 먼저 | 공유/인쇄 가치, 읽기 전용으로 저장 위험 낮음 | 현재 SVG 화면은 인쇄 페이지 아님, 폰트·다중행/페이지 나눔 필요. 확정 Phase5 순서 변경 | 이번 Phase3 에 넣지 않음; 선행 구현은 별도 승인 |

PRD 14 기능과 Phase4 허밍·Phase5 출력의 범위를 줄이거나 삭제하지 않는다.
Phase3 설계는 지금 시작 가능하지만 재생/클립보드 구현은 감사의 H-01/H-02 인수 결함 해소 후 권고한다.
대형 추천의 성능 수용 범위는 Phase3 진입 전 합의하고, 관련 최적화는 독립 커밋/필요 시 별도 승인으로 진행한다.

## 2. 기능 후보별 분석

### 2.1 구간 선택·복사·붙여넣기 (MVP-006, Phase3)

- 사용자 가치: 반복구절 재사용, 입력량 감소. 현재는 selectedEventId 단일 선택/수정만 있고 clipboard Command/API 없음.
- 재사용: ScoreEvent/Part.ties, 절대 tick, chainIdsOf/splitNoteIntoMeasures/validateScore,
  기존 applyEditCommand→EditSession→Store→autosave. 영속 Score 구조 변경 필요 없음으로 예상한다.
- 최소 범위 제안: 첫 Part 의 연속 `[startTick,endTick)` 선택, 음표·쉼표·빈 구간의 상대 tick/길이 보존,
  메모리 내부 clipboard(시스템 clipboard 권한 불필요), 빈 대상에만 붙여넣기, 같은 문서 내 지원부터.
- C-08 승인 제안: 타이 체인을 자르는 선택은 거부하고 전체 체인 선택을 안내한다. 붙여넣기는 insert-without-shift,
  충돌/마디 부족 거부. overwrite/뒤 이벤트 밀기/자동 마디 생성/자동 tie 절단 없음.
  복사는 원래 Pitch 철자/MIDI 를 유지하며 목표 조표가 달라도 몰래 조옮기지 않는다.
- projection 은 canonical 이벤트의 읽기 전용 복사+상대 offset/타이참조다. 두 번째 writable Score 를 만들지 않는다.
  원본 선택 ID 는 바꾸지 않고 붙여넣을 이벤트 ID 만 경계에서 결정적으로 주입한 fresh ID 로 매핑한다.
  새 세그먼트·연결은 기존 split/validation 재사용, 모든 참조와 충돌을 계산한 뒤 단일 Command 결과를 만든다.
- Command 영향: Paste/선택삭제(Cut)는 각각 원자적 새 EditCommand 1 개 제안. 여러 dispatch 를 반복하지 않는다.
  실패/no-op 은 이력·Score·updatedAt·dirty 불변. 타임스탬프는 기존 편집 경계 주입 계약을 따른다.
- 저장/OCC: Copy/선택은 저장 없음, Paste/Cut 성공만 기존 autosave. revision/Tombstone 은 변경하지 않는다.
  충돌 상태의 영속 저장 차단/백업 선택을 유지한다. 새 쓰기 API 를 만들지 않는다.
- VexFlow/Tone: 기존 event ID 로 선택 하이라이트; 실제 편집 시 현재 정책대로 재생 정지.
  새 선택 root 는 후보 StaffView 를 포함하지 않게 한다.
- 복잡도 높음, 주요 위험은 타이 일부 선택·stale 선택·겹침·ID 재사용·실패 Cut 의 clipboard/Score 비동기 불일치다.
- 시험: gap/rest/tie/row 경계/동일 ID 충돌/여러번 paste/실패후 Undo·Redo/저장·JSON/두탭 OCC.

### 2.2 재생 속도 (MVP-008, Phase3)

- 가치: 느린 반복 학습. 현재 Score tempo20–400 변경만 있고 **비파괴 연습 속도는 없음**.
- 최소 범위: 25–150%, 5%단위, 기본 100%, 몇 개 preset. Score.tempoBpm/Pitch/JSON/Undo/revision 불변.
  `effectiveTempo = score.tempoBpm * rate`는 재생 계산용이며 Score 템포 검증 20–400 으로 clamp 하지 않는다.
- 재사용: PlaybackControls 로컬 runtime state, playScore tickSeconds/PlaybackHandle, pause/resume/stop token.
  속도 값을 Command/Store/IndexedDB 에 넣지 않는다. 파트/음악 모델 변경 없음.
- 제안 정책: 재생 중 속도 변경은 현재 절대 tick 을 확정한 뒤 이전 예약/음성을 취소하고 같은 tick 부터 남은음을 재예약한다.
  paused 는 tick 유지, stopped 는 다음 Play 부터 적용. 초기 버전의 더 단순한 stop 후 적용 대안과 비교 후 계약 확정한다.
  재예약이 필요하더라도 새 재생 엔진/전역 AudioContext 재생성은 금지한다.
- 위험: look-ahead/elapsedtime 혼용, 이전 note-off 가 최신 재생 끊음, metronome drift, 아주 느린 긴 예약량.
  정확한 runtime 재예약 API 와 수명은 구현 직전 최소 계약 변경으로 기록한다.
- 시험: 120BPM/50%=실효 60, MIDI 동일/지속 2 배, 25/150 경계/잘못된 rate, pause/resume/동작중변경,
  메트로놈·타이·Stop/지연초기화·Score 불변·무저장. 실제 청취는 별도.
- 복잡도 중간. 저장경로 영향 없음으로 설계하지만 무쓰기 assertion 으로 입증해야 한다.

### 2.3 A–B 반복 (MVP-009, Phase3)

- 가치: 어려운 구간 연습. 현재 loop 상태/API/선택 범위 없음.
- 최소 범위: 첫 Part 의 마디 기반 A/B 폼→절대 tick `[A,B)`; A<B, 악보 범위 안. OFF 가 기본.
  처음에는 오선 드래그/자동 phrase/다중 loop/영속설정 제외. 선택 UI 가 완성되면 범위 입력만 연결한다.
- 재사용: 속도 단계에서 검증한 clock/예약 취소 수명, mergeTiedNotes, measureTicks, playbackPositionAt.
  runtime 만 확장하고 Score/Command/DB 는 변경하지 않는다.
- 경계 제안: B 이후를 예약하지 않고 교차음은 B 에서 끝낸다. A 가 지속음 중간이면 남은 부분을 1 회 어택한다.
  반복마다 A 에서 시작하며 B 의 이벤트는 다음 구간에 속한다. stop 은 tick0/하이라이트초기화.
  타이 연결 자체는 수정하지 않는다. wrap/tempo/rate/metronome 의 tick 과 클릭이 같은 기준을 사용해야 한다.
- 무중단 loop 를 setInterval 의 25ms 폴링 정확도에 의존시키지 않도록 audio 예약 경계를 설계한다.
  rolling scheduler 가 필요한지 최소 API 검토 후 결정하며 대규모 엔진 교체는 승인 대상이다.
- 시험: A/B 끝 일치/한마디/빈구간/rest/tie 양끝/반복 N 회 noteon-off 개수/속도변경/백그라운드/Stop.
  DOM cursor 와 실제예약 인자, Score/JSON/revision 불변을 각각 검사한다.
- 복잡도 높음, 주요 위험 경계음 중복·잔음·오디오 drift. 실제 audio 청취 인수가 필수다.

### 2.4 인쇄·PDF (MVP-014 의 일부, 승인된 Phase5)

- 가치: 연습·공유용 인쇄. 현재 인쇄 route/style/PDF adapter 없음. 브라우저 메뉴로 인쇄 가능한 것과 제품 PDF 지원은 다르다.
- 재사용: canonical Score/기보 Pitch, VexFlow 와 라벨의 읽기 전용 projection, JSON 다운로드 수명 패턴.
  Score/Command/저장 변경 불필요. 현재 화면 SVG 를 그대로 잘라 PDF 라고 하지 않는다.
- 최소 범위 제안: 첫 Part, 제목/조표/박자/템포, A4 페이지 분할/여백/행간타이, 명시적 print preview,
  브라우저 Save as PDF. PDF 파일 자동 다운로드가 필요하면 별도 의존성/방법 승인을 받는다.
- 위험: 폰트/한글/ledgerline/label/viewBox, 머리글·footers·확대·실제프린터, 페이지간타이.
  기존 renderScoreInto 는 viewport4 마디/행이며 print 페이지 모델 없음. 출력 전용 view 분리 검토.
- 시험: SVG Pitch/리듬과 print 원본 동일, 페이지 bounds/라벨 clip/글꼴, 실제 PDF 열기·프린터 인수.
  무 Command·무쓰기·재생하이라이트 제외. 복잡도 중간~높음; Phase3 본 완료 기준에는 넣지 않는다.

### 2.5 MusicXML 내보내기·가져오기

- 현재 둘 다 미구현. **내보내기는 Phase5 확정 MVP**, **가져오기는 추가 범위 승인 필요**.
- 재사용: Score/Pitch.step·alter·octave/PPQ960/KeySignature/Part.ties/serialize 검증 경계.
  최소내보내기: 지원 단선율/쉼표/타이/tempo/meter/key, 지원 밖은 오류로 명시. 수정 Command/DB 변경 없음.
- 가져오기는 XML parsing/지원 subset mapping→전체 검증→새 ID 생성 경로가 필요하다.
  polyphony·tuplet·중간박자변경을 현재모델에 몰래 버리거나 근사하지 않는다. 새음악모델 필요 시 사전 ADR 승인.
- 위험 높음: divisions, enharmonic/옥타브, ties, external entity/자원제한, 여러 voice 와 unsupportednotation.
  필요라이브러리 승인은 별도. system clipboard/JSONimport 와 혼동 금지.
- 시험: MuseScore 등 독립 reader 와 파일확인, 지원 subset round-trip; 악성/거대/미지원 XML 거부·기존 row 불변.
  외부 reader 호환/버전은 실행 전 확인하며 이번 문서는 호환 PASS 를 주장하지 않는다.

### 2.6 허밍·녹음 자동 채보 (MVP-002/003, Phase4 별도 작업군)

- 가치: 건반 없이 멜로디 입력. 구현 없음. provenance.source/transcription·confidence 는 타입만 준비되어 있다.
- 재사용: canonical Score, 기존 음표/쉼표 생성·분할/Command, tempo/meter/preview 확정/저장 경계.
  audio frame/피치추정은 분석용 일시데이터이며 두 번째 편집 Score 가 아니다.
- 최소 범위: 사용자 동작의 mic 권한→짧은단선율녹음→무음/신뢰도→pitch/onset/반복음→quantize→후보→사용자검토→원자 확정.
  rawaudio 는기본메모리, 자동업로드 없음. 폴리포닉/상용곡분리/MP3WAVimport 제외.
- 영향: AudioTranscriptionPort(현재 미정의)/capture/analysis adapter 와 thread 경계 계약, 향후 batch Command.
  모델에 confidence/provenance 있는 범위 재사용, 추가음악필드 필요 시 승인.
- 난도 매우높음/별도 마일스톤. mic 브라우저호환/지연/노이즈/옥타브오류/반복음/지표데이터셋이 위험.
  F1≥0.90 은 기존 제안목표이며 성능 실적이 아니다. 동의된/합성 데이터·권한거부·중단·이전 Score 보존 시험 필요.

### 2.7 다중 Part 기보·재생 (현재 지원 밖, 별도 확장)

- 가치: 파트별 시청각 확인. **모델/저장/조옮김/음역분석의 복수 Part 지원을 UI·재생지원과 혼동하지 않는다**.
- 재사용: Part.id/clef/key/time/measures/ties, 모든 Part 변환. 최소 모델은 유지 가능하나 다른박자/길이와
  세로시스템정렬·동시오디오음성·파트선택을 별도설계해야 한다. NoteEvent 다성화는 추가모델승인 대상.
- Command 는 대상 partId 를 재사용할 수 있으나 편집 UI·선택정체성/글로벌재생 tick 계약 검토 필요.
  기존 OCC 단위는 Score 전체이며 파트별 독립 revision 으로 바꾸지 않는다.
- VexFlowsystem layout/Tone 음성소유·mixing 변화가 큼. complexity 매우높음, 같은스프린트 편입 금지.
- 최소시험: 서로다른 clef/key, 동시시작/rest/tie/part 별길이, 중복 ID/저장/전체 Undo.
  별도 요구/ADR 영향 승인 전 구현하지 않는다.

## 3. 단계별 실행 플랜

아래 파일은 **예상 수정 위치**이며 아직 존재하지 않는 새 파일/API 는 백로그에서 '신규 예정'으로 구분한다.
모든 단계는 새 library/상태관리/저장스키마를 기본적으로 추가하지 않는다.

| 단계 | 목표·범위 | 제외 | 선행 | 예상 모듈 | 시험/완료 기준 | 다음 의존 |
|---|---|---|---|---|---|---|
| P3-0 안전성 | R1/R2 정책·재현 회귀·최소 수정, R3 성능수용/실기기계획 | rate/loop/clipboard 구현 | 감사 승인 | tie/validate/serialize/renderScore, 관련 tests/docs | 66+세그먼트 정확 병합 또는 명시거부; 1000ticks 무근사정책, 원시 저장본 무수정; 전체 회귀/대상 E2E PASS | 모든 음악확장 |
| P3-1 속도 계산 | runtime rate 검증/시간투영/예약계약 | UI·Loop·Scoretempo 변경 | P3-0, 정책 결정 | tone/playback, domain/score/playback 또는 동일경계내순수 함수 | rate 경계·duration/cursor/metronome·타이·일시정지, Score/저장불변 | 속도 UI/A–B |
| P3-2 속도 UI | 최소 rate 선택/preset/진행중변경정책 | 레이아웃전면개편/영속설정 | P3-1 | PlaybackControls/기존 Editor 최소연결 | keyboard/touch/Undo/save/새로고침 100%, E2E·수동청취 | Loop 통합 |
| P3-3 Loop 도메인·예약 | [A,B)검증/clip/wrap/cancel | UI 선택/여러 Part | P3-1/2, loop 정책 | playback 투영/tone adapter | 경계이벤트·타이·속도·N 회 loop deterministic 시험, 잔음 0 | LoopUI |
| P3-4 LoopUI | 마디 A/B·ON/OFF/피드백 | 드래그전면설계 | P3-3 | PlaybackControls/Editor 최소연결 | 실제 브라우저반복/정지/숨김·무저장, 수동오디오 | 선택연결 |
| P3-5 구간선택 | 첫 Part 연속 tick/chainclosed 선택/하이라이트 | 데이터변경/clipboard | P3-0, C-08 결정 | score-editor/StaffView/Editor 로컬 UI | stale 세션/Score 변경/Undo/후보분리, keyboard/mobile 폼 | Copy/Paste |
| P3-6 Copy/Paste | readonlypayload/freshIDs/빈대상원자 Paste | overwrite/밀기/자동마디증가 | P3-5 | domaincommands/application/Editor | 상대 tick/gap/rest/재분할/충돌실패불변/1Undo/OCC | Cut |
| P3-7 Cut | 원자 선택 삭제·clipboard 확정 | partialtie 자동절단 | P3-6 | 같은 commands/application/UI | 성공만 clipboard 교체, 실패 시 Score/이력/clipboard 불변, 1Undo | 종합인수 |
| P3-8 통합 인수 | rate+loop+clipboard+Transpose+labels+save 전체경로 | Phase4/5 선행구현 | P3-2/4/7 | tests/docs, 결함만최소 수정 | 기존 614/55 보존+신규전체 PASS·수동 UAT 기록·잔여 P0/P1 없음 | Phase4 설계 |
| P5 준비 | PDF/표준출력지원 subset·페이지정책문서 | 출력기능구현 | 별도요청 | docs | 승인된 Phase5 명세/테스트전략 | Phase5 |

일정/인일 수치는 측정 근거가 없어 제시하지 않는다. UI 전면개편·모바일디자인시스템·건반배치는 별도 UX 백로그이며
핵심 입력/제어 접근성 결함 수정만 기능 PR 에 최소 포함한다.

## 4. 상태·데이터·저장 설계 가드레일

1. rate/loop/selection/clipboard/preview는 컴포넌트·세션 생명주기에 속한 runtime 또는 읽기 전용 projection이다.
   Score/JSON/DB/revision 필드를 추가하지 않고 새 전역 상태 라이브러리를 도입하지 않는다.
2. 영속 음악 편집은 Command 1회→새 Score→EditSession→기존 autosave로 흐른다.
   Undo는 음악만 복원한다. 연습 속도와 loop를 음악 Undo에 섞지 않는다. stale 범위는 세션 참조로 무효화한다.
3. Clipboard 실패는 Score/past/future/updatedAt/dirty를 보존한다. Cut 성공 확인 전 clipboard를 확정하지 않는다.
   Undo·clipboard 영속화는 이번 범위 밖이다.
4. OCC/Tombstone은 repository의 최종 권위다. 알림/사전 조회/미리보기가 CAS를 대체하지 않는다.
   새 편집이 같은 저장 경로를 통과하는지 repository IO/revision/두 탭 시험으로 확인한다.
5. Score 수정 시 재생 정지·오래된 오디오 요청 무효화를 유지한다. 연습 설정은 승인된 runtime 정책을 따른다.
   미리보기 진입은 정지, 취소는 자동 재개 없음이다. 후보를 재생 엔진이나 Store에 직접 넣지 않는다.
6. PDF/MusicXML 표준 출력과 JSON 백업의 목적·형식을 구분한다. 손상 row를 정상 Score로 위장하지 않는다.

## 5. 테스트·Git·인수 전략

- 계약/순수 시간 함수 → adapter 예약 → UI → E2E → 인수 문서 순으로 작은 커밋을 만든다.
- baseline **614 단위·통합/55 Chromium**을 삭제·skip·기대값 약화하지 않는다. 신규 개수는 실제 실행 결과만 쓴다.
- 단위 시험은 결정적 시계와 Tone 호출 인자로 rate/loop/타이 길이를 검증하며 실제 청취와 구분한다.
  실제 VexFlow 계산/DOM 대역/브라우저 SVG/수동 시각 인수의 증거 범위를 각각 밝힌다.
- Clipboard 성질: 여러 번 Paste해도 ID 유일, Undo는 원본 복구, 실패는 동일 session, gap/tie/Pitch 보존.
  통합에서는 schema2/DB2/JSON/마이그레이션/손상 보호/OCC/Tombstone 회귀를 유지한다.
- 제품 단계마다 `npm run test`, `npm run typecheck`, `npm run lint`, `npm run check:architecture`,
  `npm run build`, `npm run test:e2e`를 실행한다. EPERM은 미실행으로 기록하고 변경을 보존한다.
  Mac 전체 PASS 확인 전 완료 커밋을 보류한다. 재검증 명령은 프로젝트 루트의 `npm run test:e2e`다.
- 문서 단계는 경로/상태/ADR 일치와 diff를 검사한다. 테스트 개수를 맞추기 위한 중복·삭제는 금지한다.
- `git diff --check`, untracked 검토, 명시 경로 stage, staged diff 검사, 로컬 commit 후 clean 확인을 수행한다.
  push/Vercel/DB migration/이력 재작성은 별도 승인 없이 수행하지 않는다.
- 커밋 메시지 예시(제안): `fix(score): preserve long tie durations`,
  `fix(notation): reject unsupported rhythmic approximation`, `feat(playback): add non-destructive practice rate`,
  `feat(playback): add bounded AB looping`, `feat(editor): add contiguous selection`,
  `feat(score): paste phrases atomically`, `feat(score): cut phrases atomically`.
  실제 정책에 맞춰 조정하며 이번 문서 감사에서는 이 기능 커밋들을 생성하지 않는다.

## 6. 구현 전 의사결정과 완료 게이트

- H-01: 64세그먼트는 생성 제한인가 모든 입력의 제한인가? 기존 유효 체인을 자르지 않는 안전한 순회를 권고한다.
  거부 방식은 import 호환성을 바꾸므로 영향 분석/승인이 필요하다. 자동 원본 변환은 금지한다.
- H-02: 정확한 비표기 tick 렌더링, 읽기 전용 지원 불가 오류, 가져오기 거부를 비교한다.
  조용한 근사를 막고 원본을 보존하는 것을 우선하며, 기존 저장본의 읽기 범위 축소는 사전 승인을 받는다.
  tuplet 모델 추가를 우회 수정으로 도입하지 않는다.
- H-03: 기준 기기/최대 Score/브라우저 응답성 수용 조건은 측정 후 결정한다. 임의의 성능 PASS·상한을 공표하지 않는다.
- C-08: 선택/gap/부분 타이/충돌/overwrite/Cut 실패 정책을 승인받은 뒤 MODULE_CONTRACTS에 계약화한다.
- rate/loop의 재생 중 변경·끝 경계·하이라이트 재개 정책을 실행기 구조 기준으로 확정한다.
  Worker/의존성/저장/구조 변경이 필요하면 AGENTS의 승인 절차를 따른다.
- PDF 선행, MusicXML 입력, 다중 Part 확대, UI 전면 개편은 별도 범위 승인 대상이다.
  이번 감사 요청을 구현 승인으로 간주하지 않는다.

Phase 3 완료 조건은 MVP-008/009/006과 경계 정책 구현, 기존+신규 검증 PASS,
무저장 연습 상태/원자 편집 입증, 수동 검증 범위 명시 및 미해결 P0/P1 해소다.
Phase 2/3 완료는 MVP 전체 완료가 아니다. Phase 4/5/6의 허밍·표준 출력·접근성/호환성은 그대로 남는다.
