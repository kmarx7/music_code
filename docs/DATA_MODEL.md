# DATA_MODEL.md — Canonical 음악 데이터 모델

- 작성일: 2026-11-07
- 작업 ID: P0-01 / **P1-D (타이 확장)**
- 상태: Phase 1-D 갱신 (**schemaVersion = 2**)
- 근거: `docs/ARCHITECTURE.md` §6, ADR-002, **ADR-009**, `docs/PHASE_0_PLAN.md` C-02·C-03·C-07

> 이 문서는 **하나의 정본 Score 모델**을 정의한다. 다른 레이어는 이 타입을 import 하며,
> 별도의 writable `Score`/`NoteEvent`/`Pitch`/`Measure` 모델을 만들지 않는다.
> 구현 위치: `src/domain/score/types.ts` (단일 정의), `create.ts`, `validate.ts`, `tie.ts`, `serialize.ts`.

## 1. 소유 관계

```text
Score
└─ parts: Part[]
   ├─ measures: Measure[]        (index = 배열 위치, 0부터 연속)
   │  └─ events: ScoreEvent[]    (NoteEvent | RestEvent)
   └─ ties: TieLink[]            (음표 간 붙임줄 연결, v2)
```

- Part는 조표·박자·음자리표와 **타이 연결 목록(`ties`)** 을 소유한다.
- Measure는 이벤트를 소유한다. 측정 단위는 **절대 tick**이다.
- NoteEvent는 `Pitch`(표기 + MIDI)와 provenance를 소유한다.
- **마디를 넘는 음은 이벤트 하나로 저장하지 않는다.** 마디 경계에서 분할한 여러 NoteEvent를
  `ties`로 연결한다(ADR-009).

## 2. 시간 모델 (C-02 결정)

| 항목 | 결정 |
|---|---|
| 해상도 | **960 PPQ** (`TICKS_PER_QUARTER = 960`) |
| 위치 | **Score 시작부터의 절대 tick**. 마디 상대 tick을 별도로 저장하지 않는다 |
| 마디 길이 | `numerator * 960 * 4 / denominator` (예: 4/4 → 3840, 6/8 → 2880) |
| 마디 범위 | `[index * measureTicks, (index + 1) * measureTicks)` |
| 이벤트 제약 | 개별 이벤트는 **소속 마디 범위를 벗어날 수 없다**(`EVENT_OUT_OF_MEASURE`). 마디를 넘는 음은 마디 경계에서 분할해 `ties`로 연결한다 |
| 표기가능 길이 | 한 이벤트는 **점 0~2개가 붙은 단일 음가**로 표기 가능한 길이만 가진다(`NOTATABLE_DURATIONS`). 그 외 길이는 더 작은 음가로 분할해 타이로 연결한다 |
| 원본 녹음 시간 | Score에 저장하지 않는다. 채보 후보/런타임 데이터로 분리(Phase 4) |

단일 시간 모델만 존재한다. 마디 상대 tick이나 초 단위 필드를 Score에 추가하지 않는다.

## 3. 타입 요약

```ts
interface Score {
  id: string;
  schemaVersion: number;      // 현재 2
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
  ties: TieLink[];            // v2 신규
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

/** 붙임줄 연결: from 음표가 끝나는 지점에서 to 음표가 이어진다. */
interface TieLink { from: string; to: string }
```

`NoteEvent.kind`/`RestEvent.kind` 판별 필드로 union을 구분한다.

### 3.1 타이(Tie) 의미와 규칙

- `TieLink.from` / `to` 는 **같은 Part 안의 NoteEvent ID**다. 음표에 불리언 플래그를 두지 않고
  연결 관계 자체를 한 곳에 저장한다(사용자 요구: 명시적 연결 표현).
- 체인(A→B→C)을 허용한다. 분기(A→B, A→C)는 허용하지 않는다.
- 연결된 음표들은 **시간적으로 연속**해야 하고(`to.startTick === from.startTick + from.durationTicks`)
  **음높이가 같아야** 한다.
- 붙임줄은 **하나의 음**으로 인식한다: 재생은 체인 전체를 한 번의 어택 + 지속음으로 처리한다.
- 기보는 각 세그먼트를 음표로 그리고 세그먼트 사이에 붙임줄을 표시한다.

### 3.2 표기가능 길이 (NOTATABLE_DURATIONS)

`ticks = (3840 / base) * (2 - 2^-dots)`, `base ∈ {1,2,4,8,16,32}`, `dots ∈ {0,1,2}`.

| base:dots | ticks | 예 |
|---|---|---|
| 1:0 | 3840 | 온음표 |
| 1:1 / 1:2 | 5760 / 6720 | 점온음표 / 겹점온음표 |
| 2:0 / 2:1 / 2:2 | 1920 / 2880 / 3360 | 2분 / 점2분 / 겹점2분 |
| 4:0 / 4:1 / 4:2 | 960 / 1440 / 1680 | 4분 / 점4분 / 겹점4분 |
| 8:0 / 8:1 / 8:2 | 480 / 720 / 840 | 8분 / 점8분 / 겹점8분 |
| 16:0 / 16:1 / 16:2 | 240 / 360 / 420 | 16분 … |
| 32:0 / 32:1 / 32:2 | 120 / 180 / 210 | 32분 … |

## 4. 불변식 (검증 코드)

`validateScore(score)` 가 반환하는 `ValidationIssue.code`:

| code | 규칙 |
|---|---|
| `UNSUPPORTED_SCHEMA` | `schemaVersion !== 2` |
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
| `EVENT_OUT_OF_MEASURE` | 개별 이벤트가 소속 마디 범위를 벗어남(분할 전 상태) |
| `OVERLAPPING_EVENTS` | 단선율 voice에서 이벤트가 겹침 |
| `TIE_INVALID_SHAPE` | `part.ties` 가 배열이 아님 |
| `TIE_UNKNOWN_REF` | `from`/`to` 가 같은 part의 note ID가 아님 |
| `TIE_SELF_REF` | `from === to` |
| `TIE_DUPLICATE` | 동일한 `from→to` 링크 중복 |
| `TIE_NOT_CONTIGUOUS` | `to.startTick !== from.startTick + from.durationTicks` |
| `TIE_PITCH_MISMATCH` | 연결된 두 음표의 표기/MIDI가 다름 |
| `TIE_BRANCHING` | 하나의 음표에서 나가거나 들어오는 링크가 2개 이상 |
| `TIE_CYCLE` | 링크 체인이 순환함 |

## 5. 예시 JSON (v2, 4/4 마지막 박에서 시작하는 2박 음)

```json
{
  "id": "score-1",
  "schemaVersion": 2,
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
              "startTick": 2880,
              "durationTicks": 960,
              "velocity": 96,
              "provenance": { "source": "system" }
            }
          ]
        },
        {
          "id": "score-1:m:1",
          "index": 1,
          "events": [
            {
              "kind": "note",
              "id": "n1:tie1",
              "pitch": { "midi": 60, "step": "C", "alter": 0, "octave": 4 },
              "startTick": 3840,
              "durationTicks": 960,
              "velocity": 96,
              "provenance": { "source": "system" }
            }
          ]
        }
      ],
      "ties": [{ "from": "n1", "to": "n1:tie1" }]
    }
  ]
}
```

분할 세그먼트 ID는 결정적이다: 첫 세그먼트는 원래 ID, 이후는 `${id}:tie1`, `${id}:tie2` …
(Command는 `Date.now()`/랜덤을 호출하지 않는다 — 재현성).

## 6. 버전 및 마이그레이션 정책 (C-07)

- 현재 버전은 **2**다. `Part.ties` 추가가 v1 → v2 변경 사유다.
- **v1 → v2 마이그레이션**: 각 `part`에 `ties: []`를 추가하고 `schemaVersion`을 2로 올린다.
  `deserializeScore`는 v1 문서를 메모리에서 v2로 변환한 뒤 검증한다. 읽기만 한 저장본은 다시 쓰지 않으며,
  정상 편집 후 기존 저장 흐름으로 v2를 영속화한다(2026-11-08 원본 보존 요구 반영).
- 그 외 버전은 **거부하고 원본을 보존**한다(자동 변환·덮어쓰기 금지).
- 손상 데이터는 검증 실패로 처리하고 사용자에게 오류를 알린다. 미존재와 구분하며,
  실패한 저장본을 빈 악보로 대체하거나 자동 저장·자동 수정·삭제·마이그레이션하지 않는다.

## 7. Phase 1-D 범위 밖 (명시)

- 슬러(slur)·이음줄, 다성부/다중 voice, 조표·박자 변경 지점, 임시표 자동 표기 최적화,
  붙임줄의 임의 길이(비표기가능 tick) 자동 분해 최적화(현재는 그리디 분해, 실패 시 거부).
