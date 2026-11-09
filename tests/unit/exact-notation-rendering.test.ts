import { mockVexflowCssFont } from "../fixtures/vexflow-font";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Annotation, Dot, GhostNote, StaveNote, type Voice } from "vexflow";
import { renderScoreInto } from "@/adapters/vexflow/renderScore";
import { createEmptyScore, createNoteEvent, createRestEvent, type Score } from "@/domain/score";
import { highlightPlayback } from "@/features/playback";
import { baseScore, longTiedScore, withMeasureEvents } from "../fixtures/scores";
const capture = vi.hoisted(() => ({ voices: [] as Voice[], ties: [] as { firstNote?: StaveNote; lastNote?: StaveNote }[], elements: [] as Element[] }));
vi.mock("vexflow", async (original) => {
  const v = await original<typeof import("vexflow")>();
  return { ...v,
    Renderer: class { static Backends = { SVG: 1 }; resize() {} getContext() { return {}; } },
    Stave: class extends v.Stave { draw() {} },
    Voice: class extends v.Voice { constructor(time: ConstructorParameters<typeof v.Voice>[0]) { super(time); capture.voices.push(this); } draw(_context: unknown, stave: InstanceType<typeof v.Stave>) { this.getTickables().forEach((note) => note.setStave(stave)); } },
    StaveTie: class { constructor(link: { firstNote?: StaveNote; lastNote?: StaveNote }) { capture.ties.push(link); } setContext() { return this; } draw() {} },
  };
});
function glyphs() { return capture.voices.flatMap((voice) => voice.getTickables().filter((note): note is StaveNote => note instanceof StaveNote)); }
function element() {
  const attrs = new Map<string, string>();
  return { setAttribute: (k: string, v: string) => attrs.set(k, v), getAttribute: (k: string) => attrs.get(k), removeAttribute: (k: string) => attrs.delete(k) } as unknown as Element;
}
beforeEach(() => {
  mockVexflowCssFont();
  capture.voices.length = capture.ties.length = capture.elements.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(StaveNote.prototype, "getSVGElement").mockImplementation(function (this: StaveNote) {
    const cache = this as StaveNote & { testElement?: Element }; return (cache.testElement ??= element()) as SVGElement;
  });
  vi.spyOn(Annotation.prototype, "getSVGElement").mockReturnValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
function source(rest = false) {
  return withMeasureEvents(baseScore(), [rest ? createRestEvent({ id: "split", startTick: 120, durationTicks: 300 })
    : createNoteEvent({ id: "split", step: "C", octave: 4, startTick: 120, durationTicks: 300 }),
  createNoteEvent({ id: "next", step: "D", octave: 4, startTick: 600, durationTicks: 960 })]);
}
async function render(score: Score) { return renderScoreInto({ innerHTML: "" } as HTMLDivElement, score); }
it("splits 300 into exact dotted and plain glyphs, one visual tie and original IDs", async () => {
  const score = source(); const before = JSON.stringify(score); await render(score);
  const notes = glyphs(); expect(notes.map((note) => note.getTicks().value() * 3840 / 16384)).toEqual([180, 120, 960]);
  expect(notes[0].getModifiersByType("Dot")).toHaveLength(1); expect(notes[1].getModifiersByType("Dot")).toHaveLength(0);
  expect(Dot.getDots(notes[0])[0].getText()).toBe("\uE1E7");
  expect(capture.ties).toEqual([{ firstNote: notes[0], lastNote: notes[1], firstIndexes: [0], lastIndexes: [0] }]);
  expect(notes.map((note) => note.getSVGElement()!.getAttribute("data-event-id"))).toEqual(["split", "split", "next"]);
  expect(JSON.stringify(score)).toBe(before);
});
it("keeps the complete measure clock including leading, internal and trailing gaps", async () => {
  await render(source()); const voice = capture.voices[0];
  expect(voice.getTickables().map((note) => note.getTicks().value() * 3840 / 16384)).toEqual([120, 180, 120, 180, 960, 2280]);
  expect(voice.getTickables()[0]).toBeInstanceOf(GhostNote);
  expect(voice.getTicksUsed().equals(voice.getTotalTicks())).toBe(true);
});
it("splits rests exactly and never ties rest glyphs", async () => {
  await render(source(true)); expect(glyphs().map((note) => note.isRest())).toEqual([true, true, false]);
  expect(capture.ties).toEqual([]); expect(Dot.getDots(glyphs()[0])).toHaveLength(1);
  expect(Dot.getDots(glyphs()[0])[0].getText()).toBe("\uE1E7");
});
it("makes original event glyphs hit-testable under VexFlow's pointer-events=none SVG root", async () => {
  await render(source());
  expect(glyphs().map((note) => note.getSVGElement()!.getAttribute("pointer-events")))
    .toEqual(["visiblePainted", "visiblePainted", "visiblePainted"]);
});
it("retains a one-tick gap as a rational ghost and completes the strict measure", async () => {
  await render(withMeasureEvents(baseScore(), [createNoteEvent({ id: "gap", step: "C", octave: 4, startTick: 1, durationTicks: 300 })]));
  const voice = capture.voices[0]; const first = voice.getTickables()[0];
  expect(first).toBeInstanceOf(GhostNote); expect(first.getTicks().value() * 3840 / 16384).toBe(1);
  expect(voice.getTicksUsed().equals(voice.getTotalTicks())).toBe(true);
});
it("keeps split endpoints and partial canonical ties across a row boundary", async () => {
  const score = createEmptyScore({ id: "rows", createdAt: "fixed", measureCount: 5 }); const part = score.parts[0];
  part.measures[3].events = [createNoteEvent({ id: "from", step: "C", octave: 4, startTick: 15060, durationTicks: 300 })];
  part.measures[4].events = [createNoteEvent({ id: "to", step: "C", octave: 4, startTick: 15360, durationTicks: 300 })];
  part.ties = [{ from: "from", to: "to" }]; const json = JSON.stringify(score); await render(score);
  const notes = glyphs(); expect(notes).toHaveLength(4); expect(capture.ties).toHaveLength(4);
  expect(capture.ties[2]).toMatchObject({ firstNote: notes[1] }); expect(capture.ties[2].lastNote).toBeUndefined();
  expect(capture.ties[3]).toMatchObject({ lastNote: notes[2] }); expect(capture.ties[3].firstNote).toBeUndefined();
  expect(capture.voices.every((voice) => voice.getTicksUsed().equals(voice.getTotalTicks()))).toBe(true);
  expect(JSON.stringify(score)).toBe(json);
});
it("draws actual double-dot modifiers for supported dotted durations", async () => {
  await render(withMeasureEvents(baseScore(), [createNoteEvent({ id: "d", step: "C", octave: 4, startTick: 0, durationTicks: 1680 })]));
  expect(glyphs()[0].getModifiersByType("Dot")).toHaveLength(2); expect(glyphs()[0].getTicks().value()).toBe(7168);
});
it("connects canonical ties using the final fragment and keeps a single label per logical head", async () => {
  const score = source(); score.parts[0].measures[0].events[1] = createNoteEvent({ id: "tail", step: "C", octave: 4, startTick: 420, durationTicks: 300 });
  score.parts[0].ties = [{ from: "split", to: "tail" }];
  await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score, { labelMode: "letter" });
  const notes = glyphs(); expect(capture.ties).toHaveLength(3);
  expect(capture.ties.at(-1)).toMatchObject({ firstNote: notes[1], lastNote: notes[2] });
  expect(notes.flatMap((note) => note.getModifiersByType("Annotation"))).toHaveLength(1);
});
it("highlights every fragment of the original event and keeps other notes unhighlighted", async () => {
  await render(source()); const elements = glyphs().map((note) => note.getSVGElement()!);
  highlightPlayback({ querySelectorAll: () => elements } as unknown as HTMLElement, ["split"]);
  expect(elements.map((node) => node.getAttribute("data-playing"))).toEqual(["true", "true", undefined]);
});
it.each([1, 1000])("rejects %s before drawing any SVG and clears the previous notation", async (ticks) => {
  const host = { innerHTML: "<svg>old</svg>" } as HTMLDivElement;
  const score = withMeasureEvents(baseScore(), [createRestEvent({ id: "bad", startTick: 0, durationTicks: ticks })]);
  await expect(renderScoreInto(host, score)).rejects.toMatchObject({ issue: { eventId: "bad", measureNumber: 1, durationTicks: ticks } });
  expect(host.innerHTML).toBe(""); expect(capture.voices).toHaveLength(0);
  await renderScoreInto(host, source()); expect(glyphs()).toHaveLength(3);
});
it("keeps long H-01 canonical chains and one tickable for each existing segment", async () => {
  const score = longTiedScore(128); const before = JSON.stringify(score); await render(score);
  expect(glyphs()).toHaveLength(128); expect(capture.ties.length).toBeGreaterThanOrEqual(127); expect(JSON.stringify(score)).toBe(before);
});

it("does not let an older async render restore a stale SVG after a newer notation error", async () => {
  const host = { innerHTML: "<svg>old</svg>" } as HTMLDivElement;
  const pending = renderScoreInto(host, source());
  const invalid = withMeasureEvents(baseScore(), [createRestEvent({ id: "invalid", startTick: 0, durationTicks: 1000 })]);
  await expect(renderScoreInto(host, invalid)).rejects.toThrow("1000"); await pending;
  expect(host.innerHTML).toBe(""); expect(capture.voices).toHaveLength(0);
});
it("does not draw an abandoned render after effect cancellation", async () => {
  const host = { innerHTML: "old" } as HTMLDivElement; const controller = new AbortController();
  const pending = renderScoreInto(host, source(), { signal: controller.signal }); controller.abort(); await pending;
  expect(host.innerHTML).toBe(""); expect(capture.voices).toHaveLength(0);
});
it("clears partially drawn output when VexFlow drawing fails", async () => {
  const host = { innerHTML: "old" } as HTMLDivElement;
  const v = await import("vexflow"); vi.spyOn(v.Voice.prototype, "draw").mockImplementationOnce(() => { host.innerHTML = "<svg>partial</svg>"; throw new Error("draw failed"); });
  await expect(renderScoreInto(host, source())).rejects.toThrow("draw failed"); expect(host.innerHTML).toBe("");
});
