# DATA_MODEL.md — Canonical 음악 데이터 모델

- 작성일: 2026-11-07
- 작업 ID: P0-01
- 상태: Phase 0 확정 (schemaVersion = 1)
- 근거: `docs/ARCHITECTURE.md` §6, ADR-002, `docs/PHASE_0_PLAN.md` C-02·C-03·C-07

> 이 문서는 **하나의 정본 Score 모델**을 정의한다. 다른 레이어는 이 타입을 import 하며,
> 별도의 writable `Score`/`NoteEvent`/`Pitch`/`Measure` 모델을 만들지 않는다.
> 구현 위치: `src/domain/score/types.ts` (단일 정의), `src/domain/score/create.ts`, `validate.ts`.

## 1. 소유 관계

```text
Score
└─ parts: Part[]
   └─ measures: Measure[]        (index = 배열 위치, 0부터 연속)
      └─ events: ScoreEvent[]    (NoteEvent | RestEvent)
```

- Part는 조표·박자·음자리표를 소유한다(Phase 0은 전역 단일 조표/박자).
- Measure는 이벤트를 소유한다. 측정 단위는 **절대 tick**이다.
- NoteEvent는 `Pitch`(표기 + MIDI)와 provenance를 소유한다.

## 2. 시간 모델 (C-02 결정)

| 항목 | 결정 |
|---|---|
| 해상도 | **960 PPQ** (`TICKS_PER_QUARTER = 960`) |
| 위치 | **Score 시작부터의 절대 tick**. 마디 상대 tick을 별도로 저장하지 않는다 |
| 마디 길이 | `numerator * 960 * 4 / denominator` (예: 4/4 → 3840, 6/8 → 2880) |
| 마디 범위 | `[index * measureTicks, (index + 1) * measureTicks)` |
| 이벤트 제약 | Phase 0은 **마디를 넘는 이벤트(타이)를 지원하지 않는다** → 검증에서 거부 |
| 원본 녹음 시간 | Score에 저장하지 않는다. 채보 후보/런타임 데이터로 분리(Phase 4) |

단일 시간 모델만 존재한다. 마디 상대 tick이나 초 단위 필드를 Score에 추가하지 않는다.

## 3. 타입 요약

```ts
interface Score {
  id: string;
  schemaVersion: number;      // 현재 1
  title: string;
  tempoBpm: number;           // 20..400 정수
  parts: Part[];
  createdAt: string;          // ISO 8601
  updatedAt: string;
}

type Clef = "treble" | "bass";
type Mode = "major" | "minor";
type DiatonicStep = "C" | "D" | "E" | "F" | "G" | "A" | "B";

interface KeySignature { tonic: DiatonicStep; alter: number; mode: Mode; fifths: number }
interface TimeSignature { numerator: number; denominator: number }  // 분모 1|2|4|8|16|32

interface Part {
  id: string; name: string; clef: Clef;
  keySignature: KeySignature; timeSignature: TimeSignature;
  measures: Measure[];
}

interface Measure { id: string; index: number; events: ScoreEvent[] }

interface Pitch { midi: number; step: DiatonicStep; alter: number; octave: number }

interface NoteEvent {
  kind: "note"; id: string; pitch: Pitch;
  startTick: number; durationTicks: number; velocity: number;
  provenance?: { source: "piano" | "transcription" | "import" | "system"; confidence?: number };
}

interface RestEvent { kind: "rest"; id: string; startTick: number; durationTicks: number }

type ScoreEvent = NoteEvent | RestEvent;
```

`NoteEvent.kind`/`RestEvent.kind` 판별 필드로 union을 구분한다.

## 4. 불변식 (검증 코드)

`validateScore(score)` 가 반환하는 `ValidationIssue.code`:

| code | 규칙 |
|---|---|
| `UNSUPPORTED_SCHEMA` | `schemaVersion !== 1` |
| `INVALID_ID` | ID가 비어 있음 |
| `DUPLICATE_ID` | part/measure/event ID가 Score 전체에서 중복 |
| `INVALID_TEMPO` | `tempoBpm`이 20..400 정수 아님 |
| `EMPTY_PARTS` / `EMPTY_MEASURES` | part 또는 measures 비어 있음 |
| `MEASURE_INDEX_MISMATCH` | `measure.index !== 배열 위치` |
| `INVALID_CLEF` | treble/bass 아님 |
| `INVALID_TIME_SIGNATURE` | 분자 < 1 또는 분모 비지원 |
| `INVALID_KEY_SIGNATURE` | tonic/mode/fifths(−7..7) 위반 |
| `INVALID_POSITION` | `startTick` < 0 또는 정수 아님 |
| `INVALID_DURATION` | `durationTicks` ≤ 0 또는 정수 아님 |
| `INVALID_VELOCITY` | velocity 0..127 정수 아님 |
| `INVALID_PITCH` | step/octave(0..9)/alter(−2..2)/MIDI(0..127) 위반 |
| `PITCH_SPELLING_MISMATCH` | `midi !== midiFromSpelling(step, alter, octave)` |
| `EVENT_OUT_OF_MEASURE` | 이벤트가 소속 마디 범위를 벗어남(타이 미지원) |
| `OVERLAPPING_EVENTS` | 단선율 voice에서 이벤트가 겹침 |

## 5. 예시 JSON

```json
{
  "id": "score-1",
  "schemaVersion": 1,
  "title": "Test Score",
  "tempoBpm": 120,
  "createdAt": "2026-11-07T00:00:00.000Z",
  "updatedAt": "2026-11-07T00:00:00.000Z",
  "parts": [
    {
      "id": "score-1:part:1",
      "name": "Melody",
      "clef": "treble",
      "keySignature": { "tonic": "C", "alter": 0, "mode": "major", "fifths": 0 },
      "timeSignature": { "numerator": 4, "denominator": 4 },
      "measures": [
        {
          "id": "score-1:m:0",
          "index": 0,
          "events": [
            {
              "kind": "note",
              "id": "n1",
              "pitch": { "midi": 60, "step": "C", "alter": 0, "octave": 4 },
              "startTick": 0,
              "durationTicks": 960,
              "velocity": 96,
              "provenance": { "source": "system" }
            }
          ]
        }
      ]
    }
  ]
}
```

## 6. 버전 및 마이그레이션 정책 (C-07)

- 저장/불러오기/import 경계에서 `schemaVersion`을 확인한다.
- **미지원 버전은 거부하고 원본을 보존**한다(자동 변환·덮어쓰기 금지).
- 마이그레이션 함수는 구버전이 실제로 생길 때 추가한다. 현재 v1만 존재하므로
  "마이그레이션 검증 완료"를 주장하지 않는다.
- 손상 데이터는 검증 실패로 처리하고 사용자에게 오류를 알린다.

## 7. Phase 0 범위 밖 (명시)

- 마디를 넘는 타이·붙임줄, 다성부/다중 voice, 조표·박자 변경 지점, 임시표 자동 표기 최적화,
  붙임줄·이음줄 렌더링은 후속 Phase에서 계약을 확장한다(변경 시 승인 절차 필요).
