import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaveNote, type Accidental, type Tickable } from "vexflow";
import { renderScoreInto } from "@/adapters/vexflow/renderScore";
import { createNoteEvent, createRestEvent, NOTATABLE_DURATIONS } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { applyEditCommand } from "@/domain/commands";
import { baseScore, tiedScore, withMeasureEvents } from "../fixtures/scores";

const captured = vi.hoisted(() => ({ voices: [] as Tickable[][], ties: [] as { firstNote?: StaveNote; lastNote?: StaveNote }[], keys: [] as string[], meters: [] as string[] }));

// 실제 VexFlow StaveNote/GhostNote/Fraction을 사용한다. DOM 그리기만 대체한다.
vi.mock("vexflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vexflow")>();
  class Stave {
    constructor(private x = 0) {}
    getNoteStartX() { return this.x + 20; } getNoteEndX() { return this.x + 200; }
    addClef() { return this; } addKeySignature(key: string) { captured.keys.push(key); return this; }
    addTimeSignature(meter: string) { captured.meters.push(meter); return this; } setContext() { return this; } draw() {}
  }
  return { ...actual,
    Renderer: class { static Backends = { SVG: 1 }; resize() {} getContext() { return {}; } },
    Stave,
    Voice: class extends actual.Voice {
      addTickables(notes: Tickable[]) { captured.voices.push(notes); return super.addTickables(notes); }
      draw() {}
    },
    Formatter: class { joinVoices() { return this; } format() { return this; } },
    StaveTie: class {
      constructor(notes: { firstNote?: StaveNote; lastNote?: StaveNote }) { captured.ties.push(notes); }
      setContext() { return this; } draw() {}
    },
  };
});

beforeEach(() => {
  captured.voices.length = 0; captured.ties.length = 0;
  captured.keys.length = 0; captured.meters.length = 0;
  vi.spyOn(StaveNote.prototype, "getSVGElement").mockReturnValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("score settings rendering", () => {
  it.each([
    { id: "major:1", step: "F", alter: 0, spec: "G", accidental: "n" },
    { id: "major:-2", step: "B", alter: 0, spec: "Bb", accidental: "n" },
    { id: "major:1", step: "F", alter: 1, spec: "G", accidental: undefined },
    { id: "major:0", step: "F", alter: 1, spec: "C", accidental: "#" },
    { id: "major:0", step: "B", alter: -1, spec: "C", accidental: "b" },
    { id: "minor:-1", step: "B", alter: 0, spec: "F", accidental: "n" },
  ] as const)("renders $id with correct sounding spelling ($step/$alter)", async ({ id, step, alter, spec, accidental }) => {
    const score = withMeasureEvents(baseScore(), [createNoteEvent({ id: "n", step, alter, octave: 4, startTick: 0, durationTicks: 960 })]);
    const keySignature = KEY_SIGNATURE_OPTIONS.find((option) => option.id === id)!.key;
    const changed = applyEditCommand(score, { type: "SetKeySignature", partId: score.parts[0].id, keySignature,
      updatedAt: "2026-11-08T01:00:00.000Z" });
    if (!changed.ok) throw new Error(changed.error.message);
    await renderScoreInto({ innerHTML: "" } as HTMLDivElement, changed.score);
    expect(captured.keys).toContain(spec);
    const note = captured.voices[0][0] as StaveNote;
    const accidentals = note.getModifiers().filter((modifier) => modifier.getCategory() === "Accidental") as Accidental[];
    expect(accidentals.map((modifier) => modifier.type)).toEqual(accidental ? [accidental] : []);
    expect(changed.score.parts[0].measures[0].events).toBe(score.parts[0].measures[0].events);
  });

  it("renders the changed empty-score meter", async () => {
    const score = baseScore();
    const changed = applyEditCommand(score, { type: "SetTimeSignature", partId: score.parts[0].id,
      timeSignature: { numerator: 6, denominator: 8 }, updatedAt: "2026-11-08T01:00:00.000Z" });
    if (!changed.ok) throw new Error(changed.error.message);
    await renderScoreInto({ innerHTML: "" } as HTMLDivElement, changed.score);
    expect(captured.meters).toEqual(["6/8"]);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("rest rendering adapter with real VexFlow tickables", () => {
  it.each(NOTATABLE_DURATIONS.filter((spec) => spec.ticks <= 3840))(
    "maps rest $base:$dots to exact VexFlow rest duration", async ({ ticks }) => {
      const score = withMeasureEvents(baseScore(), [createRestEvent({ id: "r", startTick: 0, durationTicks: ticks })]);
      const before = JSON.stringify(score);
      await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score);
      const rest = captured.voices[0][0] as StaveNote;
      expect(rest.isRest()).toBe(true);
      expect(rest.getTicks().value()).toBeCloseTo(ticks * 4096 / 960);
      expect(JSON.stringify(score)).toBe(before);
    },
  );

  it("fills leading and internal gaps with GhostNotes while retaining tie endpoints", async () => {
    const score = tiedScore();
    score.parts[0].measures[0].events.unshift(createRestEvent({ id: "r", startTick: 960, durationTicks: 480 }));
    const before = JSON.stringify(score);
    await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score);
    const { GhostNote } = await import("vexflow");
    const first = captured.voices[0];
    expect(first).toHaveLength(4);
    expect(first[0]).toBeInstanceOf(GhostNote);
    expect(first[0].getTicks().value()).toBe(4096);
    expect(first[2]).toBeInstanceOf(GhostNote);
    expect(first[2].getTicks().value()).toBe(6144);
    expect(captured.ties[0].firstNote).toBe(first[3]);
    expect(captured.ties[0].lastNote).toBe(captured.voices[1][0]);
    expect(JSON.stringify(score)).toBe(before);
  });

  it("uses the part clef for rests and sorts derived rendering input only", async () => {
    const score = withMeasureEvents(baseScore(), [
      createRestEvent({ id: "later", startTick: 960, durationTicks: 960 }),
      createRestEvent({ id: "first", startTick: 0, durationTicks: 480 }),
    ]);
    score.parts[0].clef = "bass";
    await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score);
    const rest = captured.voices[0][0] as StaveNote;
    expect(rest.getKeyProps()[0].line).toBe(3);
    expect(rest.getTicks().value()).toBe(2048);
    expect(score.parts[0].measures[0].events[0].id).toBe("later");
  });
});

it("links rendered SVG note/rest groups to canonical event IDs for cursor highlighting", async () => {
  const attribute = vi.fn();
  vi.mocked(StaveNote.prototype.getSVGElement).mockReturnValue({ setAttribute: attribute } as unknown as SVGElement);
  const score = tiedScore();
  score.parts[0].measures[0].events.unshift(createRestEvent({ id: "rest", startTick: 0, durationTicks: 960 }));
  await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score);
  expect(attribute.mock.calls).toEqual([["data-event-id", "rest"], ["data-event-id", "t1"], ["data-event-id", "t1:tie1"]]);
});

it.each([[0, 30], [4800, 295], [7680, 430]])("renders an empty-gap/end edit cursor at tick %s without changing Score", async (tick, x) => {
  const attributes: Record<string, string> = {};
  const appendChild = vi.fn();
  const element = { innerHTML: "", querySelector: () => ({ appendChild }),
    ownerDocument: { createElementNS: () => ({ setAttribute: (key: string, value: string) => { attributes[key] = value; } }) } };
  const score = baseScore(); const before = JSON.stringify(score);
  await renderScoreInto(element as unknown as HTMLDivElement, score, { cursorTick: tick });
  expect(appendChild).toHaveBeenCalledTimes(1);
  expect(attributes).toMatchObject({ "data-testid": "staff-edit-cursor", "data-tick": String(tick), x1: String(x), x2: String(x) });
  expect(JSON.stringify(score)).toBe(before);
});

it("aligns the edit cursor with a rendered note without altering existing ties", async () => {
  vi.spyOn(StaveNote.prototype, "getAbsoluteX").mockReturnValue(150);
  const { GhostNote } = await import("vexflow");
  vi.spyOn(GhostNote.prototype, "getAbsoluteX").mockReturnValue(30);
  const attributes: Record<string, string> = {};
  const element = { innerHTML: "", querySelector: () => ({ appendChild() {} }),
    ownerDocument: { createElementNS: () => ({ setAttribute: (key: string, value: string) => { attributes[key] = value; } }) } };
  const score = tiedScore(); const before = JSON.stringify(score);
  await renderScoreInto(element as unknown as HTMLDivElement, score, { cursorTick: 2880 });
  expect(attributes.x1).toBe("150"); expect(captured.ties).toHaveLength(1);
  expect(JSON.stringify(score)).toBe(before);
});
