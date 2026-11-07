# TEST_PLAN.md — 검증 계획과 Phase 0 실행 기록

- 작성일: 2026-11-07
- 작업 ID: P0-01 / P0-07 / P0-08
- 원칙: 실패한 테스트를 무시·삭제하지 않는다. 실행하지 않은 검증을 통과로 기록하지 않는다.

## 1. 검증 계층

| 계층 | 범위 | 도구 | Phase 0 상태 |
|---|---|---|---|
| Domain 단위 | 음정/시간/마디/중첩/ID 불변식 | Vitest | ✅ 실행 |
| Command 단위 | 편집 성공/실패, 원본 불변 | Vitest | ✅ 실행 |
| 히스토리 단위 | Undo/Redo, 실패 시 보존, redo 무효화 | Vitest | ✅ 실행 |
| 아키텍처 | 레이어·순환·전역·private import·중복 모델 | dependency-cruiser + check-boundaries | ✅ 실행 |
| 정적 검사 | 타입·린트 | tsc, eslint | ✅ 실행 |
| 빌드 | 프로덕션 빌드 | next build | ✅ 실행 |
| 통합 | store/port 연결 (단일 Score 소유자) | Vitest | ✅ 실행 |
| 직렬화 | round-trip, 손상/미지원 버전 | Vitest | ✅ 실행 |
| 브라우저 E2E | 골격 로드·수화 | Playwright | ⏳ 미도입 |
| 오디오/내보내기 | 채보·PDF/MIDI/MusicXML | - | ⏳ Phase 4/5 |

## 2. 단위 테스트 목록 (실행 결과: 6 파일 / 38 통과)

### `tests/unit/music-theory.test.ts` (5)
- 자연음 MIDI 매핑(C4=60, D4=62, E4=64, G4=67, C3=48)
- 임시표(F#4=66, Bb4=70)
- `createPitch` 일관성
- letter / fixed-Do 라벨(C4→"C4", F#4→"F#4", C4→"도", F#4→"파#")
- `TICKS_PER_QUARTER === 960`

### `tests/unit/score-validation.test.ts` (8)
- 4/4 = 3840 tick, 6/8 = 2880 tick
- 네 음 fixture는 위반 0
- 중복 ID / 중첩 / 0 길이 / 마디 경계 초과 / MIDI 범위 / 표기-MIDI 불일치 각각 검출

### `tests/unit/commands.test.ts` (10)
- AddNote 성공·원본 불변·중복 ID 거부·중첩 거부·없는 마디
- UpdateNote 음정/길이 변경·표기 불일치 거부·없는 note
- DeleteEvent·InsertRest

### `tests/unit/edit-session.test.ts` (5)
- 성공 편집 기록 + undo/redo
- 실패 명령 시 session 동일 참조 유지
- 새 편집 후 redo branch 제거
- 히스토리 없을 때 undo/redo no-op
- 과거 스냅샷 불변

### `tests/unit/serialize.test.ts` (5)
- 유효 Score round-trip 동등성
- 잘못된 JSON 거부
- Score 형태 아님 거부
- 미지원 schemaVersion 거부
- 손상 Score(0 길이) 거부 + 검증 코드 포함

### `tests/unit/score-store.test.ts` (5)
- 초기 null → init 후 세션
- 명령 적용 + 히스토리 기록
- 실패 명령 시 상태 동일 참조 유지
- undo/redo
- 변경 시에만 구독자 알림(구독 해제 후 미알림)

## 3. 실행 명령과 결과 (2026-11-07)

```bash
npm run typecheck        # exit 0
npm run lint             # exit 0
npm run test             # exit 0  (38 passed)
npm run check:architecture  # exit 0 (21 modules / 41 deps, 위반 0)
npm run build            # exit 0
```

## 4. 아키텍처 검사기 자기검증 (의도적 위반 → 탐지 → 제거)

임시 fixture를 `src/domain/__arch_violation__`, `src/features/{alpha,beta}` 에 만들고
검사를 실행한 뒤 **삭제**했다. 관측 결과:

| # | 의도적 위반 | 검사 규칙 | 관측 결과 |
|---|---|---|---|
| 1 | domain → application import | `domain-no-outer-layers` | error 1건, depcruise exit 2 |
| 2 | domain → `react` import | `domain-no-runtime-libraries` | error 1건(수정 후) |
| 3 | domain에서 `window` 사용 | `domain-runtime-global` | 위반 1건, check-boundaries exit 1 |
| 4 | feature beta → alpha private 파일 | `feature-private-import` | 위반 1건 |
| 5 | domain 밖에서 `interface Score` 선언 | `canonical-type-outside-domain` | 위반 1건 |
| 6 | domain 내부 순환 import(a↔b) | `no-circular` | error 1건 |

- 관측: depcruise 3 errors(1+2+6 통합 시) / check-boundaries 3 violations, 각각 non-zero exit.
- 조치: fixture 전체 삭제 후 재실행 → **위반 0** 확인.
- 교훈: depcruise `exclude`에 `^node_modules/`를 넣으면 npm 의존성이 크루즈에서 빠져
  런타임 라이브러리 규칙이 무력화된다. 현재 설정은 `exclude`에서 node_modules를 제외하지 않고
  `doNotFollow`만 사용한다.

## 5. 브라우저/실기기 테스트 (미실행)

| 항목 | 상태 |
|---|---|
| 데스크탑 Chrome/Safari 골격 로드 | 미실행 (Playwright 미도입) |
| 모바일 Safari/Chrome | 미실행 |
| 마이크 권한/오디오 | Phase 4 |
| IndexedDB 복구 | Phase 1 |

브라우저 매트릭스는 E2E 도입 시점의 실제 버전을 기록한다(추정 금지).

## 6. 향후 테스트 (Phase별)

| Phase | 추가 테스트 |
|---|---|
| 1 | VexFlow 렌더 스냅샷, 재생 스케줄, IndexedDB save/load round-trip, E2E 4음 입력 |
| 2 | 조옮김 표기/사운드 일관성, 라벨 재계산, 음역 후보 |
| 3 | practice speed가 Score를 바꾸지 않음, A–B 경계 note-off, clipboard ID 재생성 |
| 4 | pitch/onset 정확도, 반복음/옥타브/침묵, F1 벤치마크(데이터셋 확정) |
| 5 | PDF 레이아웃, MIDI 타이밍, MusicXML 조표/박자/철자 round-trip |
| 6 | 모바일/접근성/복구 회귀 |

## 7. 미해결·미검증 (정직한 기록)

- E2E 미실행, 실제 브라우저 검증 없음.
- IndexedDB 어댑터 미구현 → 실제 저장/재열기 미검증(직렬화 계층만 검증).
- 아키텍처 위반 fixture는 "검증 후 제거" 방식이며, **상시 회귀 테스트로 남아 있지 않다**.
  필요 시 `tests/architecture/` 격리 fixture + 별도 script로 상시화 검토.
- 채보 정확도·내보내기 호환성은 아직 해당 없음.
