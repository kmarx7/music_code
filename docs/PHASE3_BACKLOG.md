# Phase 3 실행 백로그

- 기준: main `5d43471`, 2026-11-09. 기본 상태는 **Pending / 제안**이며, H-01의 후속 구현·검증 상태는 해당 항목에 별도로 기록한다.
- 근거: [감사 보고서](PHASE2_ACCEPTANCE_REPORT.md), [마스터 플랜](PHASE3_MASTER_PLAN.md), [현재 작업 기록](TASKS.md).
- 이번에는 구현하지 않는다. 인일·마감일은 근거 없이 추정하지 않는다.

## 1. 의존성과 커밋 단위

```text
H-01 + H-02 + D-01 → P3-01 → P3-02 → P3-03 → P3-04 → P3-05
H-01 + H-02 + D-01 → P3-06 → P3-07 → P3-08 → P3-09
P3-03 + P3-05 + P3-09 + UAT → P3-10
H-03 → 대형 악보의 성능 수용 범위 합의 / 필요 시 별도 개선 작업
```

마스터 플랜의 P3-0은 H-01/02/03 및 D-01, P3-1은 P3-01/02, P3-2는 P3-03에 대응한다.
마스터 플랜 P3-3/4/5/6/7/8은 각각 P3-04/05/06/07·08/09/10이다.
각 작업은 더 작은 계약·함수·adapter·UI 커밋으로 나눌 수 있다. 번호 하나가 대형 PR 하나라는 뜻은 아니다.
H-01/H-02의 결함 수정과 새 기능을 같은 커밋에 섞지 않는다.

## 2. 안전성 및 계약 선행 작업

### H-01 — 긴 타이 체인 보존 (P1 결함)

- 진행 상태(2026-11-09): **H-01 구현 및 자동 검증 완료**.
  유효 체인은 방문 ID로 끝까지 처리하고 오류 ties는 기존 검증으로 거부한다. 생성64한계 유지.
  신규28개 포함 전체642개 PASS. Codex EPERM 이후 사용자가 Mac Chromium55/55 PASS를 확인했다.
  실제 청취/Safari/모바일 실기기 인수는 별도다.
  아래는 원래 계획/수용 기준이며 현재 결과는 TEST_PLAN §30을 참조한다. H-02는 변경하지 않았다.

- 선행: 감사 R1의 재현값 확인. 66세그먼트/65링크를 import가 수락하지만 병합 길이는 63360 대신 62400ticks다.
- 작업: 생성 한계와 읽기 한계를 구분하고, 기존 유효 체인 보존 또는 명시적 거부 대안의 호환성 영향을 검토한다.
  정책 확인 후 회귀 테스트를 먼저 추가하고 최소 수정한다. 권고는 기존 유효 데이터를 잘라내지 않는 안전한 순회다.
- 예상 파일: 기존 `src/domain/score/tie.ts`, 정책상 필요한 경우에만 `validate.ts`/`serialize.ts`,
  `tests/unit/tie-playback.test.ts`, `tests/unit/tie-validation.test.ts`, `tests/integration/transpose-consistency.test.ts`.
- 수용 기준: 63/64/65/66/128세그먼트, cycle/branch/unknown reference를 검사한다.
  지원하는 체인은 끝까지 하나의 지속음으로 처리하고 chainIdsOf/UpdateNote/ResizeNote의 범위도 일치한다.
  거부하는 입력은 명확한 오류이며 원시 row를 보존한다. 자동 분할·삭제·마이그레이션하지 않는다.
- 위험/미결: 기존 import 허용 범위를 축소하면 사전 승인이 필요하다. 무한 순회를 막으면서 길이를 보존해야 한다.
- 완료 증거: 등록된 재현 테스트와 전체 회귀 PASS, 계약 문서. rate/loop/clipboard 구현의 선행 게이트다.

### H-02 — 비표기가능 음가의 조용한 근사 금지 (P1 결함)

- 선행: 감사 R2 진단을 회귀 테스트로 등록한다. 1000ticks import 수락 후 실제 VexFlow 환산값은 960ticks다.
- 작업: 정확한 표시, 읽기 전용 지원 불가 오류, 가져오기 거부 대안을 비교한다.
  기존 저장본을 못 열게 하는 검증 강화는 승인 없이 적용하지 않는다.
- 예상 파일: 기존 `src/adapters/vexflow/renderScore.ts`, 정책상 필요한 `validate.ts`/`serialize.ts`,
  `tests/unit/rest-rendering.test.ts`, `tests/unit/score-validation.test.ts`, `tests/integration/transpose-consistency.test.ts`.
- 수용 기준: 1000/1tick, 정상 음가·점음표·GhostNote를 구분한다. 지원 범위에서 기보/Tone 길이가 일치하고,
  지원 밖은 명확히 안내한다. 더 짧은 음가로 몰래 바꾸지 않으며 원시 row/JSON을 보존한다.
  새 tuplet 모델이나 저장 버전을 우회 도입하지 않는다.
- 위험/미결: 단순 validator 강화는 기존 정상 legacy를 차단할 수 있다. 읽기/오류 UI의 영향도 함께 검토한다.
- 완료 증거: 재현·회귀 PASS와 수용 정책 기록. 모든 음악 기능 확장의 선행 게이트다.

### H-03 — 추천 성능 및 지원 규모 합의 (P1 성능 위험)

- 선행: 감사의 Node 측정 원시값과 재현 스크립트. 약 610ms를 브라우저 PASS로 해석하지 않는다.
- 작업: 동일한 8/64/256마디, 4Part, 타이 다수 fixture로 브라우저 입력 지연·long task·heap·SVG 노드/렌더 시간을 측정한다.
  대표 최대 악보와 기준 기기, 수용 조건을 합의한 뒤 필요한 최적화를 별도 작업으로 승인한다.
- 예상 대상: 비제품 측정 스크립트(신규 예정), tests/docs. 최적화 검토 대상은 range-recommendations/tie/validate다.
- 수용 기준: 각 환경·표본·분산·한계와 좁은 목표 범위/중복 클릭의 영향을 기록한다.
  캐시 키·무효화·메모리 예산을 정의하고 순위나 안전 검증을 약화하지 않는다.
- 위험/미결: 메인 스레드 차단, 저장 타이머 지연, 캐시 오염. Worker 도입은 구조 승인 대상이다.
- 완료 증거: 측정과 수용 조건 합의, 필요 시 분리된 개선 티켓. 측정만으로 최적화 완료 처리하지 않는다.

### D-01 — C-08 및 runtime 정책 확정

- 진행 상태(2026-11-11): **부분 확정**. 사용자가 재생 중 rate 변경(현재 위치 즉시 재예약)과
  C-08 클립보드 제안안을 승인했고 MODULE_CONTRACTS의 D-01 절에 기록했다.
  A–B loop 끝 경계 예약 방식과 loop 설정 유지/초기화 정책은 사용자의 "A–B 반복 진행" 지시에 따라
  구현 기본값으로 정해 MODULE_CONTRACTS "Phase 3 — A–B 반복" 절에 기록했다(개별 명시 승인 항목은 아님).
- 선행: 마스터 플랜 §2·§6의 제안과 실제 코드 확인.
- 산출: `[A,B)` 선택/gap/부분 타이/붙여넣기 충돌·ID/Cut 실패 정책,
  재생 중 rate 변경, loop 끝 경계, pause/resume/hidden 정책. 승인 후 MODULE_CONTRACTS에 반영한다.
- 제안: 첫 Part, 메모리 clipboard, 타이를 자르지 않는 선택, 빈 곳에만 paste, 자동 shift 없음.
  rate/loop는 runtime 소유다. 덮어쓰기·자동 병합·저장 필드 추가는 하지 않는다.
- 수용 기준: 새 모델/DB 필드 없이 실행 가능해야 한다. 구조 변경이 필요하면 ADR 승인을 먼저 받는다.

## 3. 속도 및 반복

### P3-01 — 비파괴 속도 계산 계약

- 진행 상태(2026-11-11): **구현·자동 검증 완료**, 로컬 커밋 `277a0e7`. 결과는 TASKS §7/TEST_PLAN의 P3-01~03 절 참조.
- 선행: H-01/H-02/D-01. 마스터 P3-1의 순수 계산 부분이다.
- 예상: `src/adapters/tone/playback.ts`; 필요 시 `src/domain/score/playback.ts` 또는 동일 경계의 순수 시간 함수(신규 예정).
- 범위: rate 검증, 절대 tick과 초의 변환, 원래 템포와 실효 템포의 구분. UI/loop 제외.
- 수용: 0.25–1.5, 잘못된 rate/NaN/0 거부. 120BPM/50%는 실효60BPM이고 MIDI는 동일하다.
  음표·쉼표·타이·클릭·커서가 같은 시계를 사용한다. Score/JSON/Undo/revision 불변을 검사한다.
- 위험/증거: Score tempo를 바꾸거나 20–400으로 실효 템포를 clamp하지 않는다. 결정적인 시간 테스트와 계약 기록.

### P3-02 — 속도 변경 시 재생 예약 수명

- 진행 상태(2026-11-11): **구현·자동 검증 완료**, 로컬 커밋 `277a0e7`. 승인 정책은 현재 tick 보존 재예약이다.
- 선행: P3-01. 예상: tone/playback.ts의 PlaybackHandle 및 기존 playback/settings/transpose-playback 테스트.
- 범위: running/paused/stopped에서 승인된 rate 정책 적용, 이전 예약·음성 정리. UI 제외.
- 수용: 현재 tick을 보존하는 재예약 또는 승인된 명시적 정지 정책을 검증한다.
  오래된 note-off·늦은 초기화가 새 재생에 간섭하지 않고 Stop은 잔음과 하이라이트를 정리한다.
  타이·점음표·메트로놈·pause/resume·동작 중 변경을 Tone 호출 인자로 검사한다.
- 위험/증거: AudioContext 시간과 look-ahead 혼용, 예약 누적. adapter 테스트 및 전체 회귀 PASS.

### P3-03 — 속도 선택 UI

- 진행 상태(2026-11-11): **구현·자동 검증 완료**, 로컬 커밋 `277a0e7`. 실제 청취/Safari/모바일 실기기는 NOT RUN이다.
- 선행: P3-02. 예상: PlaybackControls.tsx, 필요 시 공개 entry, 관련 E2E(신규 예정).
- 범위: 25–150%, 5% 간격, 100% 기본값과 preset. 전면 UI 개편·설정 영속화 제외.
- 수용: 키보드·터치로 조작하고 메트로놈/미리보기 정지 정책과 공존한다.
  속도 변경만으로 Command/dirty/IDB 쓰기/revision 증가가 없으며 새로고침은 기본값이다.
- 위험/증거: 브라우저 E2E와 실제 청취를 별도 기록한다. 모바일 실기기 미실행은 PASS로 쓰지 않는다.

### P3-04 — A–B 검증 및 예약

- 진행 상태(2026-11-11): **구현·자동 검증 완료**. 실제 청취/Safari/모바일 실기기는 NOT RUN이다.
- 선행: P3-02/03/D-01. 예상: domain/score/playback 또는 같은 경계의 새 projection, tone/playback, 관련 테스트.
- 범위: 첫 Part `[A,B)` 검증·clip·wrap·OFF·취소 수명. UI/다중 Part 제외.
- 수용: A<B, 범위 안. A가 지속음 중간이면 남은 음을 한 번 어택하고 B에서 clip한다.
  B에서 시작하는 이벤트는 이번 반복에서 제외한다. 다회 반복, rate, metronome, pause/resume, Stop의 예약 수/길이가 정확하다.
  Score/ties는 그대로다. 25ms UI 타이머를 오디오 반복 경계 시계로 사용하지 않는다.
- 위험/증거: 중복 어택·잔음·drift. N회 반복의 결정적 예약 시험과 청취 계획을 갖춘다.

### P3-05 — A–B UI

- 진행 상태(2026-11-11): **구현·자동 검증 완료**. 실제 청취/Safari/모바일 실기기는 NOT RUN이다.
- 선행: P3-04. 예상: PlaybackControls와 Editor 최소 연결, E2E.
- 범위: 마디 A/B 입력, ON/OFF, 유효성 피드백. 드래그·여러 loop·영속화 제외.
- 수용: 마디→tick이 정확하고 잘못된 범위를 거부한다. 편집/Undo/Transpose 후 stale 범위를 승인 정책대로 초기화한다.
  hidden/Stop에서 정리하고 저장 상태를 바꾸지 않는다. 실제 반복·정지와 청취를 검증한다.
- 위험/증거: 범위 선택 상태와 실제 예약 범위의 불일치. E2E/단위/수동 증거를 나눠 기록한다.

## 4. 선택 및 클립보드

### P3-06 — 연속 구간 선택 projection

- 진행 상태(2026-11-12): **구현·자동 검증 완료**(로컬 커밋 `f869d78`). Safari/모바일 실기기/스크린리더는 NOT RUN이다.
  UI 입력은 마디 단위로 구현했다(박 단위는 도메인 `selectScoreRange`만 지원).
- 선행: H-01/H-02/D-01. 예상: score-editor 선택 UI(신규 예정), Editor 로컬 상태, StaffView 최소 연결.
- 범위: 첫 Part의 마디/시간 범위 선택과 하이라이트. 데이터 편집/clipboard 제외.
- 수용: gap/rest/전체 타이 체인 포함, 부분 타이는 거부한다. 원본 event ID와 후보 DOM을 분리한다.
  편집/Undo/다른 문서 열기에서 stale 선택을 무효화하고 키보드/폼으로 조작 가능하다.
- 위험/증거: selectedEventId와 범위 선택 우선순위. 별도 Undo/전역 Store 없이 무쓰기 테스트 및 E2E.

### P3-07 — 읽기 전용 Copy와 원자 Paste 엔진

- 진행 상태(2026-11-12): **엔진 구현·자동 검증 완료**(미커밋). UI·저장 통합은 P3-08에 남아 있다.
- 선행: P3-06. 예상: domain/commands/types.ts·apply.ts, application의 copy/paste 계획 함수(신규 예정), 관련 테스트.
- 범위: 상대 tick/쉼표/gap/타이 정보를 읽기 전용 payload로 만들고 빈 대상에 단일 Paste Command 적용.
  overwrite·shift·자동 마디 증가·시스템 clipboard 제외.
- 수용: Pitch 철자/MIDI/velocity/provenance 보존, fresh event ID와 tie 참조 매핑, 여러 번 paste해도 ID 유일.
  마디 부족/충돌/표기 실패는 부분 적용 없이 거부하고 Score/past/future/updatedAt을 유지한다.
  성공은 한 Undo/Redo이며 기존 split/validate를 재사용한다.
- 위험/증거: store.dispatch 반복으로 원자성을 흉내 내지 않는다. 단위·property 성격 시험과 기존 회귀 PASS.

### P3-08 — Copy/Paste UI 및 저장 통합

- 선행: P3-07. 예상: Editor/score-editor 최소 제어, E2E/integration 테스트(신규 예정).
- 범위: 현재 선택 복사와 기존 편집 커서에 붙여넣기. 문서 간 paste는 초기 제외 제안이다.
- 수용: Copy는 무쓰기, Paste 성공은 기존 autosave만 이용한다. Undo/Redo/저장/재열기/JSON이 일치한다.
  stale 선택 차단, 두 탭 OCC 및 삭제 Tombstone 보호, 명확한 오류를 검증한다.
- 위험/증거: revision을 UI에서 임의 증가시키거나 별도 저장 경로를 만들지 않는다. 실제 IndexedDB E2E 포함.

### P3-09 — 원자 Cut

- 선행: P3-08. 예상: 같은 Command/application/UI와 단위·통합·E2E.
- 범위: 타이가 닫힌 선택의 삭제와 clipboard 교체. 자동 tie 절단·뒤 이벤트 당기기 제외.
- 수용: 성공한 경우에만 clipboard를 교체한다. 실패는 이전 clipboard/Score/이력 그대로다.
  gap을 보존하고 dangling tie가 없으며 Undo 한 번으로 복원한다.
- 위험/증거: DeleteEvent 여러 번 dispatch 금지. 후보 전체 검증 후 한 결과를 적용하는 실패/성공 시험.

## 5. 통합 및 수동 인수

### P3-10 — Phase 3 통합 인수

- 선행: P3-03/P3-05/P3-09 및 아래 UAT. 예상: tests/docs, 재현된 결함만 최소 수정.
- 수용: transpose→labels→range→copy/paste→rate/loop→save/reopen/JSON 흐름 일치.
  실패/no-op/Undo/OCC/삭제/손상 보호와 기존 614/55 assertion을 유지하고 신규 테스트를 실제 실행한다.
  미해결 P0/P1 해소 전 인수 완료 금지. Phase4/5 기능을 선행 구현하지 않는다.

| 수동 작업 | 실행 범위 | 증거/수용 기준 |
|---|---|---|
| UAT-C | 감사 M-01~09, Mac Chrome | 실행자/OS/브라우저/커밋/Score/원시 row/캡처 기록 |
| UAT-S | 동일 흐름, Mac Safari 별도 실행 | Chromium PASS를 복사하지 않고 별도 결과 기록 |
| UAT-A | 감사 A-01~05 + 새 rate/loop 경계 | 기준 음높이·기기·볼륨·튜닝·녹취/관찰 기록 |
| UAT-T | 감사 T-01~04, 실제 iPhone Safari/Android Chrome | 세로/가로, 스크롤/터치·가독성·저장·오디오 활성화 |
| UAT-R | 직접 URL/뒤로가기/새로고침/hidden/강제 종료 | 마지막 커밋과 메모리를 구분. 새 시험 ID/사전 백업, 복구 저널·DB 삭제 없음 |

모든 수동 항목은 현재 **NOT RUN**이다. 상세 절차·기대값·실패 양식은 감사 §7을 재사용한다.
모바일 디자인 시스템·악보 중심 레이아웃·건반 재배치·전체 UI 개편은 독립 UX 작업으로 분리한다.

## 6. 별도 후속 트랙

| ID | 범위 | 선행/완료 기준 | 경계·위험 |
|---|---|---|---|
| P5-PRINT-PLAN | 인쇄/PDF | Phase5 요청 또는 순서 변경 승인, 출력 subset/페이지·폰트 정책 | 읽기 전용 view, title/meter/key/tempo·A4·행간 타이. 화면 SVG 복사만으로 완료하지 않음 |
| P5-XML-OUT | MusicXML 출력 | Phase5, 지원 단선율·ties·divisions·철자·미지원 거부, 독립 reader 검증 | 새 export adapter 예정, Score/DB 변경 없음 |
| X-XML-IN | MusicXML 입력 | 추가 범위 승인, parser 안전·제한·새 ID 생성 정책 | voice/tuplet/중간 meter를 조용히 버리지 않음. 필요 모델 변경은 ADR 승인 |
| P4-AUDIO | 허밍·채보 | Phase4, mic/short mono/동의된 데이터셋/F1 게이트 확정 | capture→DSP→onset→quantize→후보→원자 확정, 별도 port/thread 검토 |
| X-MULTIPART | 다중 Part 기보·재생 | 확장 승인, 파트 mix/선택 정체성/시스템 정렬 | 모델의 복수 Part 지원과 현재 UI/재생 미지원을 구분. chord 모델은 추가 검토 |

MIDI 출력도 PRD MVP-014/Phase5에 그대로 남는다. 이번 후보 목록에서 상세 분석을 요청하지 않았다고 삭제하지 않는다.

## 7. 검증·Git 규칙

- 시작 시 pwd/status/log, AGENTS와 실제 계약을 확인하고 사용자 변경을 보존한다.
- 제품 변경은 신규 targeted→전체 test/typecheck/lint/architecture/build/Chromium 순으로 검증한다.
  환경 EPERM은 미실행으로 기록하며 변경을 보존하고 Mac 전체 검증 전 완료 커밋을 보류한다.
- Score·Undo·timestamp·revision·원시 row의 검증 범위를 구분한다. 무쓰기 runtime에는 repository spy/row/Store 알림 검사를 둔다.
- diff/untracked/cached --check, 명시 경로 stage, 논리적 로컬 commit, clean 확인을 거친다.
  GitHub push/Vercel/DB migration/이력 강제 변경은 금지한다.
- 이번에는 문서 커밋만 만들며 Pending 항목을 Done으로 바꾸지 않는다.
