# 악보 올리기 1·2단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MusicXML(`.musicxml`/`.xml`/`.mxl`) 파일 하나를 올려 한 줄 선율 악보를 새로 만드는 `/import` 흐름과 홈의 세 번째 시작("악보 올리기")을 만든다.

**Architecture:** zip 읽기(`DecompressionStream`)와 XML 읽기(작은 요소 인터페이스 위에서 동작)는 adapter, 앱 독립 중간 표현 → 선율 추출은 순수 Domain 함수, 악보 짓기는 기존 `buildTranscribedScore`(빈 악보 + `PasteEvents`)를 재사용하는 application 함수, 화면은 `/record`와 같은 단계형 feature.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest(node 환경), Playwright(Chromium). 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-16-score-import-design.md` (구현자는 이 계획과 함께 읽는다)

## Global Constraints

- 새 런타임·개발 의존성 없음. 저장 형식(Score schemaVersion 3)·Command·Undo·IndexedDB 계약 변경 없음.
- Domain(`src/domain/**`)은 브라우저 API(`DOMParser`, `DecompressionStream`, `File`)를 쓰지 않는다(`npm run check:architecture`).
- 파일은 기기 밖으로 보내지 않고, 원본 파일은 저장하지 않는다. 만든 악보만 저장소 `create` 한 번.
- 상한: 파일 5 MB, `.mxl` 압축 해제 합계 20 MB, zip 항목 200. 템포 기본 90, 범위 20–400. 제목 120자. 반올림 격자 240 tick(16분음표, 4분음표 = 960 tick).
- 화면 문구·보고는 한국어. 내용을 말없이 버리거나 바꾸지 않는다(모든 손실·변경은 보고 항목).
- 검증: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run check:architecture`, `npm run build`, `npm run test:e2e`. 테스트 삭제·skip·기대값 약화 금지.
- 커밋은 사용자 요청이 있을 때만 한다(프로젝트 규칙). 아래 "Commit" 단계는 사용자가 커밋을 맡긴 경우에만 실행하고, 아니면 건너뛰고 변경을 남긴다.

## Review Focus

1. 피아노 악보의 오른손에 두 성부(voice 1·2)가 동시에 있는 경우 — 높은 음이 남고 낮은 성부 음은 잘리거나 버려지며, 버린 수가 보고된다. (Task 3 `extract keeps the higher voice when two voices overlap in the upper staff`)
2. `divisions`가 마디 중간에 바뀌는 파일 — 이후 음의 시작·길이가 새 divisions로 계산된다. (Task 2 `divisions change mid-part`)
3. 앱이 내보낸 25현 큰보표 MusicXML을 다시 올리기 — 두 단이 겹치지 않으므로 모두 합쳐 원래 선율과 같아진다. (Task 4 `round trip of an exported grand-staff score`)
4. `.mxl` 안에 `META-INF/container.xml`이 없거나 rootfile이 가리키는 항목이 없음 — 첫 `.musicxml`/`.xml`로 대체하거나 명확한 오류. (Task 1 `falls back to the first score entry without container.xml`)
5. 같은 버튼 두 번 누르기("악보 만들기") — 악보가 하나만 생긴다. (Task 5 E2E `dblclick creates one score`)

---

### Task 1: `.mxl` zip 읽기

**Files:**
- Create: `src/adapters/file-import/zip.ts`, `src/adapters/file-import/index.ts`
- Create: `tests/fixtures/zip.ts` (테스트용 zip 만들기: `node:zlib` `deflateRawSync`, 로컬 헤더 + 중앙 디렉터리 + EOCD)
- Test: `tests/unit/import-zip.test.ts`

**Interfaces:**
- Produces:
  - `readZip(bytes: Uint8Array, limits?: { maxEntries: number; maxTotalBytes: number }): Promise<Map<string, Uint8Array>>` — 기본 limits `{ maxEntries: 200, maxTotalBytes: 20 * 1024 * 1024 }`.
  - `class ZipReadError extends Error { code: "NOT_ZIP" | "UNSUPPORTED_ZIP" | "TOO_LARGE" | "CORRUPT" }`
  - `findMusicXmlEntry(entries: Map<string, Uint8Array>): string | null` — `META-INF/container.xml`의 첫 `rootfile full-path`가 있으면 그것(항목이 존재할 때), 아니면 `META-INF/` 밖 첫 `.musicxml`/`.xml`(이름순). container 파싱은 `full-path="..."` 정규식으로(DOM 불필요).
- Test helper: `makeZip(files: { name: string; data: string | Uint8Array; method?: 0 | 8 }[]): Uint8Array`

- [ ] **Step 1: Write the failing tests** — `import-zip.test.ts`:
  - `reads stored and deflated entries`: `makeZip([{name:"a.txt",data:"hi",method:0},{name:"b.txt",data:"x".repeat(5000),method:8}])` → `readZip` 결과 두 항목의 디코딩 문자열이 원본과 같다.
  - `rejects non-zip bytes`: `new TextEncoder().encode("<score-partwise/>")` → `ZipReadError` code `"NOT_ZIP"`.
  - `rejects too many entries / too large`: limits `{maxEntries:1,...}`로 2항목 → `"TOO_LARGE"`; `{maxTotalBytes:10}`로 5000바이트 항목 → `"TOO_LARGE"`.
  - `rejects encrypted and zip64`: 일반 플래그 비트 0 설정 → `"UNSUPPORTED_ZIP"`; 크기 필드 `0xFFFFFFFF` → `"UNSUPPORTED_ZIP"`.
  - `finds the rootfile from container.xml` / `falls back to the first score entry without container.xml` / `returns null when no score entry`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/import-zip.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `zip.ts`. EOCD를 끝에서 거꾸로 찾고(시그니처 `0x06054b50`), 중앙 디렉터리로 항목을 돈다. method 8은 `new Blob([slice]).stream().pipeThrough(new DecompressionStream("deflate-raw"))`로 풀고, 풀면서 누적 크기가 `maxTotalBytes`를 넘으면 즉시 `TOO_LARGE`. 디렉터리 항목(`/`로 끝남)은 건너뛴다.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): read .mxl zip archives without a dependency`

---

### Task 2: MusicXML 읽기 → 중간 표현

**Files:**
- Create: `src/domain/score/import-model.ts` (중간 표현 타입만, Domain)
- Create: `src/adapters/musicxml/reader.ts`, `src/adapters/musicxml/dom.ts`; Modify: `src/adapters/musicxml/index.ts`(export 추가)
- Create: `tests/fixtures/xml-lite.ts` (테스트 전용 작은 XML 파서: 요소·속성·텍스트·주석·`<?xml?>`·`<!DOCTYPE>` 무시, 엔티티 `&lt; &gt; &amp; &quot; &apos;`)
- Create: `tests/fixtures/musicxml-import/` — `simple-melody.musicxml`(단선율 4마디, 4/4, G장조, 템포 100, work-title "아리랑 연습"), `piano-two-staves.musicxml`(오른손 화음·두 성부, 왼손 반주, `<backup>`, 2마디째 divisions 변경), `odd-rhythm.musicxml`(셋잇단 8분 3개, 꾸밈음 1개, 큐 음 1개), `pickup-and-changes.musicxml`(못갖춘마디 1박, 3마디째 3/4로 박자 변경, 조 변경, dorian, 템포 변화, 도돌이표, 가사, 셈여림). 모두 직접 작성한 짧은 곡(저작권 없음).
- Test: `tests/unit/musicxml-reader.test.ts`

**Interfaces:**
- Produces (Domain `import-model.ts`):
  ```ts
  export interface ImportedPitch { step: DiatonicStep; alter: number; octave: number }
  export interface ImportedNote {
    measureNumber: string; startTick: number; durationTicks: number; // ticks at 960/quarter, may be fractional
    pitch: ImportedPitch | null; // null = rest
    staff: number; voice: string; chord: boolean; grace: boolean; cue: boolean; tieStart: boolean; tieStop: boolean;
  }
  export interface ImportedMeasure { number: string; startTick: number; lengthTicks: number; implicit: boolean }
  export interface ImportedPart {
    id: string; name: string; staves: number; notes: ImportedNote[]; measures: ImportedMeasure[];
    timeSignatures: { tick: number; numerator: number; denominator: number }[];
    keys: { tick: number; fifths: number; mode: string | null; nonStandard: boolean }[];
  }
  export interface ImportedScore {
    title: string | null; tempos: { tick: number; bpm: number }[]; parts: ImportedPart[];
    ignored: { repeats: number; lyrics: number; directions: number };
  }
  ```
  (`directions` = 셈여림·아티큘레이션·코드 기호 등 가져오지 않는 표시 수)
- Produces (adapter):
  - `interface XmlElementLike { readonly tagName: string; getAttribute(name: string): string | null; readonly children: ArrayLike<XmlElementLike>; readonly textContent: string | null }`
  - `readMusicXml(root: XmlElementLike): { ok: true; score: ImportedScore } | { ok: false; code: "NOT_MUSICXML" | "TIMEWISE" | "NO_PARTS"; message: string }`
  - `dom.ts`: `parseXmlText(text: string): XmlElementLike | null` — 브라우저 `DOMParser("application/xml")`, `parsererror`면 null.
  - `decodeXmlBytes(bytes: Uint8Array): string | null` — UTF-8, UTF-16 LE/BE(BOM)만; 그 밖의 `encoding="..."` 선언이면 null.

- [ ] **Step 1: Write the failing tests** — `musicxml-reader.test.ts` (`xml-lite`로 파싱해 `readMusicXml`에 넘김):
  - `reads title, tempo, time and key`: simple-melody → `title "아리랑 연습"`, `tempos[0].bpm 100`, `timeSignatures[0] {4,4}`, `keys[0] {fifths 1, mode "major"}`, 첫 음 `{startTick 0, durationTicks 960, pitch {G,0,4}}`.
  - `backup and chords place notes in time`: piano-two-staves → 왼손 첫 음 `staff 2, startTick 0`; 화음 둘째 음 `chord true`이고 첫 음과 같은 `startTick`.
  - `divisions change mid-part`: 2마디 첫 음 `startTick 3840`, 길이가 새 divisions 기준으로 960.
  - `marks grace, cue, tuplets and ties`: odd-rhythm → grace 1·cue 1, 셋잇단 길이 `320`(분수 아님 확인), 붙임줄 start/stop.
  - `records pickup, changes and ignored marks`: pickup-and-changes → `measures[0].implicit true, lengthTicks 960`, 박자 변경 `{tick: …, 3, 4}`, 두 번째 key, `mode "dorian"`, tempos 2개, `ignored.repeats ≥ 1, lyrics ≥ 1, directions ≥ 1`.
  - `rejects timewise and non-musicxml`: `<score-timewise>` → `TIMEWISE`; `<html>` → `NOT_MUSICXML`; 파트 없음 → `NO_PARTS`.
  - `decodeXmlBytes`: UTF-8 그대로, UTF-16LE BOM 해석, `encoding="Shift_JIS"` → null.
- [ ] **Step 2: Run** `npx vitest run tests/unit/musicxml-reader.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `reader.ts`: 파트마다 커서 tick을 들고 `note`(chord면 커서 전진 없음)·`backup`·`forward`를 따라간다. tick = `duration * 960 / divisions`. `grace`는 길이 0으로 기록. `measure@implicit="yes"`와 `attributes/time`·`key`(`key-step` 방식이면 `nonStandard true`)·`sound@tempo`(없으면 `metronome/per-minute`, 4분음표 단위일 때만)를 수집. 제목은 `work/work-title` → `movement-title`. `staves` 기본 1.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): read MusicXML into a neutral import model`

---

### Task 3: 선율 추출 (Domain)

**Files:**
- Create: `src/domain/score/melody-extract.ts`; Modify: `src/domain/score/index.ts`(export)
- Test: `tests/unit/melody-extract.test.ts` (Task 2의 fixture를 `xml-lite` + `readMusicXml`로 읽어 입력으로 쓴다)

**Interfaces:**
- Consumes: Task 2 `ImportedScore`, `ImportedPart`.
- Produces:
  ```ts
  export type ImportNoticeCode =
    | "LOWER_STAFF_DROPPED" | "CHORD_NOTES_DROPPED" | "OVERLAP_TRUNCATED" | "ROUNDED_TO_GRID" | "DROPPED_ZERO_LENGTH"
    | "GRACE_DROPPED" | "CUE_DROPPED" | "PITCH_UNSUPPORTED" | "TIME_SIGNATURE_CHANGED" | "KEY_CHANGED" | "MODE_AS_MAJOR"
    | "TEMPO_CLAMPED" | "TEMPO_CHANGED" | "PICKUP_PADDED" | "REPEATS_IGNORED" | "LYRICS_IGNORED" | "DIRECTIONS_IGNORED";
  export interface ImportNotice { code: ImportNoticeCode; count: number; measures: string[]; detail?: string } // detail: e.g. mode name
  export interface MelodySettings { title: string; tempoBpm: number; timeSignature: TimeSignature; keySignature: KeySignature }
  export type MelodyExtraction =
    | { ok: true; settings: MelodySettings; clipboard: ClipboardPayload; notices: ImportNotice[]; noteCount: number;
        parts: { index: number; name: string; noteCount: number }[]; partIndex: number }
    | { ok: false; code: "NO_NOTES" | "UNSUPPORTED_KEY" | "UNSUPPORTED_TIME" | "TOO_LONG"; message: string };
  export function extractMelody(score: ImportedScore, options?: { partIndex?: number; fallbackTitle?: string }): MelodyExtraction;
  export const IMPORT_GRID_TICKS = 240;
  ```
- Rules (spec §5.2–5.4, exact):
  - 기본 파트 = 음(쉼표·grace·cue 제외)이 있는 첫 파트.
  - 두 단 이상: 모든 단의 음을 합쳤을 때 시간이 겹치는 두 음이 하나도 없으면 전부 사용, 아니면 `staff 1`만(나머지 단의 음 수로 `LOWER_STAFF_DROPPED`, measures = 해당 마디 번호).
  - grace → `GRACE_DROPPED`, cue → `CUE_DROPPED`, 쉼표는 버림(보고 안 함).
  - 붙임줄: 같은 음높이 tieStart→tieStop을 한 음으로 합침(길이 합).
  - 반올림: 시작·끝을 240의 배수로 반올림(`Math.round`). 바뀐 음 → `ROUNDED_TO_GRID`; 길이 0이 되면 버림 → `DROPPED_ZERO_LENGTH`.
  - skyline: 시작 tick 순, 같은 시작이면 높은 음 하나만 남김(나머지 `CHORD_NOTES_DROPPED`, chord 플래그와 무관하게 같은 시작 동시음 모두 포함). 앞 음이 다음 음의 시작 뒤까지 울리면: 다음 음이 더 높거나 같으면 앞 음을 다음 시작에서 자름(`OVERLAP_TRUNCATED`), 더 낮으면 다음 음을 앞 음 끝까지 미루고 남는 길이가 0이면 버림(`OVERLAP_TRUNCATED`).
  - 음높이: `createPitch`가 받지 않거나 MIDI 0–127 밖이면 버림 → `PITCH_UNSUPPORTED`.
  - 박자: 첫 박자표. `validateScore`의 박자 규칙(분자 ≥ 1 정수, 분모가 지원 목록)을 어기면 `UNSUPPORTED_TIME`. 두 번째 박자표부터 `TIME_SIGNATURE_CHANGED`(measures = 바뀐 마디).
  - 조: 첫 key. `nonStandard`이거나 fifths ∉ [−7, 7]이면 `UNSUPPORTED_KEY`. mode가 null/"major"/"minor"가 아니면 장조로 두고 `MODE_AS_MAJOR`(detail = mode). 이후 key → `KEY_CHANGED`. `KeySignature`는 `KEY_SIGNATURE_OPTIONS`에서 찾는다.
  - 템포: 첫 tempo(없으면 90). [20, 400]으로 반올림·자르고 바뀌면 `TEMPO_CLAMPED`. 두 번째 이후 → `TEMPO_CHANGED`.
  - 못갖춘마디: 첫 마디 `implicit` 또는 `lengthTicks < 한 마디`면 모든 음을 `한 마디 − lengthTicks`만큼 뒤로 민다 → `PICKUP_PADDED`.
  - `ignored` 수가 0보다 크면 `REPEATS_IGNORED` / `LYRICS_IGNORED` / `DIRECTIONS_IGNORED`.
  - 제목: score.title → `options.fallbackTitle` → "가져온 악보", trim 후 120자.
  - 결과 음이 0개 → `NO_NOTES`. 필요한 마디 수 > `MAX_NOTATION_MEASURES` → `TOO_LONG`.
  - clipboard: `lengthTicks` = 마지막 음 끝을 마디 길이 배수로 올림; 이벤트는 `createNoteEvent({ id: \`import-${n}\`, …, provenance: { source: "import" } })`; `ties: []`(마디선 분할은 PasteEvents가 한다).

- [ ] **Step 1: Write the failing tests** — `melody-extract.test.ts`:
  - `simple melody comes through unchanged`: simple-melody → notices `[]`, settings `{title "아리랑 연습", tempoBpm 100, 4/4, G major}`, 음 수·첫 음 일치.
  - `piano keeps the upper staff and the top of each chord`: piano-two-staves → `LOWER_STAFF_DROPPED` count = 왼손 음 수, `CHORD_NOTES_DROPPED` count = 화음 아래 음 수, 남은 음은 각 시점의 최고음.
  - `extract keeps the higher voice when two voices overlap in the upper staff` (Review Focus 1).
  - `merges a staff split when staves never overlap`: 두 단이 겹치지 않는 fixture(Task 4 왕복 fixture와 같은 모양을 인라인으로) → `LOWER_STAFF_DROPPED` 없음, 모든 음 유지.
  - `rounds tuplets to sixteenths and drops grace and cue`: odd-rhythm → `ROUNDED_TO_GRID`, `GRACE_DROPPED 1`, `CUE_DROPPED 1`, 모든 시작·길이가 240 배수.
  - `pads the pickup and reports changes`: pickup-and-changes → `PICKUP_PADDED`, `TIME_SIGNATURE_CHANGED`(measures에 바뀐 마디), `KEY_CHANGED`, `MODE_AS_MAJOR` detail "dorian", `TEMPO_CHANGED`, `REPEATS_IGNORED`, `LYRICS_IGNORED`, `DIRECTIONS_IGNORED`; 첫 음 startTick = 3840 − 960.
  - `clamps tempo`: tempo 600 → 400 + `TEMPO_CLAMPED`.
  - `rejects unsupported keys and empty parts`: fifths 8 → `UNSUPPORTED_KEY`; 음 없는 파트만 → `NO_NOTES`.
  - `part choice`: 두 파트 score에서 `partIndex: 1` → 둘째 파트 음; `parts` 목록에 이름·음 수.
- [ ] **Step 2: Run** `npx vitest run tests/unit/melody-extract.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `extractMelody` per Rules.
- [ ] **Step 4: Run** — Expected: PASS. Also `npm run check:architecture` — Expected: 위반 0.
- [ ] **Step 5: Commit** `feat(import): extract one melody line from imported MusicXML`

---

### Task 4: application — 파일 읽기와 악보 짓기

**Files:**
- Create: `src/application/score-import.ts`; Modify: `src/application/index.ts`
- Test: `tests/unit/score-import.test.ts`

**Interfaces:**
- Consumes: Task 1 `readZip`, `findMusicXmlEntry`, `ZipReadError`; Task 2 `readMusicXml`, `decodeXmlBytes`, `XmlElementLike`; Task 3 `extractMelody`, `MelodyExtraction`, `MelodySettings`; 기존 `buildTranscribedScore`, `analyzeInstrumentFit`, `transposeScore`, `validateScore`, `planPartNotation`, `ScoreRepository`.
- Produces:
  ```ts
  export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
  export type ScoreFileReadResult =
    | { ok: true; imported: ImportedScore; fileTitle: string }
    | { ok: false; message: string };
  export function readScoreFile(file: { name: string; bytes: Uint8Array },
    parseXml: (text: string) => XmlElementLike | null): Promise<ScoreFileReadResult>;
  export interface ImportedScoreInput {
    id: string; createdAt: string; settings: MelodySettings; clipboard: ClipboardPayload;
    instrument: InstrumentId; transpose: TransposeSpec | null; nextId: () => string;
  }
  export function buildImportedScore(input: ImportedScoreInput): { ok: true; score: Score } | { ok: false; message: string };
  export function createImportedScore(repository: ScoreRepository, input: ImportedScoreInput): Promise<Score>;
  ```
  (`readScoreFile`는 `parseXml`을 주입받는다 — 앱은 Task 2 `parseXmlText`, 테스트는 `xml-lite`.)
- Rules: 확장자 `.mxl`이거나 앞 4바이트가 `PK\x03\x04`면 zip 경로. 크기 > `IMPORT_MAX_FILE_BYTES` → 거절. `fileTitle` = 파일 이름에서 확장자 뺀 것. 오류 문구(정확히): 크기 "파일이 너무 큽니다(최대 5MB).", zip "압축 악보(.mxl)를 열 수 없습니다.", 인코딩 "지원하지 않는 글자 인코딩입니다. UTF-8로 저장한 MusicXML을 올려 주세요.", 파싱 실패 "MusicXML 파일로 읽을 수 없습니다.", `TIMEWISE` "지원하지 않는 MusicXML 형식(score-timewise)입니다.", `NO_PARTS` "악보에 파트가 없습니다.".
- `buildImportedScore`: `buildTranscribedScore({ id, createdAt, setup: { ...settings, instrument }, clipboard, nextId })` → 피아노·12현이면 `analyzeInstrumentFit(score, instrument).suggestedClef`로 clef 교체(없으면 그대로) → `transpose`가 있으면 `transposeScore` 결과 사용(실패면 `{ok:false}` + 한국어 사유) → `validateScore`·`planPartNotation` 통과 확인. `createImportedScore`는 build 후 `repository.create` 한 번(실패 시 throw, 아무것도 쓰지 않음).

- [ ] **Step 1: Write the failing tests** — `score-import.test.ts`:
  - `reads a .musicxml file`: simple-melody bytes → ok, `fileTitle "simple-melody"`.
  - `reads the same score from .mxl`: `makeZip`로 container.xml + score.musicxml → 같은 `imported`.
  - `rejects big, broken and unknown files` with the exact messages above.
  - `builds a 25-string score in B♭ major`: simple-melody 추출 → `instrument "gayageum-25"`, `transpose { kind: "targetKey", targetKey: B♭ major, direction: "nearest" }` → 파트 instrument·keySignature fifths −2, `validateScore` `[]`.
  - `uses the suggested clef for a low piano melody`: C3 위주 선율 → clef "bass".
  - `round trip of an exported grand-staff score` (Review Focus 3): 25현 Score(C4 위·아래 섞인 선율) → `writeMusicXml` → `readScoreFile`(`xml-lite`) → `extractMelody` → 음 목록(midi·start·duration)이 원본과 같고 `LOWER_STAFF_DROPPED` 없음.
  - `createImportedScore writes once and nothing on failure`: MemoryScoreRepository 크기 1; 검증 실패 입력이면 0.
- [ ] **Step 2: Run** `npx vitest run tests/unit/score-import.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `score-import.ts`.
- [ ] **Step 4: Run** — Expected: PASS; `npm run test`, `npm run check:architecture` 통과.
- [ ] **Step 5: Commit** `feat(import): read score files and build the imported score`

---

### Task 5: `/import` 화면과 홈 세 번째 시작

**Files:**
- Create: `src/app/import/page.tsx`, `src/app/import/layout.tsx`(`metadata.title = "악보 올리기"`, `/record/layout.tsx`와 같은 방식)
- Create: `src/features/score-import/ImportFlow.tsx`, `src/features/score-import/notices.ts`, `src/features/score-import/index.ts`
- Modify: `src/features/audio-recording/take.tsx` — `TakeStepList`에 선택 prop `steps?: readonly string[]`(기본 `TAKE_STEPS`); export 유지
- Modify: `src/app/page.tsx` — 시작 링크 3개(허밍으로 시작 `/record`, 피아노로 시작 `/new`, 악보 올리기 `/import`)
- Test: `tests/e2e/import-flow.spec.ts`; Modify: `tests/e2e/home.spec.ts`(세 번째 링크)

**Interfaces:**
- Consumes: Task 2 `parseXmlText`; Task 3 `extractMelody`, `ImportNotice`; Task 4 `readScoreFile`, `buildImportedScore`, `createImportedScore`; 기존 `StaffView`, `PlaybackControls`, `selectableInstruments`, `analyzeInstrumentFit`, `recommendTranspositions`, `KEY_SIGNATURE_OPTIONS`, `getScoreRepository`.
- Produces:
  - `describeImportNotice(notice: ImportNotice): string` (`notices.ts`) — 코드마다 한국어 한 줄, 마디 번호는 처음 5개 + "외 n곳". 예: `LOWER_STAFF_DROPPED` → "아래 단(왼손) 음 {count}개를 가져오지 않았습니다 ({measures}마디)", `MODE_AS_MAJOR` → "선법({detail})은 같은 조표의 장조로 표시했습니다".
  - `ImportFlow({ onCreate })` — `onCreate(input: Omit<ImportedScoreInput, "id" | "createdAt" | "nextId">): Promise<string | null>`(오류 문구 또는 null), `/record` 페이지와 같은 패턴.
- 화면 계약(E2E가 쓰는 이름):
  - 루트 `data-testid="import-flow"`, `data-step` ∈ `"file" | "review" | "convert"`; `TakeStepList steps={["파일","확인","바꾸기","만들기"]}`.
  - ① 파일 입력 `aria-label="악보 파일"`, `accept=".musicxml,.xml,.mxl"`; 끌어다 놓기 영역; 안내 "PDF·사진 인식은 준비 중입니다." 오류는 `role="alert"`.
  - ② 미리보기 `data-testid="import-preview"`(StaffView), `PlaybackControls`, 읽은 정보 `data-testid="import-summary"`(제목·템포·박자·조성·마디·음 수), 파트가 2개 이상이면 선택 상자 `aria-label="가져올 파트"`, 보고 목록 `data-testid="import-notices"`(항목 없으면 "원본 선율을 그대로 가져왔습니다."), 버튼 "다른 파일 고르기"·"다음".
  - ③ 제목 입력 `aria-label="제목"`, 악기 선택 `aria-label="목표 악기"`(selectableInstruments), 음역 요약 `data-testid="import-instrument-fit"`, 목표 조 `aria-label="목표 조"`(첫 항목 "원래 조 그대로" value `""`, 원곡과 같은 mode의 조), 방향 `aria-label="이동 방향"`, 추천 후보 버튼(편집기와 같은 규칙, 상위 5개, 이름 "{n}순위 {±d}반음 후보 적용"), 결과 미리보기 `data-testid="import-result"`, 버튼 "이전"·"악보 만들기"(누르는 동안 비활성).
  - 한 번 누르면 악보 하나, `/editor/{id}`로 이동.

- [ ] **Step 1: Write the failing E2E** — `import-flow.spec.ts` (fixture는 `tests/fixtures/musicxml-import/`, `setInputFiles`):
  - `home offers three starts`: 홈에 링크 "허밍으로 시작"·"피아노로 시작"·"악보 올리기", 마지막은 `/import`.
  - `piano score → 12현 산조 in a key that fits, one score`: piano-two-staves 올리기 → ② `import-notices`에 "아래 단(왼손)" 포함 → 다음 → 목표 악기 12현 산조 → 1순위 후보 적용 → `import-instrument-fit`에 "모든 음이 음역 안" → "악보 만들기" **dblclick**(Review Focus 5) → `/editor/…`, 저장된 악보 수 +1, 저장 악보 `parts[0].instrument === "gayageum-12-sanjo"`.
  - `B♭ major on the piano`: simple-melody → 목표 조 `selectOption("major:-2")`(라벨 "Bb 장조") → 만들기 → 저장 악보 keySignature fifths −2.
  - `.mxl works and a broken file explains itself`: `.mxl`(테스트에서 `makeZip`으로 만든 버퍼를 `setInputFiles({ name, mimeType, buffer })`) → ②로 진행; `broken.musicxml`(잘린 XML) → `role=alert` "MusicXML 파일로 읽을 수 없습니다.", 단계는 file 그대로.
  - `leaving creates nothing`: ②·③에서 홈으로 나가면 저장된 악보 수 그대로.
  - Modify `home.spec.ts`: 세 링크 확인 한 줄 추가.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/import-flow.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** 화면. UI는 `ui-craft` 규칙과 기존 `/record` 토큰(`hb-*` 클래스, `takeCard`)을 따른다. 파일 읽기는 `file.arrayBuffer()` → `readScoreFile(..., parseXmlText)` → `extractMelody(imported, { partIndex, fallbackTitle: fileTitle })`. ③ 미리보기는 `buildImportedScore`를 id `"preview"`로 호출(저장 안 함). `TakeStepList` `steps` prop 추가.
- [ ] **Step 4: Run** 위 명령 + `npx playwright test tests/e2e/home.spec.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): /import flow and a third start on the home page`

---

### Task 6: 전체 검증과 기록

**Files:**
- Modify: `docs/TASKS.md`(§61 Phase 8 1·2단계), `docs/TEST_PLAN.md`, `docs/MODULE_CONTRACTS.md`, `docs/PRD.md`(§ 화면 표에 `/import` 한 줄, "Not in MVP"의 다성부 분리는 "선율만 추출"로 범위 명시), `docs/MANUAL_UAT_CHECKLIST.md`(UAT-U: 실제 MusicXML(MuseScore 등에서 저장한 파일)·`.mxl`·피아노 악보 올리기 3항목, Mac Chrome·Safari)

- [ ] **Step 1: Run full validation** `npm run typecheck && npm run lint && npm run test && npm run check:architecture && npm run build && npm run test:e2e` — Expected: 모두 통과, E2E 기존 120 + 새 항목 PASS.
- [ ] **Step 2: Update docs** 위 파일에 실제 실행 결과(테스트 수)와 미검증(Safari·실기기, 외부 프로그램이 만든 실제 MusicXML 다양성)을 적는다.
- [ ] **Step 3: Commit** `docs: Phase 8 import steps 1–2 records`
