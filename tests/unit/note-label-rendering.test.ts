import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Annotation, Stave, StaveNote, type Tickable } from "vexflow";
import { renderScoreInto } from "@/adapters/vexflow/renderScore";
import { createNoteEvent, createRestEvent, type Score } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS, type NoteLabelMode } from "@/domain/music-theory";
import { createScoreStore } from "@/store/score-store";
import { baseScore, fourNoteScore, tiedScore } from "../fixtures/scores";

const captured = vi.hoisted(() => ({ voices: [] as Tickable[][], widths: [] as number[], sizes: [] as number[][], attrs: [] as string[][] }));
vi.mock("vexflow", async (original) => {
  const actual = await original<typeof import("vexflow")>();
  return { ...actual,
    Renderer: class { static Backends = { SVG: 1 }; resize(...size: number[]) { captured.sizes.push(size); } getContext() { return {}; } },
    Stave: class extends actual.Stave {
      draw() { captured.widths.push(this.getWidth()); }
    },
    Voice: class extends actual.Voice {
      addTickables(notes: Tickable[]) { captured.voices.push(notes); return super.addTickables(notes); }
      draw(_context: unknown, stave: InstanceType<typeof actual.Stave>) { this.getTickables().forEach((note) => note.setStave(stave)); }
    },
    StaveTie: class { setContext() { return this; } draw() {} },
  };
});
beforeEach(() => {
  captured.voices.length = captured.widths.length = captured.sizes.length = captured.attrs.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  // Node has no Canvas text measurement. Supply non-zero deterministic font metrics;
  // actual VexFlow Annotation/Formatter still own attachment and spacing calculations.
  vi.spyOn(Annotation.prototype, "getWidth").mockImplementation(function (this: Annotation) { return Array.from(this.getText()).length * 9; });
  vi.spyOn(StaveNote.prototype, "getSVGElement").mockReturnValue(undefined);
  vi.spyOn(Annotation.prototype, "getSVGElement").mockReturnValue({ setAttribute: (key: string, value: string) => captured.attrs.push([key, value]) } as unknown as SVGElement);
});
afterEach(() => vi.restoreAllMocks());
function annotations() { return captured.voices.flatMap((voice) => voice.flatMap((note) => note instanceof StaveNote ? note.getModifiers().filter((modifier): modifier is Annotation => modifier instanceof Annotation) : [])); }
async function render(score: Score, labelMode?: NoteLabelMode) { await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score, labelMode ? { labelMode } : undefined); }

it("defaults to no annotations and changing modes keeps canonical Score/IDs/ticks untouched", async () => {
  const score = fourNoteScore(); const before = JSON.stringify(score); await render(score); expect(annotations()).toEqual([]);
  for (const mode of ["letter", "fixed-do", "none"] as const) {
    captured.voices.length = 0; await render(score, mode);
    expect(annotations().map((label) => label.getText())).toEqual(mode === "none" ? [] : mode === "letter" ? ["C4", "D4", "E4", "G4"] : ["도", "레", "미", "솔"]);
    expect(JSON.stringify(score)).toBe(before);
  }
});
it("labels only tie heads, never rests or continuations; SVG attributes keep event mapping and pointer transparency", async () => {
  const score = tiedScore(); score.parts[0].measures[0].events.unshift(createRestEvent({ id: "rest", startTick: 0, durationTicks: 960 }));
  await render(score, "fixed-do"); expect(annotations()).toHaveLength(1); expect(annotations()[0].getText()).toBe("도");
  expect(captured.attrs).toContainEqual(["data-label-event-id", "t1"]);
  expect(captured.attrs).not.toContainEqual(["data-label-event-id", "t1:tie1"]);
  expect(captured.attrs).toContainEqual(["style", "pointer-events: none; user-select: none"]);
  expect(annotations()[0].getYShift()).toBe(12);
});
it.each(["major:2", "major:-5", "major:7"])("labels track %s preview/commit/undo/redo without mixing source and candidate", async (target) => {
  const source = fourNoteScore(); const session = createScoreStore(); session.init(source);
  expect(session.dispatch({ type: "TransposeScore", spec: { kind: "targetKey", targetKey: KEY_SIGNATURE_OPTIONS.find((option) => option.id === target)!.key }, updatedAt: "test" })?.ok).toBe(true);
  const changed = session.getState()!.current; await render(changed, "letter");
  const expected = target === "major:2" ? ["D4", "E4", "F♯4", "A4"] : target === "major:-5" ? ["D♭4", "E♭4", "F4", "A♭4"] : ["C♯4", "D♯4", "E♯4", "G♯4"];
  expect(annotations().map((label) => label.getText())).toEqual(expected);
  captured.voices.length = 0; session.undo(); await render(session.getState()!.current, "letter");
  expect(annotations().map((label) => label.getText())).toEqual(["C4", "D4", "E4", "G4"]);
  captured.voices.length = 0; session.redo(); await render(session.getState()!.current, "letter"); expect(annotations().map((label) => label.getText())).toEqual(expected);
});
it("dense measures use annotation-aware width and keep their notehead staff positions and exact duration", async () => {
  const score = baseScore(); score.parts[0].measures[0].events = Array.from({ length: 32 }, (_, index) => createNoteEvent({ id: `n${index}`, step: "B", alter: -2, octave: 3, startTick: index * 120, durationTicks: 120 }));
  await render(score, "letter"); expect(annotations()).toHaveLength(32); expect(captured.widths[0]).toBeGreaterThan(220);
  const notes = captured.voices[0] as StaveNote[];
  expect(notes.every((note) => note.getKeys()[0] === "bbb/3" && note.getTicks().value() === 512)).toBe(true);
});
it("outer SVG bounds expand to include labels rather than clipping the viewBox", async () => {
  const attrs = vi.fn(); const element = { innerHTML: "", querySelector: () => ({ getBBox: () => ({ x: -20, y: -10, width: 1100, height: 500 }), setAttribute: attrs }) };
  await renderScoreInto(element as unknown as HTMLDivElement, fourNoteScore(), { labelMode: "letter" });
  expect(attrs).toHaveBeenCalledWith("viewBox", "-28 -18 1116 516");
  expect(captured.sizes.at(-1)).toEqual([1116, 516]);
});

it("re-rendering labels retains active SVG event highlighting without adding event IDs to annotations", async () => {
  const attrs = vi.fn(); vi.mocked(StaveNote.prototype.getSVGElement).mockReturnValue({ setAttribute: attrs } as unknown as SVGElement);
  const element = { innerHTML: "", querySelectorAll: () => [{ getAttribute: () => "n1" }] };
  await renderScoreInto(element as unknown as HTMLDivElement, fourNoteScore(), { labelMode: "letter" });
  expect(attrs.mock.calls.slice(0, 3)).toEqual([["data-event-id", "n1"], ["pointer-events", "visiblePainted"], ["data-playing", "true"]]);
  expect(captured.attrs.every(([key]) => key !== "data-event-id")).toBe(true);
});

it.each([4, 32])("%s labels stay inside the measure including seven-sharp key/clef/meter space", async (count) => {
  const score = baseScore(); score.parts[0].keySignature = KEY_SIGNATURE_OPTIONS.find((option) => option.id === "major:7")!.key;
  score.parts[0].measures[0].events = Array.from({ length: count }, (_, index) => createNoteEvent({ id: `n${index}`, step: "C", alter: 1, octave: 4, startTick: index * (3840 / count), durationTicks: 3840 / count }));
  vi.spyOn(Stave.prototype, "getNoteStartX").mockImplementation(function (this: Stave) { return this.getX() + 160; });
  await render(score, "letter");
  for (const voice of captured.voices) for (const tickable of voice) {
    if (!(tickable instanceof StaveNote)) continue;
    const label = tickable.getModifiers().find((modifier) => modifier instanceof Annotation) as Annotation | undefined;
    if (!label) continue;
    expect(label.getWidth()).toBeGreaterThan(0);
    const center = tickable.getAbsoluteX() + tickable.getGlyphWidth() / 2;
    expect(center + label.getWidth() / 2).toBeLessThanOrEqual(tickable.checkStave().getNoteEndX());
    expect(center - label.getWidth() / 2).toBeGreaterThanOrEqual(tickable.checkStave().getX());
  }
});
