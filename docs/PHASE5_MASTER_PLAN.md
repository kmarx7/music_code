# Phase 5 마스터 플랜 — PDF·MIDI·MusicXML 출력

- 작성: 2026-11-13, Claude Code. 기준 코드: main `27333db`.
- 대상 요구사항: PRD MVP-014(출력), Phase 5 완료 기준 "지원 범위의 왕복/검사 성공". 실행 단위는 [PHASE5_BACKLOG](PHASE5_BACKLOG.md).
- 상태: **D-03 권고안 그대로 사용자 승인(2026-11-13, "그대로 진행해줘").** P5-01~08 자동 구현·검증 완료(§8). 수동 UAT-X는 NOT RUN.

## 1. 목표와 범위

현재 Score를 세 가지 표준 형식으로 내보낸다. 각 형식의 목적이 다르다(ARCHITECTURE §11).

| 형식 | 목적 | PRD 요구 |
|---|---|---|
| PDF | 사람이 읽고 인쇄하는 악보 | 제목·음자리표·마디·박자·조표·현재 음표가 읽히는 인쇄용 |
| MIDI | 다른 프로그램에서 소리로 재생 | 울리는 음높이·이벤트 시각·템포 보존 |
| MusicXML | 다른 악보 프로그램에서 편집 | 지원하는 기보 구조(조표·박자·음 철자) 보존 |

- 포함: 세 형식 내보내기, 파일 이름·다운로드, 표현 불가 내용의 명확한 오류, 독립 도구 검사, 편집기 출력 버튼.
- 제외(PRD 그대로): **MusicXML·MIDI 가져오기**(확정 MVP 밖), 다성·반주, 가사·코드 기호, 셋잇단, 서버 변환.
- JSON 백업은 그대로 둔다. 표준 출력의 대체물이 아니고, 출력도 JSON을 대체하지 않는다.

## 2. 유지하는 계약

- 출력은 canonical Score의 **읽기 전용 projection**이다. Score·저장·Undo 이력을 바꾸지 않는다(ARCHITECTURE §1·§11).
- 연습 속도·A–B 반복·라벨 미리보기·선택·후보는 출력에 넣지 않는다. MIDI 템포는 항상 Score 원래 템포다(ADR-004, PRD MVP-008 수용 기준).
- 기보 불가 길이는 조용히 근사하지 않는다(H-02). PDF·MusicXML은 같은 정확 분해(`decomposeNotationDuration`, `planPartNotation`)를 쓰고,
  실패하면 무엇을 고쳐야 하는지 알려 주며 파일을 만들지 않는다. MIDI는 tick이 정확하므로 기보 불가 길이도 그대로 낸다.
- 타이는 기존 `Part.ties`·`mergeTiedNotes`를 그대로 쓴다. 음 철자는 Pitch의 step/alter/octave를 그대로 쓴다.
- Domain은 바이트·XML·DOM을 만들지 않는다. 형식별 생성기는 adapter(`src/adapters/midi`, `musicxml`, PDF는 인쇄 화면)에 둔다(ARCHITECTURE §4).
- 새 런타임 의존성은 결정 1에서 승인한 것만 쓴다. 기본안은 **의존성 없음**.

## 3. 형식별 설계 요점

### 3.1 MIDI
- Standard MIDI File type 1, division **960 ticks/4분음표**(Score PPQ와 같아 변환이 없다). 트랙 0: 템포·박자·조표 meta. Part마다 트랙 1개.
- 음 길이는 Score 길이 그대로(재생의 gate 0.9는 소리 내기 정책일 뿐 출력에 넣지 않는다). 타이 체인은 음 하나로 합친다.
- velocity는 이벤트 값, 채널은 Part 순서, 악기는 피아노(program 0).

### 3.2 MusicXML
- MusicXML **4.0 partwise**, 비압축 `.musicxml`. `divisions` 960. 첫 마디에 조표(`fifths`·`mode`)·박자·음자리표, 템포는 `<sound tempo>`.
- 음표·쉼표는 H-02 정확 분해로 `type`·`dot`를 정하고, 한 이벤트의 여러 조각은 `<tie>`/`<tied>`로 잇는다. 마디를 넘는 음은 `Part.ties`.
- 이벤트 사이 빈 구간(gap)은 결정 5를 따른다.

### 3.3 PDF
- 결정 1의 기본안: **인쇄 전용 화면**(`/print/[scoreId]`)에서 A4 페이지 단위로 VexFlow를 다시 배치하고, 브라우저의 "인쇄 → PDF로 저장"을 쓴다.
  현재 편집 화면의 SVG를 그대로 PDF라고 하지 않는다(Phase 3 마스터 플랜 §2.4). 페이지 경계 타이, 제목·템포 머리글, 페이지 번호.
- 자동 검사는 Playwright Chromium의 `page.pdf()`로 PDF를 만들고 `pdfinfo`·`pdftotext`로 페이지 수·제목을 확인한다.

## 4. 결정 (D-03, 2026-11-13 사용자 승인 — 권고안 그대로)

| # | 결정 | 권고안 | 대안과 비용 |
|---|---|---|---|
| 1 | PDF 만드는 방법 | 인쇄 전용 화면 + 브라우저 "PDF로 저장". **새 의존성 없음** | PDF 라이브러리(jsPDF+svg2pdf 등)로 파일 직접 생성: 새 의존성, 한글 제목용 글꼴 내장(수 MB), 승인 필요 |
| 2 | 용지 | A4 세로 하나 | Letter 추가는 선택 UI와 시험이 늘어난다 |
| 3 | 여러 Part | MIDI·MusicXML은 **모든 Part**, PDF는 첫 Part만 + "다른 파트 N개는 인쇄에 포함되지 않습니다" 안내 | PDF 다중 Part는 세로 정렬 시스템 배치가 필요해 범위가 크다. 지금 UI로는 Part를 만들 수 없고 JSON 가져오기로만 생긴다 |
| 4 | MIDI 세부 | §3.1 그대로(type 1, 960, 원래 템포, 전체 길이, 타이 합침) | type 0은 단일 트랙이라 Part 구분이 사라진다 |
| 5 | MusicXML 빈 구간 | `<forward>`로 시간만 진행(쉼표 기호를 새로 만들지 않음) | 보이지 않는 쉼표(`print-object="no"`) 또는 보이는 쉼표로 채우기: 편집 화면과 모양이 달라진다 |
| 6 | 라벨 | PDF는 현재 라벨 설정(없음/음이름/계이름)을 따른다. MusicXML·MIDI에는 넣지 않는다 | MusicXML에 가사로 넣으면 다른 프로그램에서 가사로 오해된다 |
| 7 | 독립 검사 | MusicXML: 공식 4.0 XSD로 `xmllint` 검증(XSD를 tests/fixtures에 둔다, W3C Community 라이선스 확인 후). MIDI: 생성기와 별도로 작성한 테스트용 최소 파서 + 수동 UAT에서 실제 프로그램으로 열기. PDF: `pdfinfo`·`pdftotext` | MuseScore 등 설치형 도구는 이 Mac에 없다. 설치는 사용자 결정 |
| 8 | 파일 이름 | JSON 백업과 같은 규칙(NFC, 금지 문자 `_`, 80자, 빈 제목은 `score`) + `.mid` / `.musicxml` / `.pdf` | — |

권고안에 없는 세부(meta 이벤트 순서, XML 들여쓰기 등)는 구현 기본값으로 정하고 해당 작업 기록에 "구현 기본값"으로 적는다.

## 5. 위험

| 위험 | 대응 |
|---|---|
| 기보 불가 길이(H-02) 악보의 PDF·MusicXML | 같은 정확 분해를 쓰고 실패 시 명확한 오류. MIDI는 그대로 가능 |
| 다른 프로그램의 MusicXML 해석 차이 | XSD 검증은 형식만 보장한다. 실제 열기는 수동 UAT(UAT-X)에서 확인 |
| 인쇄 화면의 브라우저별 차이(여백·배율·글꼴) | Chromium 자동 검사 + Safari·iPhone 인쇄는 수동 UAT |
| 긴 악보 인쇄 화면 성능 | H-03 기준(256마디)까지 Chromium에서 측정 |
| 공개 시험 주소가 오래된 코드 | UAT 전에 재배포 필요(배포는 사용자 승인 대상) |

## 6. 검증

- 작업마다 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run check:architecture`, `npm run build`, UI 변경 시 전체 `npm run test:e2e`.
- 수동 UAT-X(새로 추가 예정): MuseScore·GarageBand 등에서 MIDI/MusicXML 열기, 실제 프린터·iPhone 인쇄. 미실행은 NOT RUN.

## 7. 범위 밖

MusicXML/MIDI 가져오기, 다중 Part PDF, Letter 용지, 압축 `.mxl`, 서버 변환, Phase 6(통합·접근성·배포 준비)은 이 계획에 포함하지 않는다.

## 8. 인수 요약 (2026-11-13, Claude Code)

| 작업 | 결과 | 주요 위치 |
|---|---|---|
| P5-01 출력 계약 | `ExportPort`·`exportScore`·`exportFileName`(JSON 백업과 공유), 다운로드 adapter 일반화 | `src/application/export.ts`, `ports.ts`, `src/adapters/file-export/download.ts` |
| P5-02·03 MIDI | SMF type 1·960, 독립 테스트 파서로 fixture 왕복 | `src/adapters/midi`, `tests/fixtures/smf-reader.ts` |
| P5-04·05 MusicXML | 4.0 partwise, 공식 XSD(무수정 사본+카탈로그)로 `xmllint` 검증·XPath 되읽기 | `src/adapters/musicxml`, `tests/fixtures/musicxml-4.0/` |
| P5-06 인쇄 화면 | `/print/[scoreId]` 읽기 전용, 줄 단위 SVG·A4·페이지 번호, Chromium PDF 검사 | `src/adapters/vexflow/printRows.ts`, `src/features/export/PrintView.tsx` |
| P5-07 출력 UI | 편집기 "내보내기": PDF(저장 후 새 탭)·MIDI·MusicXML, 오류 안내 | `src/features/export/ExportControls.tsx` |
| P5-08 통합 | 입력→편집→조옮김→연습 속도·라벨→세 형식 출력, 저장·이력 불변 | `tests/e2e/phase5-integration.spec.ts` |

구현 기본값(사용자 별도 결정 아님, 바꾸려면 알려 주면 된다):
- MIDI: velocity 0은 1로 쓴다(0은 note-off로 읽히므로). note-off는 0x80·64, 같은 tick이면 끝음을 먼저. 채널은 Part 순서이며 10번(드럼) 건너뜀. 트랙 끝은 마지막 마디 끝.
- MusicXML: `<accidental>` 생략(읽는 프로그램이 `<alter>`와 조표로 계산), Part id `P1..Pn`, 빈 마디는 비워 두고 음이 있는 마디는 끝까지 `<forward>`, velocity 미기록, XML에 쓸 수 없는 제어문자는 제거.
- 인쇄: 첫 Part를 편집 화면과 같은 렌더러로 그려 4마디 줄 단위로 나누고, 모든 줄을 같은 배율로 A4 폭에 맞춘다. 페이지 번호는 CSS `@page` 여백 상자(Chromium 확인, Safari 미확인).
- PDF는 **저장된 내용**을 인쇄한다(편집기에서 저장 후 새 탭). 저장 충돌·삭제 상태에서는 PDF 버튼을 끄고, MIDI·MusicXML·JSON은 화면의 현재 내용으로 받을 수 있다.
- 브라우저 "PDF로 저장"의 기본 파일 이름은 문서 제목(= JSON 백업 규칙의 이름)이다. 실제 저장 대화상자 이름은 브라우저마다 다를 수 있다(UAT-X).
