# Phase 5 실행 백로그

- 기준: main `27333db`, 2026-11-13. 근거: [마스터 플랜](PHASE5_MASTER_PLAN.md), [PRD](PRD.md) MVP-014.
- 상태(2026-11-13): D-03 승인, P5-01~08 **자동 검증 Done**, 수동 UAT-X **NOT RUN**. 기본 상태는 **Pending**이었다. 인일·마감일은 근거 없이 추정하지 않는다. 번호 하나가 커밋 하나라는 뜻은 아니다.

## 1. 의존성

```text
D-03 → P5-01 → P5-02 → P5-03 ─┐
             → P5-04 → P5-05 ─┼→ P5-07 → P5-08
             → P5-06 ─────────┘
```

P5-02~05는 브라우저 없이 단위 테스트로 검증한다. P5-06·07은 브라우저(E2E)가 관여한다.

## 2. 작업

### D-03 — Phase 5 정책 확정 — Done
- 마스터 플랜 §4의 결정 1~8. 승인 후 MODULE_CONTRACTS에 반영한다.

### P5-01 — 출력 계약과 파일 이름 — Done
- 범위: 출력 결과·오류 형식(`ExportPort` 또는 application 유스케이스), 파일 이름 규칙을 JSON 백업과 공유하도록 추출, 다운로드 adapter 재사용.
- 수용: 같은 제목에서 JSON·MIDI·MusicXML·PDF 이름이 같은 규칙을 따른다. 출력이 Score·저장·이력을 바꾸지 않는다.

### P5-02 — MIDI 생성기 — Done
- 범위: `src/adapters/midi`. Score → SMF type 1 바이트(결정 4). 모든 Part(결정 3).
- 수용: 템포·박자·조표 meta, 음 시작·길이 tick 일치, 타이 합침, velocity, 연습 속도 무관. 빈 악보, 쉼표만, 기보 불가 길이, 긴 타이 체인.

### P5-03 — MIDI 독립 검사 — Done
- 범위: 생성기 코드를 쓰지 않고 따로 작성한 테스트용 최소 SMF 파서로 왕복 확인(결정 7).
- 수용: 기존 fixture 악보 전부에서 (MIDI 번호, 시작 tick, 길이, velocity) 목록이 `mergeTiedNotes` 결과와 같다.

### P5-04 — MusicXML 생성기 — Done
- 범위: `src/adapters/musicxml`. MusicXML 4.0 partwise(결정 5·6). H-02 정확 분해·타이 재사용.
- 수용: 조표·박자·음자리표·템포, 음 철자(step/alter/octave), type/dot, 마디 안 조각 타이와 마디 넘는 타이, 빈 구간, 쉼표.
  기보 불가 길이는 명확한 오류이며 파일을 만들지 않는다. XML 특수 문자 제목.

### P5-05 — MusicXML 독립 검사 — Done
- 범위: 공식 4.0 XSD로 `xmllint --schema` 검증(결정 7). 라이선스 확인 후 XSD를 저장소에 둔다.
- 수용: fixture 악보 전부 스키마 통과. 생성 결과를 다시 읽어 마디 수·음 철자·길이 합이 Score와 같다(테스트용 DOM 파싱).

### P5-06 — 인쇄 화면(PDF) — Done
- 범위: `/print/[scoreId]` 읽기 전용 화면, A4 세로 페이지 배치, 머리글(제목·템포·박자·조표), 페이지 번호, 라벨 설정 반영(결정 1·2·6).
- 수용: Chromium `page.pdf()` → `pdfinfo` 페이지 수, `pdftotext` 제목. 줄·페이지를 넘는 타이, 긴 악보, 기보 불가 악보의 오류 화면.
  인쇄 화면은 저장소에 쓰지 않는다.

### P5-07 — 출력 UI — Done
- 범위: 편집기에 PDF(인쇄 화면 열기)·MIDI·MusicXML 버튼, 오류 안내. 저장 충돌·삭제 상태에서도 현재 내용 출력 허용 여부 정책 확인.
- 수용: 다운로드 파일 이름·내용이 현재 Score와 일치(E2E). 출력이 저장·이력을 바꾸지 않는다. UI 변경이므로 전체 E2E.

### P5-08 — 통합 인수 — Done(자동) / UAT-X NOT RUN
- 범위: 입력/채보 → 편집 → 조옮김 → 세 형식 출력 흐름 E2E, 수동 UAT-X 절차(외부 프로그램 열기·실제 인쇄).
- 수용: PRD Phase 5 "지원 범위의 검사 성공". 외부 프로그램·프린터·Safari·iPhone 결과는 따로 기록하며 미실행은 NOT RUN.

## 3. 검증·Git 규칙

- 테스트 삭제·skip·기대값 약화로 통과를 만들지 않는다.
- 사용자 요청 없이 commit/push/deploy/DB 삭제/이력 재작성을 하지 않는다.
- 작업 후 TASKS와 TEST_PLAN을 갱신한다.
