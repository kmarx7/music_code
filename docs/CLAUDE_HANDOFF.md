# Music Score Platform — Claude Code 상세 인수인계

- 작성: 2026-11-11. 이 파일 작성 전 저장소·문서·소스·Git을 직접 확인했다.
- 대상: Codex 사용량 제한으로 같은 프로젝트를 Claude Code에서 이어서 개발할 사용자와 에이전트.
- 인계 범위: 현재 디스크에 있는 구현과 기록 전체의 탐색 지도. 접근할 수 없는 과거 대화의 구두 합의는 추정하지 않는다.
- 이번 작업은 문서 작성이다. 제품 기능·의존성·모델·DB·배포를 변경하지 않는다.

## 1. 가장 먼저 알아야 할 현재 상태

**Phase 1 기반과 Phase 2 음악 기능, H-01 긴 타이 및 H-02 정확 음가 보완까지 구현되어 있다. Phase 3 기능 구현은 아직 시작하지 않았다.**
MVP 전체가 끝난 상태는 아니다. 허밍/채보, 연습 속도/A–B/클립보드, PDF/MIDI/MusicXML, 최종 호환성 인수가 남아 있다.

| 항목 | 인계 시 확인값 |
|---|---|
| 로컬 폴더 | `/Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code` |
| 브랜치 / HEAD | `main` / `e69ab20` (`fix(notation): preserve exact durations in score rendering`) |
| 문서 작성 전 작업 트리 | clean, 미커밋 제품 변경 없음 |
| upstream | `origin/main`보다 로컬 15커밋 ahead (`git fetch` 없이 로컬 추적 참조 기준) |
| origin | `https://github.com/kmarx7/music_code.git` |
| 현재 Node / npm | `v22.22.3` / `10.9.8` (관측값, 최소 버전 보장 아님) |
| 의존성 | 기존 `node_modules`, `package-lock.json` 존재 |
| 실행 포트 | 3010 |

**같은 로컬 폴더를 Claude Code에서 열어야 최신 구현이 그대로 보인다.** GitHub에서 새로 clone하면 push되지 않은 15커밋과 이번 인계 문서가 빠질 수 있다.
이번에는 fetch/push/commit/deploy를 수행하지 않았다. 복제·장비 이전이 필요하면 별도 승인된 전달 절차를 사용한다.
브라우저 IndexedDB 악보는 프로젝트 폴더나 Git에 포함되지 않는다. 다른 origin/브라우저/장비로 옮길 때는 기존 JSON 백업 기능을 사용한다.

최근 주요 커밋(최신순):

| 커밋 | 내용 |
|---|---|
| `e69ab20` | H-02 정확 음가 기보·오류/복구·포인터 및 회귀 테스트 |
| `a4d9a47` | H-02 정책 문서 |
| `2d7c776` | H-01 긴 타이 전체 길이 보존 |
| `ccf73a7` | Phase 2 인수 감사 및 Phase 3 계획 |
| `5d43471` | 음역 분석/조옮김 추천 |
| `cbac282` | 음이름/고정도법 라벨 |
| `1437418` | 조옮김 기보·재생·저장 정합성 검증 |
| `45c15f8` | 안전한 조옮김 미리보기/확정 |
| `848b7c8` | 조옮김 Command/Undo/Redo |
| `1c74de4` | 조옮김 순수 도메인 엔진 |
| `c24bc0a` | 저장 revision/OCC/Tombstone |

## 2. 문서 지도와 읽는 순서

| 문서 | 역할 / 읽는 법 |
|---|---|
| [AGENTS](../AGENTS.md) | 작업 절차, 재사용, 구조 변경 승인, 한국어 보고, 커밋·배포 제한 |
| [PRD](PRD.md) | 확정 MVP 14기능, 수용 기준, Phase 0–6, 범위 밖 기능 |
| [ARCHITECTURE](ARCHITECTURE.md) | 모듈형 모놀리스·레이어·상태 소유권 |
| [DECISIONS](DECISIONS.md) | ADR-001~010; 특히 004 연습 상태, 009 타이, 010 저장 보호 |
| [DATA_MODEL](DATA_MODEL.md) | Score v2/960 PPQ/타이/직렬화/마이그레이션 |
| [MODULE_CONTRACTS](MODULE_CONTRACTS.md) | 공개 API/Command/기능 계약. 후반 ADR-010 및 H-01/H-02 절이 중요 |
| [TASKS](TASKS.md) | 시간순 개발 기록. §4.38 및 인계 추가 절을 먼저 확인 |
| [TEST_PLAN](TEST_PLAN.md) | 테스트 범위·실행 기록. 마지막 H-02 최종 사용자 Mac 인수 절 확인 |
| [PHASE_0_PLAN](PHASE_0_PLAN.md) | 초기 기반 설계·미정 항목의 역사 |
| [PHASE2_ACCEPTANCE_REPORT](PHASE2_ACCEPTANCE_REPORT.md) | 당시 결함 재현/성능 진단/수동 인수 체크리스트 |
| [H02_DURATION_POLICY](H02_DURATION_POLICY.md) | 조사/승인 정책/정확 렌더 구현. §11~14는 후속 결과 |
| [PHASE3_MASTER_PLAN](PHASE3_MASTER_PLAN.md) | 다음 단계 제안. 구현 계약으로 오해 금지 |
| [PHASE3_BACKLOG](PHASE3_BACKLOG.md) | H-03/D-01/P3-01~10 의존성·수용 기준 |

### 문서 시점 차이와 알려진 불일치

- TASKS §2의 642/55, TEST_PLAN 상단의 507/41, 마스터 플랜의 614/55는 각 시점 기준이다. 최신 제품 기준은 **706 단위·통합 / 57 Chromium**이다.
- TASKS 등의 과거 `index.lock`/`sandbox_approval:false`/커밋 보류는 당시 환경 기록이다. 실제 Git에 H-01/H-02 커밋이 존재하므로 현재 미커밋으로 처리하지 않는다.
- Phase 3 백로그 H-02 본문과 초기 감사의 R1/R2는 수정 전 계획/재현이다. H-01/H-02를 새로 구현하거나 되돌리지 않는다.
- DATA_MODEL의 단일 음가 설명은 생성/기존 편집 정책과 넓은 기존 저장본 읽기를 구분해야 한다. 현재 validator/import는 1000tick 같은 양의 정수 길이를 수락할 수 있다. H-02는 읽기 범위를 줄이지 않고 렌더 projection에서 명시적으로 실패한다.
- ARCHITECTURE 표에는 Tailwind와 Zod 또는 동등 검증이 언급되지만 실제 package.json에는 두 패키지가 없다. 현재는 CSS/인라인 스타일과 직접 검증이다. 문서와 맞춘다는 이유로 자동 설치하지 않는다.
- 초기 계약의 `Repository 인터페이스만`, `save` 이전 설명은 역사다. **ADR-010 현재 저장 계약과 실제 ports.ts**를 따른다.
- 수동 인수 NOT RUN은 자동 테스트 PASS와 동시에 성립한다. 인수 감사 전체를 무조건 완료로 바꾸지 않는다.

## 3. 제품 범위와 구현 현황

로그인 없는 local-first 단선율 악보 앱이다. 피아노 또는 짧은 허밍으로 입력하고 편집·조옮김·학습·저장·표준 출력하는 것이 최종 목표다.

| MVP | 구현 상태와 남은 점 |
|---|---|
| 001 가상 피아노 | 88건반 A0–C8, pointer/touch, 컴퓨터 키, 입력 소리 ON/OFF, 끝/커서 입력 구현. 실제 기기 오디오/접근성 인수 별도 |
| 002 녹음 | 미구현. `/record` 라우트도 없음 |
| 003 채보 | 미구현. provenance/confidence 필드가 존재하는 것은 채보 엔진 완성을 의미하지 않음 |
| 004 기보 | VexFlow 오선·조표·박자·음표/쉼표·점·타이·선택·라벨·기보 오류/복구 구현. 첫 Part만 표시 |
| 005 편집 | 음표 pitch/길이/삭제, 쉼표 길이/위치/삭제, 마디 추가, 제목·템포·조표·빈 악보 박자, Undo/Redo 구현 |
| 006 선택/클립보드 | 단일 이벤트 선택만 있음. 연속 범위 copy/cut/paste 미구현 |
| 007 조옮김 | 전체 Part 순수 엔진, 반음/목표 조성, 미리보기·취소·확정·Undo/Redo·stale 보호 구현 |
| 008 연습 속도 | 미구현. Score 원래 템포 변경과 구별할 것 |
| 009 A–B | 미구현 |
| 010 라벨 | none/letter/fixed-do, Unicode 임시표, 타이 머리/첫 fragment, 미리보기 연동 구현 |
| 011 음역/추천 | 전체/Part별 min/max/span, 사용자 MIDI 목표, 기존 조옮김 엔진 기반 추천·초과 설명 구현. 대형 브라우저 성능 미인수 |
| 012 재생 | 시작/일시정지/재개/정지·커서/하이라이트·메트로놈 구현. 첫 Part만 재생. 편집 커서부터 최초 재생/rate/loop 미구현 |
| 013 악보함 | 생성/목록/열기/삭제·제목·자동/수동 저장·JSON 백업/새 ID 가져오기·동시성/손상 보호 구현. 강제 종료 무손실 보장 없음 |
| 014 표준 출력 | PDF/MIDI/MusicXML 모두 미구현. JSON 백업은 이 기능의 대체물이 아님 |

실제 라우트는 `/`, `/library`, `/editor/[scoreId]`다. 홈/편집기 UI는 최종 PRD 화면 전체를 완성한 상태가 아니다.
MVP에서 제외된 인증/클라우드 동기화, 다성 채보, MP3/WAV 입력, 상용곡 분리, 피아노롤, 결제, 정간보/가야금 기법은 추가하지 않는다.

## 4. 구현 파일과 재사용 지점

| 위치 | 현재 책임 |
|---|---|
| `src/domain/score/types.ts` | 유일한 Score/Part/Measure/NoteEvent/RestEvent/Pitch/TieLink 정의 |
| `score/create.ts`, `constants.ts`, `validate.ts`, `serialize.ts` | 생성·시간·불변식·JSON·v1→v2 읽기 |
| `score/tie.ts` | 음표 마디 분할, 체인 순회/병합, 기존 생성 제한 |
| `score/notation.ts` | H-02 정확 음가 분해/읽기 전용 Part 렌더 계획 |
| `score/playback.ts` | 종료 tick/마디·박·activeNoteIds 읽기 전용 투영 |
| `score/transpose.ts`, `range.ts`, `range-recommendations.ts` | 전체 Score 조옮김·음역·추천 |
| `domain/music-theory/*` | pitch/spelling, 조표 목록, 음정, Unicode 라벨 |
| `domain/commands/types.ts`, `apply.ts` | EditCommand union와 순수 적용·검증 |
| `application/edit-session.ts` | immutable snapshot Undo/Redo |
| `application/append-note.ts` | 끝/지정 tick 입력 계획 및 마디·박→tick |
| `application/score-library.ts`, `ports.ts` | 악보 생성/열기/백업·가져오기와 repository 계약 |
| `store/score-store.ts`, `useScoreStore.ts` | 단일 편집 세션 store + useSyncExternalStore 바인딩 |
| `adapters/indexeddb/scoreRepository.ts` | DB2 transaction/CAS/revision/Tombstone/알림 |
| `features/score-library/useAutosave.ts`, `SaveButton.tsx` | 직렬 자동 저장·flush·revision·저장 상태·이탈 보호 |
| `adapters/tone/playback.ts` | `playScore`와 PlaybackHandle; Phase 3 시간축 확장의 기존 지점 |
| `adapters/tone/pianoPreview.ts` | 입력 소리 전용 음성 수명. 전체 재생과 구별 |
| `features/playback/PlaybackControls.tsx`, `highlight.ts` | 로컬 재생 상태·늦은 초기화 취소·원본 DOM 하이라이트 |
| `adapters/vexflow/renderScore.ts` | 실제 VexFlow/strict Voice/Dot/가상·정본 타이/비동기 렌더 취소 |
| `features/score-editor/StaffView.tsx` | 기보/오류 UI·원본 ID 선택 위임·후보 읽기 전용 |
| `features/transposition/*` | 세션/revision 안전 미리보기 및 음역 추천 UI |
| `app/editor/[scoreId]/page.tsx` | 로드 성공 전 차단, 편집기 조립, 로컬 UI 상태 |
| `app/library/page.tsx`, `adapters/file-export/json.ts` | 악보함 및 JSON 파일 다운로드 |
| `.dependency-cruiser.cjs`, `scripts/check-boundaries.mjs` | 레이어/순환/private import/Domain 전역/중복 정본 타입 검사 |

다른 feature는 `features/<name>/index.ts` 공개 진입점으로 접근한다. 현재 존재하지 않는 practice/selection/export 디렉터리를 이미 구현된 모듈로 가정하지 않는다.

### 음악·편집 불변식

- 960 PPQ, 위치는 Score 시작부터 절대 정수 tick. 4/4 한 마디=3840, 6/8=2880.
- 개별 이벤트는 자기 마디 안에 들어가며 단선율 note/rest 중첩 금지. 마디를 넘는 음은 NoteEvent 분할+`Part.ties`.
- Pitch는 MIDI와 step/alter/octave를 함께 보존. MIDI 0–127 외 octave 0–9/alter -2–2/철자 일치 검증이 있다.
- 설정 조표 변경은 기존 Pitch/MIDI를 보존한다. 조옮김과 같은 기능이 아니다. 장↔단조 조옮김은 미지원.
- 박자 변경은 모든 Part가 빈 악보일 때만 허용. 쉼표 편집은 자동 밀기/분할/마디 추가를 하지 않는다.
- 순수 Command는 시간/랜덤/IO를 직접 생성하지 않는다. 필요한 ID/시각은 기존 계약대로 경계에서 주입한다.
- 실패는 Score/세션/이력 보존. TransposeScore 의미적 no-op은 동일 Score/세션/무알림/무저장이다.
- 편집 경로: UI → 입력 계획/Command → `scoreStore.dispatch` → `applyCommand` → `applyEditCommand` → 새 Score → 기존 autosave.
- 기보/라벨/추천은 read-only projection. 후보 Score를 `store.init`하거나 DB에 쓰지 않는다.

### 저장 안전성 — 반드시 유지

- DB `music-score-platform`, version 2, object store `scores`. 음악 schemaVersion(현재 3)과 독립이다.
- `read(id)` → `{score,revision}|null`; null은 실제 부재만 의미한다. `load`는 읽기 전용 호환 투영.
- `create(score)`는 absent ID에 revision1. `save(score,expectedRevision)`/`delete(id,expectedRevision)`는 CAS 필수.
- 검증·revision 비교·쓰기 모두 같은 readwrite transaction. 성공은 request 성공이 아니라 transaction.oncomplete다.
- 삭제는 영속 Tombstone. 삭제 ID 재사용/자동 만료/DB 삭제/구버전 다운그레이드 금지.
- revision은 Score/JSON/Undo에 넣지 않는다. legacy revision 없음은0, 읽기만으로 row 재작성 금지.
- 손상·미지원·읽기 실패를 빈 악보로 바꾸거나 자동 저장하지 않는다. 원시 row를 보존한다.
- BroadcastChannel은 힌트다. 수신 후 DB 재확인하며 CAS를 대체하지 않는다.
- useAutosave가 baseline revision과 `idle|saving|saved|error|conflict|deleted` 단일 소유. 기본400ms debounce와 쓰기 직렬화.
- conflict/deleted는 후속 저장 차단·메모리/Undo 유지. JSON 백업/새 ID 저장/확인 후 최신본 열기만 제공한다.
- 내부 링크 이동은 flush 성공 후 진행. beforeunload/hidden/focus 보완은 강제 종료 복구 저널이 아니다.

## 5. 최근 보완 H-01/H-02 — 재개 시 회귀 금지

### H-01: 긴 타이 끝부분 누락 해결

이전에는 JSON이 66세그먼트를 허용해도 병합 순회64한계로 63360→62400ticks가 됐다.
현재 `chainIdsOf`/`mergeTiedNotes`는 기존 `findTieIssues`로 참조/분기/순환/연속성/Pitch를 검증하고 방문 ID로 끝까지 처리한다.
**64는 한 번의 생성/재분할 제한이며 정상 저장본의 읽기 제한이 아니다.** 66/67/128체인도 처리한다.
66×960=63360ticks, 120BPM33초, 단일 어택 유지. 오류 타이를 부분 체인으로 숨기지 않는다.
`long-tie.test.ts`, `playback.test.ts`, `transpose-consistency.test.ts` 등이 회귀를 보호한다.

### H-02: 기보 음가 근사 제거

이전 fallback은 1000tick을960, 1tick을120으로 그렸다. 현재는 원본을 보존하고 정확한 렌더 projection만 생성한다.

- `decomposeNotationDuration`은 기존18음가의 정확 합을 DP로 계산한다. 최소 fragment 수, 동률 긴 음가 우선.
- 300=180+120, 960=단일 음가. 1000/1/150은 표현 불가로 안내한다. 원래 tick을 반올림하지 않는다.
- 렌더 한계: 이벤트64 fragments/430080ticks, Part1024마디/4096 tickables(GhostNote 포함). 저장/import 제한으로 전용 금지.
- note 조각은 렌더 전용 타이로 연결, rest 조각은 타이 없음. canonical tie는 이벤트의 양끝 fragment 연결.
- 공백은 정확 rational GhostNote, 비어 있지 않은 strict Voice 전체 길이를 마디와 일치시킨다.
- fragment 모두 원본 `data-event-id`. 첫 fragment만 라벨. 원본 이벤트 선택·전체 fragment 하이라이트 유지.
- 표현 불가는 첫 Part 전체 SVG 제거+`NotationRenderError`/StaffView 안내. 오래된 비동기 draw/부분 SVG 재등장 금지.
- 기보 불가 후보의 UI 확정만 차단한다. 원래 Score의 재생/정상 저장/JSON 백업을 차단하지 않는다.
- Tone의 일반음 gate0.9/타이gate1/최소1ms는 기존 정책이다. 렌더 길이와 오디오 gate를 혼동하지 않는다.

VexFlow5 E2E 주의: 점은 `.vf-dot` wrapper가 아니라 `.vf-notehead text`의 **U+E1E7**다.
투명 `pointerRect`는 정상 이벤트 선택 영역이다. notehead 형제 rect를 비활성화하거나 force click하지 않는다.
현재 테스트는 원본 ID/fragment 그룹 일반 click/tap과 elementFromPoint를 사용한다.
원본 그룹의 `pointer-events=visiblePainted`, 라벨 포인터 비간섭, `closest('[data-event-id]')` 선택 위임을 보존한다.

## 6. 검증 상태와 실행 방법

### 이번 인수인계 세션의 직접 재실행

| 명령 | 결과 |
|---|---|
| `npm run test` | PASS, **45파일/706개**, exit0 |
| `npm run typecheck` | PASS, exit0 |
| `npm run lint` | PASS, exit0 |
| `npm run check:architecture` | PASS, **63모듈/192의존성, 경계56파일 위반0** |
| `npm run build` | PASS, exit0, Next.js 프로덕션 빌드 및 기존 라우트 생성 성공 |

과거 문서의 아키텍처62/186/55는 H-02 이전 값이며 이번 실측과 구별한다.
이번 문서 작성에서 E2E/청취/실기기 검사는 다시 실행하지 않았다.

### 기존 최종 제품 검증 기록

- H-02 최종: 706/706, typecheck/lint/architecture/build PASS 기록.
- **사용자가 Mac Chromium 전체57/57 PASS를 직접 확인했다는 저장소 기록**이 있다(TEST_PLAN 마지막 H-02 인수, TASKS §4.38).
- 이는 이번 세션에서 브라우저57개를 재실행한 결과가 아니다. 이전 Codex `listen EPERM 0.0.0.0:3010`은 실행 차단 기록이다.
- Safari/WebKit/Firefox, 실제 오디오 청취, iPhone/Android 실기기, 전체 SVG 육안 인수, 대형 브라우저 성능은 미검증/별도 인수.
- 실제 VexFlow tick/Dot/Formatter를 쓰는 Node 테스트도 DOM drawing은 대역이며 Tone 호출 검사는 스피커 청취가 아니다.
- fake-indexeddb 통합 검증은 사용자 실데이터 검사와 다르다. 모바일 hasTouch 에뮬레이션도 실기기 검증이 아니다.

### 로컬 실행

프로젝트 루트에서 기존 의존성을 사용한다. 새 환경에서 설치가 필요하면 lockfile을 보존하는 `npm ci`를 사용하되,
네트워크/권한 실패를 명시하고 임의 업그레이드하지 않는다. 현재 기능에는 API 키·외부 backend가 필요 없다.

```bash
cd /Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code
git status -sb
git log -8 --oneline
npm run dev
```

브라우저 `http://localhost:3010`에서 악보함→새 악보→피아노 입력→편집/Undo/Redo→재생→저장/재열기를 확인한다.
키 매핑은 `a/w/s/e/d/f/t/g/y/h/u/j` = C/C♯/D/D♯/E/F/F♯/G/G♯/A/A♯/B, 기본4옥타브다.

제품 변경 후 검증:

```bash
npm run typecheck
npm run lint
npm run test
npm run check:architecture
npm run build
npm run test:e2e
git diff --check
```

Playwright는 Chromium1프로젝트/workers1이며 기본 `npm run build && npm run start`를 사용한다.
`reuseExistingServer: !CI`이므로 3010에 기존 dev 서버가 있으면 그것을 재사용할 수 있다.
검증 대상 서버/빌드를 확인하고 다른 사용자 프로세스를 임의 종료하지 않는다. 실패 trace는 retain-on-failure.
과거 trace를 보존할 필요가 있으면 별도 output 경로를 사용한다. 임시 `/tmp` trace의 현재 존재를 가정하지 않는다.
listen EPERM은 제품 assertion 실패와 구별하여 미실행으로 기록하고 실행 가능한 Mac 터미널에서 재검증한다.

## 7. 다음 작업 — 권고 순서와 미확정 정책

**첫 구현 작업에 앞서 H-03/D-01 상태와 새 사용자 요청을 확인한다.** 이번 인계 요청만으로 Phase3 전체 구현/커밋/배포를 승인받은 것은 아니다.

| 순서 / ID | 할 일 | 완료 기준 / 경계 |
|---|---|---|
| 상태 정리 | 현재 HEAD와 H-01/H-02 완료 확인 | 과거 보류를 재개할 필요 없음, 문서 상태를 실제 Git과 대조 |
| H-03 | 대형 추천 브라우저 성능·지원 규모 측정/합의 | 8/64/256마디·복수Part·타이 fixture, 입력 지연/long task/메모리/렌더 측정. Node 약610ms만으로 PASS 금지 |
| D-01 | C-08 및 runtime 정책 확정 | 제안/확정 구분, 관련 MODULE_CONTRACTS 기록. 구조 변경이면 ADR 승인 선행 |
| P3-01 | 비파괴 rate 계산 | 0.25–1.5, 5% UI 단계, tick/초/실효템포; 120BPM50%=60, Score 불변 |
| P3-02 | rate 변경 예약 수명 | running/paused/stopped 정책, 현재 tick/잔여음/이전 예약/늦은 초기화 정리 |
| P3-03 | rate UI | 25–150%, 기본100%, presets, 무Command/무저장/무revision 증가 |
| P3-04 | A–B 검증·예약 | 첫 Part `[A,B)`, B 제외/교차음clip/A 중간음1어택, rate·메트로놈·pause·Stop 정합성 |
| P3-05 | A–B UI | 마디 입력/ON/OFF/오류·stale 범위 정책, 무저장 |
| P3-06 | 연속 선택 | 첫 Part 시간/마디 범위, 타이/gap/rest/stale 선택, 원본·후보 DOM 분리 |
| P3-07 | Copy/Paste 엔진 | 읽기 전용 상대tick payload, fresh ID/tie 매핑, 단일 원자 Command/Undo |
| P3-08 | Copy/Paste UI·저장 | 기존 입력 커서/자동 저장·OCC·삭제 보호와 통합 |
| P3-09 | Cut | 성공 시에만 clipboard 교체, 실패 시 Score/clipboard/이력 불변 |
| P3-10 | 통합/수동 인수 | 기존706/57 보호+신규 실제 검증, 미해결 P0/P1와 수동 범위 명시 |

백로그의 P3-번호를 기준으로 하고 마스터 플랜의 다른 단계 번호와 혼동하지 않는다.
권고 clipboard 정책은 **첫 Part/동일 문서/메모리 clipboard/전체 타이만/빈 대상에 paste/자동 shift·overwrite·마디 증가 없음**이다.
이는 아직 **제안**이다. C-08 선택/gap/부분타이/충돌/Cut 실패 정책을 구현 전에 확정해야 한다.
rate 변경은 현재 tick에서 재예약 또는 명시적 정지 적용을 비교해야 한다. loop 변경·hidden·Stop·편집 시 설정 유지/초기화도 확정한다.
25ms UI 알림 타이머를 오디오 loop 경계 시계로 사용하지 않는다. 새 전역 AudioContext/새 재생 엔진 도입으로 우회하지 않는다.

## 8. Phase 4–6의 남은 전체 MVP

- **Phase 4 허밍:** 명시적 mic 동의/권한·장치 오류·중단, local audio capture, 무음/노이즈/신뢰도,
  pitch smoothing/옥타브 오류, onset/offset·동음 반복 분리, 설정 tempo/meter quantization, 후보 검토 후 원자 Command 확정.
  `AudioTranscriptionPort`는 현재 미정의다. 기존 생성/타이/Command를 재사용하고 raw audio는 기본 메모리, 자동 업로드 금지.
  C-09 데이터셋·품질 게이트 확정 필요. note F1≥0.90은 제안 목표이며 달성 수치가 아니다. 합성/허가된 fixture를 사용한다.
- **Phase 5 출력:** PDF 인쇄 페이지·폰트/다중행·페이지 경계 타이, MIDI 원래 tempo/pitch/tick,
  MusicXML key/meter/spelling/ties 지원 subset을 정하고 독립 도구로 검사한다. H-02의 기보 불가 tick을 조용히 축약하지 않는다.
  미지원 출력은 명확한 오류, 파일명/다운로드/호환성 검사 필요. MusicXML 입력은 확정 MVP 밖이다.
- **Phase 6 인수:** 전체 흐름·오류/복구·접근성/키보드·mobile Safari/Chrome·desktop Safari/Chrome,
  개인정보/오디오 로컬 처리·배포 준비·라이선스/필요 페이지·회귀/베타 검증. 배포는 별도 사용자 승인 후 수행한다.
- 감사 §7의 M/A/T/R 수동 체크리스트를 재사용해 실행자/기기/브라우저/커밋/fixture/관측값과 증거를 남긴다.

## 9. Claude의 매 작업 절차와 사용자 보고

1. `pwd`, `git status -sb`, 현재 HEAD, 필수 문서와 해당 코드/테스트를 읽는다.
2. `rg`로 유사 구현을 찾고 재사용 모듈·수정 파일·계약 영향·검증 기준을 한국어로 설명한다.
3. 현재 사용자 요청 범위의 최소 변경을 한다. 구조 승인 대상만 멈추고 구체 변경안을 제시한다.
4. targeted→전체 검증. 실패/미실행/대역의 한계를 정확히 기록한다.
5. TASKS/TEST_PLAN/계약을 필요에 맞게 갱신한다. 문서 계획을 제품 완료로 바꾸지 않는다.
6. 작업 ID·변경 내용/파일·재사용·실행 명령 결과·아키텍처 이탈 여부·남은 문제/다음 작업을 한국어로 보고한다.
7. 사용자의 현재 승인 없이 stage/commit/push/deploy/DB 변경·삭제를 진행하지 않는다.

이 인계는 코드를 바꿀 필요 없이 Claude가 현재 상태를 확인하고 후속 요청을 수행하게 하기 위한 것이다.
