import type { Part, Score, ScoreEvent } from "@/domain/score/types";
import { NOTATABLE_DURATIONS } from "@/domain/score/tie";

const DURATION_ALIAS: Record<number, string> = {
  1: "w",
  2: "h",
  4: "q",
  8: "8",
  16: "16",
  32: "32",
};

const KEY_SPEC_BY_FIFTHS: Record<number, string> = {
  [-7]: "Cb",
  [-6]: "Gb",
  [-5]: "Db",
  [-4]: "Ab",
  [-3]: "Eb",
  [-2]: "Bb",
  [-1]: "F",
  0: "C",
  1: "G",
  2: "D",
  3: "A",
  4: "E",
  5: "B",
  6: "F#",
  7: "C#",
};

const MEASURES_PER_ROW = 4;
const MEASURE_WIDTH = 220;
const ROW_HEIGHT = 130;
const STAVE_TOP = 40;

function keySpecOf(part: Part): string {
  return KEY_SPEC_BY_FIFTHS[part.keySignature.fifths] ?? "C";
}

/**
 * tick 길이를 VexFlow duration 문자열로 바꾼다(점은 `d` 접미사, 쉼표는 `r`).
 * `Note.parseDuration` 정규식이 `(\d*\/?\d+|[a-z])(d*)([nrhms]|$)` 이므로 `hd`, `qdd`, `qr` 모두 유효하다.
 */
function vexDurationOf(ticks: number, isRest: boolean): string {
  const spec =
    NOTATABLE_DURATIONS.find((duration) => duration.ticks === ticks) ??
    NOTATABLE_DURATIONS.find((duration) => duration.ticks <= ticks) ??
    NOTATABLE_DURATIONS[NOTATABLE_DURATIONS.length - 1];

  const alias = DURATION_ALIAS[spec.base] ?? "q";
  return `${alias}${"d".repeat(spec.dots)}${isRest ? "r" : ""}`;
}

function vexKeyOf(event: Extract<ScoreEvent, { kind: "note" }>): string {
  const accidental =
    event.pitch.alter > 0
      ? "#".repeat(event.pitch.alter)
      : "b".repeat(-event.pitch.alter);
  return `${event.pitch.step.toLowerCase()}${accidental}/${event.pitch.octave}`;
}

/**
 * VexFlow 5 어댑터. 렌더링 결과는 DOM에만 존재하며 canonical Score를 대체하지 않는다.
 * 타이(Part.ties)는 `StaveTie`로 그리며, 줄(행) 경계를 넘으면 부분 타이 두 개로 나눠 그린다.
 * 브라우저에서만 호출한다(동적 import로 SSR 번들 제외).
 */
export async function renderScoreInto(
  element: HTMLDivElement,
  score: Score,
): Promise<void> {
  const vexflow = await import("vexflow");
  const {
    Renderer,
    Stave,
    StaveNote,
    StaveTie,
    Voice,
    Formatter,
    Accidental,
  } = vexflow;

  const part = score.parts[0];
  element.innerHTML = "";
  if (!part) return;

  const rows = Math.max(1, Math.ceil(part.measures.length / MEASURES_PER_ROW));
  const width = MEASURES_PER_ROW * MEASURE_WIDTH + 20;
  const height = rows * ROW_HEIGHT + STAVE_TOP;

  const renderer = new Renderer(element, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  const keySpec = keySpecOf(part);

  const rendered = new Map<
    string,
    { note: InstanceType<typeof StaveNote>; row: number }
  >();

  part.measures.forEach((measure, index) => {
    const row = Math.floor(index / MEASURES_PER_ROW);
    const column = index % MEASURES_PER_ROW;
    const stave = new Stave(
      column * MEASURE_WIDTH + 10,
      row * ROW_HEIGHT + STAVE_TOP,
      MEASURE_WIDTH,
    );

    if (column === 0) {
      stave.addClef(part.clef);
      stave.addKeySignature(keySpec);
    }

    if (index === 0) {
      stave.addTimeSignature(
        `${part.timeSignature.numerator}/${part.timeSignature.denominator}`,
      );
    }

    stave.setContext(context).draw();
    if (measure.events.length === 0) return;

    const notes = measure.events.map((event) => {
      if (event.kind === "rest") {
        return new StaveNote({
          keys: ["b/4"],
          duration: vexDurationOf(event.durationTicks, true),
        });
      }
      return new StaveNote({
        keys: [vexKeyOf(event)],
        duration: vexDurationOf(event.durationTicks, false),
        clef: part.clef,
      });
    });

    const voice = new Voice({
      numBeats: part.timeSignature.numerator,
      beatValue: part.timeSignature.denominator,
    })
      .addTickables(notes)
      .setStrict(false);

    Accidental.applyAccidentals([voice], keySpec);
    new Formatter().joinVoices([voice]).format([voice], MEASURE_WIDTH - 40);
    voice.draw(context, stave);

    measure.events.forEach((event, position) => {
      rendered.set(event.id, { note: notes[position], row });
    });
  });

  for (const tie of part.ties) {
    const first = rendered.get(tie.from);
    const last = rendered.get(tie.to);
    if (!first || !last) continue;

    const indexes = { firstIndexes: [0], lastIndexes: [0] };

    if (first.row === last.row) {
      new StaveTie({ firstNote: first.note, lastNote: last.note, ...indexes })
        .setContext(context)
        .draw();
      continue;
    }

    // 줄이 바뀌면 VexFlow는 양끝을 한 번에 그릴 수 없다 → 부분 타이로 나눠 그린다.
    new StaveTie({ firstNote: first.note, ...indexes }).setContext(context).draw();
    new StaveTie({ lastNote: last.note, ...indexes }).setContext(context).draw();
  }
}
