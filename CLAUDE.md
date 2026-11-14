# Claude Code 작업 진입 안내

이 프로젝트는 Codex에서 개발하다가 Claude Code로 이어서 작업한다. 보고·설명은 한국어로 한다.

## 첫 세션에서 읽을 문서

1. [AGENTS.md](AGENTS.md) — 에이전트 이름과 관계없이 이 저장소의 작업 규칙으로 준수한다.
2. [Claude 인수인계](docs/CLAUDE_HANDOFF.md) — 현재 구현·검증·Git 상태와 다음 작업.
3. [PRD](docs/PRD.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [DECISIONS](docs/DECISIONS.md).
4. [DATA_MODEL](docs/DATA_MODEL.md), [MODULE_CONTRACTS](docs/MODULE_CONTRACTS.md),
   [TASKS](docs/TASKS.md), [TEST_PLAN](docs/TEST_PLAN.md).
5. Phase 3 작업 시 [마스터 플랜](docs/PHASE3_MASTER_PLAN.md)과 [백로그](docs/PHASE3_BACKLOG.md).

인수인계는 원문 계약을 대체하지 않는다. 문서에는 시점별 이력이 누적되어 있다.
문서 앞부분의 과거 수치·커밋 보류를 최신 상태로 오해하지 말고 실제 Git/코드와 마지막 검증 기록을 확인한다.
2026-11-11 인계 기준 H-01/H-02는 구현·로컬 커밋 완료, Phase 3 기능은 미구현이다.

## 지켜야 할 핵심

- 작업 전 `git status`와 기존 구현을 확인하고 사용자 변경을 보존한다.
- Next.js App Router + React + TypeScript, 단일 canonical Score, 기존 Command/Undo/Redo 흐름을 유지한다.
- Domain은 브라우저·React·Tone·VexFlow·IndexedDB에 의존하지 않는다.
- Score schemaVersion 3(v1·v2는 읽을 때 이동, Phase 7 결정 6), `Part.ties`, `Part.instrument`, IndexedDB DB2, ADR-010 revision/CAS/Tombstone 보호를 유지한다.
- 연습 rate/loop와 UI 선택은 Score·JSON·저장 이력에 넣지 않는다.
- 기존 공개 진입점과 모듈을 재사용한다. 새 런타임 의존성·저장 엔진·상태 시스템·비호환 계약·구조 변경은 승인 대상이다.
- Phase 3의 C-08/재생 중 rate 변경/loop 경계는 아직 제안이다. 승인된 정책처럼 구현하지 않는다.
- 테스트 삭제·skip·기대값 약화로 통과를 만들지 않는다. 실제 청취·Safari·모바일 실기기 미검증을 명시한다.
- 사용자 요청 없이 commit/push/deploy/DB 삭제/이력 재작성을 하지 않는다. 인수인계 요청은 구현·배포 승인이 아니다.
- 작업 후 TASKS와 관련 검증 기록을 갱신하고 실제 실행 결과로 보고한다.

제품 변경의 기본 검증은 `npm run typecheck`, `npm run lint`, `npm run test`,
`npm run check:architecture`, `npm run build`이며 UI 변경에는 전체 `npm run test:e2e`도 수행한다.

사용자가 새 세션에 붙여넣을 문구: [CLAUDE_START_PROMPT.md](docs/CLAUDE_START_PROMPT.md).
