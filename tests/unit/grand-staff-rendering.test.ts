import { mockVexflowCssFont } from "../fixtures/vexflow-font";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Annotation, StaveNote, type Voice } from "vexflow";
import { renderScoreInto, staffRowGeometry } from "@/adapters/vexflow/renderScore";
import { createEmptyScore, createNoteEvent, createRestEvent, type Part, type Score } from "@/domain/score";

const capture = vi.hoisted(() => ({ voices: [] as { voice: Voice; clef: string; y: number }[], connectors: [] as string[] }));
vi.mock("vexflow", async (original) => {
  const v = await original<typeof import("vexflow")>();
  return { ...v,
    Renderer: class { static Backends = { SVG: 1 }; resize() {} getContext() { return {}; } },
    Stave: class extends v.Stave { draw() {} static formatBegModifiers(staves: InstanceType<typeof v.Stave>[]) { v.Stave.formatBegModifiers(staves); } },
    StaveConnector: class { type = ""; constructor() {} setType(type: string) { this.type = type; capture.connectors.push(type); return this; } setContext() { return this; } draw() {} },
    Voice: class extends v.Voice {
      draw(_context: unknown, stave?: InstanceType<typeof v.Stave>) {
        if (stave) this.getTickables().forEach((note) => note.setStave(stave));
        capture.voices.push({ voice: this, clef: stave?.getClef() ?? "per-note", y: stave?.getY() ?? -1 });
      }
    },
    StaveTie: class { setContext() { return this; } draw() {} },
  };
});
const at = "2026-11-15T00:00:00.000Z";
beforeEach(() => {
  mockVexflowCssFont();
  capture.voices.length = 0; capture.connectors.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(StaveNote.prototype, "getSVGElement").mockReturnValue(undefined);
  vi.spyOn(Annotation.prototype, "getSVGElement").mockReturnValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

function score(instrument: Part["instrument"]): Score {
  const base = createEmptyScore({ id: "g", createdAt: at, measureCount: 1 });
  const events = [
    createNoteEvent({ id: "hi", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
    createNoteEvent({ id: "lo", step: "E", octave: 2, startTick: 960, durationTicks: 960 }),
    createRestEvent({ id: "r", startTick: 1920, durationTicks: 960 }),
    createNoteEvent({ id: "top", step: "G", octave: 5, startTick: 2880, durationTicks: 960 }),
  ];
  return { ...base, parts: [{ ...base.parts[0], instrument, measures: [{ ...base.parts[0].measures[0], events }] }] };
}
const visible = (voice: Voice) => voice.getTickables().filter((note): note is StaveNote => note instanceof StaveNote)
  .map((note) => (note.isRest() ? "rest" : note.getKeys()[0]));

describe("renderScoreInto: 25현 가야금 on a grand staff", () => {
  it("keeps the melody one voice and draws each note on its staff: C4 and above on treble, below on bass", async () => {
    await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score("gayageum-25"));
    expect(capture.voices).toHaveLength(1);
    const glyphs = capture.voices[0].voice.getTickables().filter((note): note is StaveNote => note instanceof StaveNote);
    expect(glyphs.map((note) => [note.isRest() ? "rest" : note.getKeys()[0], note.getStave()!.getClef()])).toEqual([
      ["c/4", "treble"], ["e/2", "bass"], ["rest", "bass"], ["g/5", "treble"],
    ]);
    const [treble, bass] = [glyphs[0].getStave()!, glyphs[1].getStave()!];
    expect(bass.getY() - treble.getY()).toBe(staffRowGeometry(score("gayageum-25").parts[0], "none").bassOffset);
    expect(bass.getNoteStartX()).toBe(treble.getNoteStartX());
    // One x per beat, moving right through the measure across both staves.
    const xs = glyphs.map((note) => note.getAbsoluteX());
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(capture.connectors).toEqual(expect.arrayContaining(["brace", "singleLeft", "singleRight"]));
  });

  it("leaves the piano and the 12-string sanjo gayageum on one staff", async () => {
    for (const instrument of ["piano", "gayageum-12-sanjo"] as const) {
      capture.voices.length = 0; capture.connectors.length = 0;
      await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score(instrument));
      expect(capture.voices).toHaveLength(1);
      expect(capture.voices[0].clef).toBe("treble");
      expect(visible(capture.voices[0].voice)).toEqual(["c/4", "e/2", "rest", "g/5"]);
      expect(capture.connectors).toEqual([]);
      expect(staffRowGeometry(score(instrument).parts[0], "none").bassOffset).toBe(0);
    }
  });

  it("makes a grand-staff row taller by the bass staff, with and without labels", () => {
    const grand = score("gayageum-25").parts[0];
    const single = score("piano").parts[0];
    for (const mode of ["none", "letter"] as const) {
      const g = staffRowGeometry(grand, mode);
      const s = staffRowGeometry(single, mode);
      expect(g.bassOffset).toBeGreaterThan(0);
      expect(g.rowHeight).toBe(s.rowHeight + g.bassOffset);
    }
  });
});
