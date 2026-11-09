import type { Part, Score, ScoreEvent } from "@/domain/score/types";
import { planPartNotation } from "@/domain/score";
import type { NotationIssue } from "@/domain/score";
import type { NotatableDuration } from "@/domain/score/tie";
import { measureStartTick, measureTicks, TICKS_PER_QUARTER } from "@/domain/score";

import { formatNoteLabel, type NoteLabelMode } from "@/domain/music-theory";

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

/** This accepts only a proven exact notation specification, never an arbitrary duration. */
function vexDurationOf(spec: Readonly<NotatableDuration>, isRest: boolean): string {
  return `${DURATION_ALIAS[spec.base]}${"d".repeat(spec.dots)}${isRest ? "r" : ""}`;
}

export class NotationRenderError extends Error {
  constructor(public readonly issue: NotationIssue) { super(issue.message); this.name = "NotationRenderError"; }
}
const renderRequests = new WeakMap<HTMLDivElement, number>();

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
  options?: { cursorTick?: number | null; labelMode?: NoteLabelMode; signal?: AbortSignal },
): Promise<void> {
  if (options?.signal?.aborted) return;
  const request = (renderRequests.get(element) ?? 0) + 1;
  renderRequests.set(element, request);
  const playingIds = new Set(Array.from(element.querySelectorAll?.('[data-event-id][data-playing="true"]') ?? [])
    .map((note) => note.getAttribute("data-event-id")));
  element.innerHTML = "";
  const part = score.parts[0];
  if (!part) return;
  const plan = planPartNotation(part);
  if (!plan.ok) throw new NotationRenderError(plan.issue);
  const vexflow = await import("vexflow");
  if (options?.signal?.aborted || renderRequests.get(element) !== request) return;
  try {
    const {
      Renderer,
      Stave,
      StaveNote,
      StaveTie,
      Voice,
      Formatter,
      Accidental,
      GhostNote,
      Dot,
      Annotation,
    } = vexflow;


    const labelMode = options?.labelMode ?? "none";
    const labelled = labelMode !== "none";
    let expandedLayout = labelled;
    const continuation = new Set(part.ties.map((tie) => tie.to));
    const annotations = new Map<InstanceType<typeof StaveNote>, InstanceType<typeof Annotation>>();
    const rowHeight = labelled ? 180 : ROW_HEIGHT;
    let rowX = 10;
    let rowY = STAVE_TOP;
    let canvasWidth = MEASURES_PER_ROW * MEASURE_WIDTH + 20;

    const rows = Math.max(1, Math.ceil(part.measures.length / MEASURES_PER_ROW));
    const width = MEASURES_PER_ROW * MEASURE_WIDTH + 20;
    const height = rows * rowHeight + STAVE_TOP;

    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    const keySpec = keySpecOf(part);
    let cursorPoint: { x: number; y: number } | undefined;
    const cursorTick = options?.cursorTick;
    const length = measureTicks(part.timeSignature);

    const rendered = new Map<
      string,
      { first: InstanceType<typeof StaveNote>; last: InstanceType<typeof StaveNote>; row: number }
    >();
    const visualTies: { from: InstanceType<typeof StaveNote>; to: InstanceType<typeof StaveNote> }[] = [];

    part.measures.forEach((measure, index) => {
      const fragments = plan.measures[index];
      const spaced = labelled || fragments.some((fragment) => fragment.count > 1);
      expandedLayout ||= spaced;
      const row = Math.floor(index / MEASURES_PER_ROW);
      const column = index % MEASURES_PER_ROW;
      if (column === 0) { rowX = 10; rowY = row * rowHeight + STAVE_TOP; }
      const stave = new Stave(
        rowX,
        rowY,
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

      stave.setContext(context);
      if (!spaced || measure.events.length === 0) stave.draw();
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
        cursorPoint = { x: left.x + ratio * (next.x - left.x), y: rowY + 10 };
      }
      if (measure.events.length === 0) { locateCursor(); rowX += MEASURE_WIDTH; return; }

      const events = fragments.map((fragment) => fragment.event);
      const notes = fragments.map((fragment) => {
        const event = fragment.event;
        let note: InstanceType<typeof StaveNote>;
        if (event.kind === "rest") {
          note = new StaveNote({ keys: [part.clef === "bass" ? "d/3" : "b/4"],
            duration: vexDurationOf(fragment.duration, true), clef: part.clef });
        } else {
          note = new StaveNote({ keys: [vexKeyOf(event)],
            duration: vexDurationOf(fragment.duration, false), clef: part.clef });
        }
        for (let dot = 0; dot < fragment.duration.dots; dot++) Dot.buildAndAttach([note], { all: true });
        const label = event.kind !== "note" || fragment.index !== 0 || continuation.has(event.id)
          ? null : formatNoteLabel(event.pitch, labelMode);
        if (label) {
          const annotation = new Annotation(label).setFont("system-ui, sans-serif", 11)
            .setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
          annotation.setYShift(12);
          note.addModifier(annotation, 0);
          annotations.set(note, annotation);
        }
        return note;
      });

      // 쉼표 이동/삭제로 생긴 빈 구간도 절대 tick 위치대로 간격을 유지한다.
      // GhostNote는 렌더 전용이며 canonical Score에는 추가하지 않는다.
      const tickables: InstanceType<typeof StaveNote | typeof GhostNote>[] = [];
      const ticks: number[] = [];
      let cursor = measureStartTick(measure.index, part.timeSignature);
      function addGap(tick: number, durationTicks: number) {
        const gap = new GhostNote({ duration: "q" });
        // Rational tick multiplication, rather than overriding a visible note's glyph duration.
        gap.applyTickMultiplier(durationTicks, TICKS_PER_QUARTER);
        tickables.push(gap); ticks.push(tick);
      }
      fragments.forEach((fragment, position) => {
        if (fragment.startTick > cursor) addGap(cursor, fragment.startTick - cursor);
        tickables.push(notes[position]); ticks.push(fragment.startTick);
        cursor = fragment.startTick + fragment.duration.ticks;
        if (fragment.index > 0 && fragment.event.kind === "note") {
          visualTies.push({ from: notes[position - 1], to: notes[position] });
        }
      });
      if (cursor < start + length) addGap(cursor, start + length - cursor);

      const voice = new Voice({
        numBeats: part.timeSignature.numerator,
        beatValue: part.timeSignature.denominator,
      })
        .addTickables(tickables)
        .setStrict(true);

      Accidental.applyAccidentals([voice], keySpec);
      const formatter = new Formatter().joinVoices([voice]);
      // Annotation-aware VexFlow spacing, expanding dense measures rather than overlapping labels.
      const inset = spaced ? stave.getNoteStartX() - stave.getX() : 0;
      const measureWidth = spaced ? Math.max(MEASURE_WIDTH, Math.ceil(formatter.preCalculateMinTotalWidth([voice])) + inset + 40) : MEASURE_WIDTH;
      if (spaced) stave.setWidth(measureWidth);
      formatter.format([voice], spaced ? measureWidth - inset - 30 : measureWidth - 40);
      rowX += measureWidth;
      canvasWidth = Math.max(canvasWidth, rowX + 10);
      if (spaced) stave.draw();
      voice.draw(context, stave);
      if (atCursor) locateCursor(tickables.map((note, index) => ({ tick: ticks[index], x: note.getAbsoluteX() })));

      events.forEach((event, position) => {
        const noteElement = notes[position].getSVGElement();
        noteElement?.setAttribute("data-event-id", event.id);
        // VexFlow disables pointer events on the SVG root. Enable only event glyphs
        // so StaffView can delegate real fragment clicks to the original event.
        noteElement?.setAttribute("pointer-events", "visiblePainted");
        if (playingIds.has(event.id)) noteElement?.setAttribute("data-playing", "true");
        const fragment = fragments[position];
        if (fragment.count > 1) {
          noteElement?.setAttribute("data-notation-start", String(fragment.startTick));
          noteElement?.setAttribute("data-notation-duration", String(fragment.duration.ticks));
        }
        const label = annotations.get(notes[position])?.getSVGElement();
        if (label) {
          label.setAttribute("data-testid", "note-label");
          label.setAttribute("data-label-event-id", event.id);
          label.setAttribute("aria-label", annotations.get(notes[position])!.getText());
          label.setAttribute("style", "pointer-events: none; user-select: none");
        }
        const previous = rendered.get(event.id);
        rendered.set(event.id, { first: previous?.first ?? notes[position], last: notes[position], row });
      });
    });

    for (const tie of visualTies) {
      new StaveTie({ firstNote: tie.from, lastNote: tie.to, firstIndexes: [0], lastIndexes: [0] }).setContext(context).draw();
    }
    for (const tie of part.ties) {
      const first = rendered.get(tie.from);
      const last = rendered.get(tie.to);
      if (!first || !last) continue;

      const indexes = { firstIndexes: [0], lastIndexes: [0] };

      if (first.row === last.row) {
        new StaveTie({ firstNote: first.last, lastNote: last.first, ...indexes })
          .setContext(context)
          .draw();
        continue;
      }

      // 줄이 바뀌면 VexFlow는 양끝을 한 번에 그릴 수 없다 → 부분 타이로 나눠 그린다.
      new StaveTie({ firstNote: first.last, ...indexes }).setContext(context).draw();
      new StaveTie({ lastNote: last.first, ...indexes }).setContext(context).draw();
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
    if (expandedLayout) {
      const svg = element.querySelector?.("svg");
      const bounds = svg?.getBBox?.();
      const x = Math.min(0, (bounds?.x ?? 8) - 8);
      const y = Math.min(0, (bounds?.y ?? 8) - 8);
      const right = Math.max(canvasWidth, bounds ? bounds.x + bounds.width + 8 : canvasWidth);
      const bottom = Math.max(height, bounds ? bounds.y + bounds.height + 8 : height);
      renderer.resize(right - x, bottom - y);
      svg?.setAttribute("viewBox", `${x} ${y} ${right - x} ${bottom - y}`);
    }

  } catch (error) {
    if (renderRequests.get(element) === request && !options?.signal?.aborted) element.innerHTML = "";
    throw error;
  }

}
