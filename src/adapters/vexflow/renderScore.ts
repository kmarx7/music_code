import type { Part, Score, ScoreEvent } from "@/domain/score/types";
import { NOTATABLE_DURATIONS } from "@/domain/score/tie";
import { measureStartTick, measureTicks, TICKS_PER_QUARTER } from "@/domain/score";

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
  options?: { cursorTick?: number | null },
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
    GhostNote,
    Fraction,
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
  let cursorPoint: { x: number; y: number } | undefined;
  const cursorTick = options?.cursorTick;
  const length = measureTicks(part.timeSignature);

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
    const start = measureStartTick(measure.index, part.timeSignature);
    const atCursor = cursorTick !== null && cursorTick !== undefined && Number.isSafeInteger(cursorTick) &&
      cursorTick >= start && (cursorTick < start + length ||
        (index === part.measures.length - 1 && cursorTick === start + length));
    function locateCursor(anchors: { tick: number; x: number }[] = []) {
      if (!atCursor) return;
      const points = [{ tick: start, x: stave.getNoteStartX() }, ...anchors,
        { tick: start + length, x: stave.getNoteEndX() }];
      const right = points.findIndex((point) => point.tick > cursorTick!);
      const left = right < 0 ? points.at(-1)! : points[Math.max(0, right - 1)];
      const next = right < 0 ? left : points[right];
      const ratio = next.tick === left.tick ? 0 : (cursorTick! - left.tick) / (next.tick - left.tick);
      cursorPoint = { x: left.x + ratio * (next.x - left.x), y: row * ROW_HEIGHT + STAVE_TOP + 10 };
    }
    if (measure.events.length === 0) { locateCursor(); return; }

    const events = [...measure.events].sort((a, b) => a.startTick - b.startTick);
    const notes = events.map((event) => {
      if (event.kind === "rest") {
        return new StaveNote({
          keys: [part.clef === "bass" ? "d/3" : "b/4"],
          duration: vexDurationOf(event.durationTicks, true),
          clef: part.clef,
        });
      }
      return new StaveNote({
        keys: [vexKeyOf(event)],
        duration: vexDurationOf(event.durationTicks, false),
        clef: part.clef,
      });
    });

    // 쉼표 이동/삭제로 생긴 빈 구간도 절대 tick 위치대로 간격을 유지한다.
    // GhostNote는 렌더 전용이며 canonical Score에는 추가하지 않는다.
    const tickables: InstanceType<typeof StaveNote | typeof GhostNote>[] = [];
    const ticks: number[] = [];
    let cursor = measureStartTick(measure.index, part.timeSignature);
    events.forEach((event, position) => {
      if (event.startTick > cursor) {
        const gap = new GhostNote({ duration: "q" });
        gap.setDuration(new Fraction(event.startTick - cursor, TICKS_PER_QUARTER * 4));
        tickables.push(gap);
        ticks.push(cursor);
      }
      tickables.push(notes[position]);
      ticks.push(event.startTick);
      cursor = event.startTick + event.durationTicks;
    });

    const voice = new Voice({
      numBeats: part.timeSignature.numerator,
      beatValue: part.timeSignature.denominator,
    })
      .addTickables(tickables)
      .setStrict(false);

    Accidental.applyAccidentals([voice], keySpec);
    new Formatter().joinVoices([voice]).format([voice], MEASURE_WIDTH - 40);
    voice.draw(context, stave);
    if (atCursor) locateCursor(tickables.map((note, index) => ({ tick: ticks[index], x: note.getAbsoluteX() })));

    events.forEach((event, position) => {
      notes[position].getSVGElement()?.setAttribute("data-event-id", event.id);
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
  if (cursorPoint) {
    const svg = element.querySelector("svg");
    if (svg) {
      const line = element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "line");
      for (const [key, value] of Object.entries({ x1: cursorPoint.x, x2: cursorPoint.x,
        y1: cursorPoint.y, y2: cursorPoint.y + 75, stroke: "#2563eb", "stroke-width": 2,
        "pointer-events": "none", "data-testid": "staff-edit-cursor", "data-tick": cursorTick,
        "aria-label": "편집 커서" })) line.setAttribute(key, String(value));
      svg.appendChild(line);
    }
  }
}
