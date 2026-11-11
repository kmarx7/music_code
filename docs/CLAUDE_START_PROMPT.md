# Claude Code에 붙여넣을 시작 프롬프트

아래 내용을 프로젝트 폴더에서 시작한 Claude Code의 첫 메시지로 사용한다.
마지막 문장의 후속 작업 요청은 필요에 맞게 추가한다. 이 프롬프트만으로 전체 MVP 구현·커밋·배포를 지시하지 않는다.

```text
이 저장소는 Codex에서 개발하다가 사용량 제한 때문에 Claude Code로 이어서 작업하는 Music Score Platform입니다.
현재 작업 폴더는 /Users/kapital/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_music_code 입니다.

우선 CLAUDE.md와 AGENTS.md, docs/CLAUDE_HANDOFF.md를 읽고,
PRD/ARCHITECTURE/DECISIONS/DATA_MODEL/MODULE_CONTRACTS/TASKS/TEST_PLAN을 실제 디스크에서 확인하세요.
git status -sb와 git log도 확인하고 기존 사용자 변경을 보존하세요.

인계 기준 main HEAD는 e69ab20이며 origin/main보다 로컬15커밋 앞서 있었습니다.
H-01/H-02는 구현·로컬 커밋 완료입니다. 과거 문서의 커밋 보류/EPERM을 현재 미완료로 해석하지 마세요.
기준 자동 검증은 단위·통합45파일706개, 사용자 Mac Chromium57/57 PASS 기록입니다.
이번 인계 세션에서 재실행한 검사와 과거 사용자 브라우저 검증을 구별하세요.
실제 청취/Safari/모바일 실기기/대형 브라우저 성능은 별도 미검증입니다.

Phase3의 연습 속도/A–B/연속 선택·copy/cut/paste는 미구현이며 계획 문서는 제안입니다.
H-03 성능 지원범위와 D-01(C-08/rate/loop 경계) 미확정 사항을 먼저 파악하세요.
허밍·채보, PDF/MIDI/MusicXML, 최종 품질·브라우저 인수도 MVP에 그대로 남아 있습니다.

단일 Score v2/960PPQ/Part.ties, 기존 Command/Undo/Redo,
IndexedDB DB2/revision CAS/Tombstone/원본 보호를 유지하세요.
Domain에 브라우저/React/Tone/VexFlow를 넣거나 새 상태 시스템/저장소/런타임 의존성을 임의 도입하지 마세요.
연습 설정은 Score나 JSON에 저장하지 마세요. 기존 구현·공개 진입점 재사용을 우선하세요.

먼저 현재 구현/검증/남은 작업/미확정 정책을 한국어로 짧게 보고하세요.
제품 코드 수정·커밋·push·배포는 아직 시작하지 말고 다음 요청을 기다리세요.
```

후속으로 Phase3를 진행하려면 다음처럼 범위를 구체화할 수 있다.

```text
Phase3 진입 준비부터 진행해 주세요. 기존 H-01/H-02를 재구현하지 말고,
H-03의 재현 가능한 브라우저 측정안과 D-01의 C-08/rate/loop 정책안을 실제 코드 기준으로 정리해 주세요.
기존 계약 안에서 가능한 문서·읽기 전용 조사부터 수행하고,
결정이 필요한 정책과 구조 변경 승인 대상을 구분해 제시해 주세요.
제품 구현과 commit/push/deploy는 이번 요청에 포함하지 않습니다.
```
