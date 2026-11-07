import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tickable, StaveNote } from "vexflow";
import { renderScoreInto } from "@/adapters/vexflow/renderScore";
import { createRestEvent, NOTATABLE_DURATIONS } from "@/domain/score";
import { baseScore, tiedScore, withMeasureEvents } from "../fixtures/scores";

const captured = vi.hoisted(() => ({ voices: [] as Tickable[][], ties: [] as { firstNote?: StaveNote; lastNote?: StaveNote }[] }));

// 실제 VexFlow StaveNote/GhostNote/Fraction을 사용한다. DOM 그리기만 대체한다.
vi.mock("vexflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vexflow")>();
  class Stave {
    addClef() { return this; } addKeySignature() { return this; }
    addTimeSignature() { return this; } setContext() { return this; } draw() {}
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
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
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
