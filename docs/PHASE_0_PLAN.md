# Phase 0 — 문서 일관성 검증 및 상세 구현 계획

- 작성일: 2026-11-07
- 작업 ID: PLAN-P0
- 상태: 계획 작성 완료 / 구현 미착수
- 기준: `AGENTS.md`, `PRD.md` v2.0, `ARCHITECTURE.md` v2.0, ADR-001–007
- 이 문서는 구현 계획이며 구조 변경이나 신규 의존성 도입의 승인 기록이 아니다.

## 1. 현재 저장소 진단

네 기준 문서를 모두 읽고 현재 파일 목록을 확인했다.

- 구현 소스, `package.json`, lockfile, 테스트, CI 구성은 없다.
- `DATA_MODEL.md`, `MODULE_CONTRACTS.md`, `TASKS.md`, `TEST_PLAN.md`는 아직 없으며 Phase 0 산출물이다.
- `git status --short`는 `fatal: not a git repository`로 실패했다. 현재 작업 디렉터리는 Git 저장소가 아니다.
- 재사용할 기존 구현 모듈은 없다. 기준 문서의 모델·모듈 구분·명령 흐름을 재사용하며, 향후 각 작업 직전에도 중복 구현을 검색한다.
- 이번 작업은 문서만 추가한다. Git 초기화, 패키지 설치, 앱 생성, 코드 작성, 배포는 실행하지 않는다.

## 2. 문서 간 일관성 검증

### 2.1 일치하는 확정 사항

| 검증 항목 | 근거 | 판정 |
|---|---|---|
| MVP 14개 기능 모두 필수 | PRD §3·7, AGENTS §1·8, ADR-006 | 일치. Phase는 구현 순서이며 범위 축소가 아님 |
| Next.js App Router + React + TypeScript, 모듈형 모놀리스 | ARCHITECTURE §2·4, AGENTS §3, ADR-001 | 일치 |
| 단일 canonical Score 및 960 PPQ | ARCHITECTURE §6, AGENTS §3, ADR-002, PRD §8 | 일치 |
| 검증된 명령을 통한 영속 편집 | ARCHITECTURE §7, AGENTS §3, ADR-002, PRD MVP-005 | 일치 |
| IndexedDB 및 백업/복원, 계정 불필요 | ARCHITECTURE §11, ADR-003, PRD MVP-013 | 일치 |
| 연습 속도·루프는 Score와 분리 | ARCHITECTURE §7·10, ADR-004, PRD MVP-008·009 | 일치 |
| 단선율 허밍, 녹음 후 분석, 후보 검토 후 반영 | ARCHITECTURE §9, ADR-005, PRD MVP-002·003 | 일치 |
| PDF/MIDI/MusicXML은 같은 Score를 소비 | ARCHITECTURE §8·11, PRD MVP-014 | 일치 |
| 경계·순환 의존성·음악 불변식 검사 | ARCHITECTURE §12, ADR-007, AGENTS §6 | 일치 |
| 구조 변경은 제안 → 명시적 승인 → ADR/문서 갱신 → 구현 | 네 문서의 변경 통제 항목 | 일치 |

핵심 아키텍처를 서로 다르게 규정하는 직접 충돌은 발견하지 않았다. 다음 항목은 구현 전에 명확히 해야 하는 표현 차이 또는 미정 계약이다.

### 2.2 표현 차이 및 미정 사항

| ID | 발견 사항과 근거 | Phase 0 처리 / 영향 |
|---|---|---|
| C-01 | PRD MVP-002는 지원되는 환경에서 라이브 추정 피치를 표시하도록 서술한다. ARCHITECTURE §9는 라이브 표시를 optional, ADR-005는 allowed로 표현한다. | 제품 요구사항은 PRD를 따른다. 지원 환경에서는 표시하고, 미지원 시 상태와 이유를 안내하는 것으로 테스트 계획을 작성한다. 선택 기능으로 낮추지 않는다. 표현 통일이 필요하면 기준 문서 수정안을 별도로 제시한다. |
| C-02 | ARCHITECTURE §6의 Score/Part/Voice/Measure는 정확한 소유 관계와 시간 좌표를 아직 정하지 않았다. | DATA_MODEL에서 이벤트 소유 위치, 전역/마디 상대 tick, 마디 시작 계산, 정렬 기준을 하나로 정한다. 별도 가변 이벤트 배열이나 두 시간 모델을 만들지 않는다. |
| C-03 | 마디 경계·타이·지원 음가·박자·온음계 철자·조표 변경 범위가 상세하지 않다. | 지원 표와 실패 정책을 먼저 작성한다. 높은음/낮은음자리표, 장조/단조, 쉼표 등 명시된 요구는 유지한다. 범위 축소에 해당하는 제한은 임의 확정하지 않고 사용자에게 제시한다. |
| C-04 | 명령 예시는 있으나 메타데이터 편집, 원자적 다중 편집, Undo/Redo, 후보 반영의 정확한 계약이 없다. | MODULE_CONTRACTS에서 실패 시 원본 보존, 한 사용자 동작의 한 히스토리 단위, 새 편집 후 redo 무효화, 저장 실패와 편집 성공의 구분을 정한다. |
| C-05 | 상태 3분할은 확정됐으나 store 구현 수단과 의존성 조립 위치는 미정이다. | 하나의 Score 소유자와 구독·명령 진입점을 명시한다. App의 조립 지점만 구체 어댑터를 연결하고 Application은 port만 참조한다. 상태 라이브러리를 자동 도입하지 않는다. |
| C-06 | 기술표에는 기본 라이브러리가 명시됐지만 AGENTS §5는 신규 production 의존성 추가를 승인 대상으로 규정한다. | 기준 기술 선택과 실제 패키지/버전 도입 승인을 구분한다. 호환성 근거, 라이선스, 목적, 영향을 정리한 구체 목록을 설치 전에 승인받는다. |
| C-07 | 저장 버전·손상 데이터·백업 복원·이전 스키마 migration 정책이 미정이다. | v1 직렬화와 검증/오류 계약을 문서화한다. 미래 버전은 안전하게 거부하고 원본을 보존한다. 실제 구버전이 없으므로 migration 완료를 주장하지 않는다. |
| C-08 | 클립보드 삽입/교체, 충돌, 잘라내기와 마디 경계 처리의 상세 동작이 미정이다. | 상대 위치·길이·새 ID·트랜잭션 요구를 Phase 0에 계약화한다. 사용자에게 보일 삽입/교체 의미와 타이 처리 정책은 Phase 3 전에 확정한다. |
| C-09 | PRD의 F1 0.90은 제안 목표이며 데이터셋·허용 오차·지원 녹음 길이가 미정이다. | TEST_PLAN에 Phase 4 평가 방법과 beta 전 확정 시점을 명시한다. Phase 0 성공 조건이나 검증된 성능으로 사용하지 않는다. |
| C-10 | 지원 브라우저는 명시됐지만 정확한 버전·실기기 조합과 자동화 범위는 없다. | 테스트 시점의 버전/OS를 기록하는 표를 만든다. Playwright WebKit 결과와 실제 Safari/iOS 검증을 구분한다. |

이 계획은 구조 변경을 요구하지 않는다. 세부 계약을 확정하다 기준선 변경이 필요해지면 해당 변경만 멈추고 문제·대안·영향·이행·테스트를 포함한 ADR 승인 절차를 따른다.

## 3. MVP 14개 기능 추적

Phase 0에서는 아래 기능의 데이터·공개 경계·검증 기반을 준비한다. 기능 자체를 완료 처리하지 않는다.

| ID | 확정 기능 | 주 구현 Phase | Phase 0에서 확보할 기반 |
|---|---|---|---|
| MVP-001 | 가상 피아노 | 1 | Pitch, 음가, 입력 커서와 AddNote 계약 |
| MVP-002 | 허밍 녹음 | 4 | 녹음 runtime 분리, 권한/오류·원본 오디오 비영속 계약 |
| MVP-003 | 단선율 자동 채보 | 4 | 후보 데이터와 Score의 구분, 검토 후 원자적 명령 반영 |
| MVP-004 | 악보 렌더링 | 1 | 조표·박자·음자리표·철자 모델, 읽기 전용 렌더 입력 |
| MVP-005 | 기본 편집 | 1 | 음악 불변식, 명령 처리, Undo/Redo |
| MVP-006 | 선택·클립보드 | 3 | ID 기반 선택, 상대 tick, 새 ID 및 충돌 검증 계약 |
| MVP-007 | 조옮김 | 2 | sounding pitch와 표기 일관성, 미리보기/확정/취소 계약 |
| MVP-008 | 연습 속도 | 3 | 25–150%·5% 간격 runtime 상태, 원래 tempo 보존 |
| MVP-009 | A–B 루프 | 3 | `[startTick, endTick)`와 note-off 계약 |
| MVP-010 | 음이름·고정도 계이름 | 2 | 표시용 projection, 원본 철자와 상태 분리 |
| MVP-011 | 음역·조옮김 제안 | 2 | Pitch 범위, 사용자 min/max, 조옮김 모듈 재사용 계약 |
| MVP-012 | 재생 | 1, 3 통합 | Score 기반 scheduler port와 transport 상태 분리 |
| MVP-013 | 로컬 악보함 | 1, 6 강화 | ScoreRepository, 버전 검증, 백업/복원·오류 계약 |
| MVP-014 | 내보내기 | 5 | 같은 Score를 받는 PDF/MIDI/MusicXML 경계와 검증 fixture |

## 4. Phase 0 상세 작업 순서

아래 예상 경로는 구현 시 기존 파일을 다시 검색한 후 확정한다. 실사용 없는 feature 폴더나 포트 구현을 미리 만들지 않는다.

### P0-01 — 계약 문서와 추적표 작성

- 선행: 이 검증 결과 검토.
- 산출물: `docs/DATA_MODEL.md`, `docs/MODULE_CONTRACTS.md`, `docs/TASKS.md`, `docs/TEST_PLAN.md`.
- DATA_MODEL: Score/Part/Voice/Measure 소유 관계, NoteEvent/RestEvent 판별, Pitch의 MIDI와 step/alter/octave 일관성, 960 PPQ, ID, duration/onset, provenance, schemaVersion, 최소 JSON 예시.
- 음악 정책: 비정수/음수 tick, MIDI 범위, 이벤트 중첩, 빈/불완전 마디, 경계 초과와 타이, 박자·조표·음자리표, 지원 음가를 구체화한다. 실시간 초/샘플 위치는 양자화 tick과 별도로 관리한다.
- MODULE_CONTRACTS: 공개 진입점, 레이어 의존성 표, 명령 입력/성공/실패, 조립 지점, Score 소유권, 읽기 projection, repository·transcription·playback·export port를 필요한 수준으로 정의한다.
- TASKS: 본 계획의 P0 ID와 MVP-001–014를 연결하고 상태/선행/증거를 기록한다.
- 완료 조건: C-02–05의 기초 모델/명령 계약을 확정하고 미정·승인 필요 항목을 표시한다. 이후 Phase의 상세 알고리즘까지 미리 구현하지 않는다.

### P0-02 — 도구·패키지 호환성 검토 및 도입 목록 확정

- 선행: P0-01의 레이어·실행 환경 요구.
- Node.js, Next.js/React/TypeScript, Tailwind, VexFlow, Tone.js, 검증 도구, Vitest/Playwright의 실제 지원 버전·peer dependency·SSR/client 제약·라이선스를 공식 자료와 최소 검증으로 확인한다.
- 현재 패키지 및 버전은 미선정·미검증이다. 계획 작성 시 최신 호환성을 확인한 것으로 주장하지 않는다.
- lockfile이 없으므로 문서의 npm 명령에 맞춰 npm 사용을 제안한다. 버전과 lockfile 정책을 기록하고 package manager를 중복 도입하지 않는다.
- VexFlow/Tone.js/Web Audio/IndexedDB는 클라이언트 어댑터 경계에서만 초기화한다. 서버 렌더나 import 시 browser global 접근이 발생하지 않는지 확인한다.
- DSP 라이브러리 선택은 Phase 4로 넘길 수 있다. 채보 port와 후보 계약은 먼저 고정하며 외부 AI/API나 백엔드를 추가하지 않는다.
- 산출물: MODULE_CONTRACTS의 호환성·의존성 표 및 구체 production 패키지 도입 승인안. 승인된 패키지만 설치한다.
- 완료 조건: 설치할 이름/버전/목적/대안/영향이 명확하고 필요한 승인이 있다. VexFlow/Tone.js 도입 시점은 해당 기능의 Phase까지 늦출 수 있다.

### P0-03 — 최소 Next.js 골격과 검사 명령 구성

- 선행: P0-01, P0-02의 해당 도입 승인.
- 예상 파일: `package.json`, `package-lock.json`, TypeScript/Next/ESLint/Tailwind 설정, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, 전역 스타일, Vitest/Playwright 설정.
- strict TypeScript, 경로 alias, App Router와 최소 실행 화면을 구성한다. 화면은 Phase 0 상태 확인 수준이며 기능 완료를 표현하지 않는다.
- `/record`, `/editor/[scoreId]`, `/library`는 PRD의 후속 구현 경로로 유지한다. Phase 0에 미작동 제품 화면을 대량 생성하지 않는다.
- `typecheck`, `lint`, `test`, `check:architecture`, `build`를 실제 동작하는 script로 구성한다. E2E 실행 script도 구분한다.
- Git 초기화는 별도 저장소 설정 작업으로 기록하고 실행 권한 범위에서 처리한다. 커밋·원격 연결·push·배포는 이번 계획 범위에 포함하지 않는다.
- 완료 조건: 최소 페이지가 실행되고 strict 검사 및 production build가 동작한다.

### P0-04 — canonical 음악 모델과 검증 구현

- 선행: P0-01, P0-03.
- 예상 파일: `src/domain/score/`, 필요 시 `src/domain/music-theory/`의 모델·시간·검증 및 공개 `index.ts`, 대응 unit tests/fixtures.
- 단일 타입 정의를 만들고 다른 레이어는 이를 import한다. 렌더러·재생용 DTO는 읽기 전용 파생값으로만 허용한다.
- 검증: ID 유일성, 양의 duration, 음수 onset 금지, 유효 MIDI/철자, 960 PPQ와 박자 길이, 단선율 중첩, 마디 경계, schemaVersion.
- 유효한 빈 Score 및 C4–D4–E4–G4 fixture와 잘못된 입력 fixture를 만든다. 같은 fixture를 후속 렌더/재생/저장/내보내기 검사에 재사용한다.
- 완료 조건: Domain이 브라우저 없는 테스트 환경에서 실행되며 정상/오류 fixture가 기대대로 판정된다.

### P0-05 — 명령 파이프라인과 Undo/Redo 기반

- 선행: P0-04.
- 예상 파일: `src/domain/commands/`, `src/application/`의 편집 use case와 필요한 공개 진입점, 대응 unit/integration tests.
- Phase 0 최소 수직 흐름: AddNote → UpdateNote → DeleteNote/InsertRest → 새 Score → Undo/Redo. 메타데이터 편집 등은 확정된 계약에 맞춰 순차 추가한다.
- 명령 검증과 적용은 순수 Domain에 두고 Application은 편집·히스토리·향후 저장 요청을 조율한다. ID/시각 등 외부 값은 경계에서 공급해 테스트를 재현 가능하게 한다.
- 실패 명령은 Score와 history를 변경하지 않는다. 성공한 다중 편집은 하나의 원자적 단위로 취급할 계약을 마련한다.
- TransposeScore/PasteSelection/채보 반영은 계약을 준비하되 실제 기능 알고리즘은 Phase 2/3/4에서 구현한다.
- 완료 조건: 원본 불변성, 실패 시 보존, Undo/Redo 복구, redo branch 처리와 네 음 fixture 편집이 테스트로 확인된다.

### P0-06 — 상태·port·조립 경계 연결

- 선행: P0-01, P0-05.
- 예상 파일: `src/application/`의 필요한 ports, `src/store/`의 단일 Score 소유자, App의 조립 지점, 경계 검증용 integration tests.
- music/UI/runtime 세 상태를 분리하고 UI가 Score 내부를 직접 쓰지 못하도록 명령 진입점을 연결한다. 고주파 audio 상태는 Score 변경·React 전체 재렌더 경로에 넣지 않는다.
- Application은 구체 어댑터를 import하지 않는다. 테스트 fake는 같은 repository 등 port를 구현하며 두 번째 production 모델/저장소가 되지 않는다.
- IndexedDB·음향·렌더 어댑터의 본 구현은 Phase 1 이후로 둔다. 저장할 포맷과 검증 진입점, 저장 실패 전달 및 재시도 정책을 문서화한다.
- 완료 조건: 테스트 구독자가 명령 결과를 받고, UI/runtime 상태 변경은 canonical Score 및 영속 직렬화 결과를 변경하지 않는다.

### P0-07 — 실제 아키텍처 검사와 검사기 자체 검증

- 선행: P0-03의 도구 구성, P0-04–06의 실제 import 구조.
- 예상 파일: 선택한 경계 검사 설정, 필요한 `scripts/` 검사기, 격리된 architecture test fixtures.
- 필수 규칙: Domain → 외부 레이어/런타임 패키지 금지, Application → 구체 Adapter/React 금지, feature 간 private import 금지, 순환 의존성 금지.
- alias·상대경로·재수출·type-only import를 통해 규칙을 우회하지 못하도록 검사 범위를 정의한다. Domain browser globals도 별도 정적 규칙으로 검사한다.
- 허용된 App 조립 import 및 feature public entrypoint는 정상 fixture로 검증한다.
- 금지 import·순환·private 접근·browser global 각각에 대해 격리 fixture의 검사 실패와 non-zero exit를 확인한다. production 소스에 위반을 남기지 않는다.
- 단일 모델의 의미적 중복은 도구만으로 입증할 수 없다. 타입 선언 검색과 리뷰 항목을 TEST_PLAN에 포함한다.
- 완료 조건: 실제 소스는 통과하고 의도적 위반 fixture는 실패한다. 항상 성공하는 빈 script는 완료로 인정하지 않는다.

### P0-08 — 통합 검증과 인수 기록

- 선행: P0-03–07.
- 최소 E2E: 브라우저에서 골격 페이지 로드 및 수화 오류 확인. 피아노·마이크·저장·내보내기 검증으로 확대 해석하지 않는다.
- 최소 통합: 유효 Score → 명령 적용 → 읽기 결과 → Undo/Redo. 직렬화 검증이 구현됐다면 왕복 동등성과 손상/미지원 버전 거부도 확인한다.
- 아래 다섯 명령과 별도 E2E를 실행하고 실제 exit code와 실패 원인을 TASKS/TEST_PLAN에 기록한다.
- CI를 구성하는 경우 같은 검사들을 실행하고 위반 시 실패시킨다. 원격 실행이나 배포 성공을 로컬 성공으로 대체하지 않는다.
- 완료 조건: Phase 0 인수 기준 충족, 문서/실제 공개 API 일치, Phase 1에 필요한 계약과 남은 제약이 명확하다.

## 5. 테스트 및 종료 기준

Phase 0 구현 후 실행할 명령이며 현재는 구성도 실행도 하지 않았다.

```bash
npm run typecheck
npm run lint
npm run test
npm run check:architecture
npm run build
```

| 검증 계층 | 필수 증거 |
|---|---|
| Domain 단위 | pitch/tick/마디/중첩/ID 불변식 정상·실패 사례 |
| 명령 단위·통합 | 유효 편집, 무효 편집의 원본 보존, Undo/Redo, 불변 업데이트 |
| 상태 경계 | UI/runtime 변경 전후 Score 동등성, 하나의 쓰기 진입점 |
| 직렬화 경계 | 구현된 범위의 검증 및 round-trip, 손상/미지원 schema 처리 |
| 아키텍처 | 정상 import 통과와 각 금지 fixture 실패, 순환 검출 |
| 브라우저 | 골격 페이지 로드·수화 smoke, 실행 브라우저/버전 기록 |
| 빌드 | 위 다섯 script의 실제 성공 결과 |

Phase 0 완료는 문서 네 개, 실행 가능한 골격, 단일 모델, 기본 명령/히스토리, 실제로 실패를 검출하는 검사 기반이 준비됐음을 뜻한다. MVP 기능 완료나 채보 정확도·Safari 실기기·마이크·IndexedDB 복구·세 내보내기 호환성 검증을 뜻하지 않는다.

## 6. 변경·승인 경계와 다음 작업

- 현재 추가 파일은 이 계획서 하나다. 네 기준 문서와 확정 MVP/아키텍처는 변경하지 않았다.
- 구현 시작 시 첫 작업은 P0-01이며, 그 전에 파일 목록과 Git 상태를 다시 확인한다.
- 구조 변경은 현재 제안하지 않는다. 필요해지면 AGENTS §5 및 ADR governance에 따라 문제/대안/영향/이행/테스트를 갖춘 구체안을 먼저 작성한다.
- production 패키지 도입은 P0-02의 검토·승인 이후 진행한다. 이 계획 작성 요청을 패키지 설치나 구현 착수 승인으로 간주하지 않는다.
- 현재 완료 증거: 문서 읽기, 파일 목록/경로 확인, 문서 간 대조. 테스트·build·호환성 실험은 미실행이며 코드와 패키지 구성이 없는 상태에서 실행 성공을 주장하지 않는다.
