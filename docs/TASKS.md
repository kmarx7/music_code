# TASKS.md — Phase 0 작업 및 MVP 추적

- 최종 갱신: 2026-11-07
- 작업 단위: `docs/PHASE_0_PLAN.md` P0-01 ~ P0-08
- 상태 표기: `Done` / `Partial` / `Pending` / `Blocked`
- 증거는 실제 실행 결과만 기록한다(추정 금지).

## 1. Phase 0 작업 상태

| ID | 작업 | 상태 | 증거 / 비고 |
|---|---|---|---|
| P0-01 | 계약 문서 4종 작성 | **Done** | `DATA_MODEL.md`, `MODULE_CONTRACTS.md`, `TASKS.md`, `TEST_PLAN.md` 작성. C-02·C-04 확정 |
| P0-02 | 도구·패키지 호환성 및 도입 목록 | **Done** | next 16.4.4, react 19.3.0, typescript ^5, eslint ^9, vitest ^5.1.0, dependency-cruiser ^18.7.2 설치. 미도입 목록 문서화(MODULE_CONTRACTS §7) |
| P0-03 | 최소 Next.js 골격 + 검사 명령 | **Done** | `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`, `src/app/{layout,page,globals.css}`. 5개 script 동작 |
| P0-04 | canonical 모델 + 검증 | **Done** | `src/domain/score/{types,constants,create,validate,index}.ts`, `src/domain/music-theory/pitch.ts`. 정상/오류 fixture 8종 판정 |
| P0-05 | Command 파이프라인 + Undo/Redo | **Done (기본 4종)** | `AddNote`, `UpdateNote`, `DeleteEvent`, `InsertRest`. Transpose/Paste는 Phase 2/3 (계약만 준비) |
| P0-06 | 상태·port·조립 경계 | **Done** | `ScoreRepository` 포트, 단일 Score 소유자 `src/store/score-store.ts`(React 비의존) + `useScoreStore`(useSyncExternalStore). 새 상태 라이브러리 미도입 |
| P0-07 | 아키텍처 검사기 + 자기검증 | **Done** | depcruise 6규칙 + check-boundaries 3규칙. 의도적 위반 6종 탐지 확인 후 fixture 제거(TEST_PLAN §4) |
| P0-08 | 통합 검증·인수 기록 | **Partial** | 직렬화 round-trip·손상/미지원 버전 거부 구현·테스트 완료. E2E(Playwright) 미도입·미실행 |

## 2. 검증 명령 결과 (2026-11-07 실행)

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run typecheck` | ✅ exit 0 | strict |
| `npm run lint` | ✅ exit 0 | eslint 9 + eslint-config-next |
| `npm run test` | ✅ exit 0 | 6 파일 / **38 테스트 통과** |
| `npm run check:architecture` | ✅ exit 0 | 21 모듈·41 의존성, 위반 0 |
| `npm run build` | ✅ exit 0 | Next 16.4.4, 정적 페이지 3개 |

## 3. MVP 기능 추적 (Phase 0 기반만 준비, 기능 완료 아님)

| ID | 기능 | 상태 | Phase 0에서 확보한 기반 |
|---|---|---|---|
| MVP-001 | 가상 피아노 | Pending | `Pitch`, `NoteEvent`, `AddNote` 명령 |
| MVP-002 | 허밍 녹음 | Pending | 런타임/음악 상태 분리 원칙만 정의 |
| MVP-003 | 단선율 채보 | Pending | 후보→명령 반영 계약(문서), 구현 없음 |
| MVP-004 | 악보 렌더링 | Pending | 조표·박자·음자리표·철자 모델 |
| MVP-005 | 기본 편집 | Partial | AddNote/UpdateNote/DeleteEvent/InsertRest + Undo/Redo. UI 없음 |
| MVP-006 | 선택·클립보드 | Pending | ID 기반 선택·상대 tick 계약(문서) |
| MVP-007 | 조옮김 | Pending | `midiFromSpelling`/표기 일관성 검증 |
| MVP-008 | 연습 속도 | Pending | Score와 분리 원칙(ADR-004) |
| MVP-009 | A–B 루프 | Pending | `[startTick, endTick)` 문서 계약 |
| MVP-010 | 음이름·고정도 | Partial | `letterName`, `koreanFixedDo` (순수 함수) |
| MVP-011 | 음역·조옮김 제안 | Pending | Pitch/MIDI 범위 검증 |
| MVP-012 | 재생 | Pending | 미착수 |
| MVP-013 | 로컬 악보함 | Pending | `ScoreRepository` 포트 + 직렬화/검증(`serializeScore`/`deserializeScore`). IndexedDB 어댑터는 Phase 1 |
| MVP-014 | 내보내기 | Pending | 미착수 |

## 4. 다음 작업 (Phase 1 착수 전)

1. P0-06 마무리: React store 도입 여부·형태를 ADR로 확정(승인 필요) 후 단일 Score 소유자 연결.
2. 직렬화/역직렬화 + 버전 검증(P0-08 잔여) 구현 및 round-trip 테스트.
3. Playwright 도입은 E2E가 실제로 필요한 시점(Phase 1 렌더링)에 승인 후 추가.
4. Phase 1: 가상 피아노 → 편집 → VexFlow 렌더링 → 재생 → IndexedDB 저장.
