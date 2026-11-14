import { describe, expect, it } from "vitest";
import {
  analyzeInstrumentFit, createEmptyScore, createNoteEvent, recommendTranspositions, selectableInstruments,
  type Score, type ScoreEvent,
} from "@/domain/score";

const at = "2026-11-15T00:00:00.000Z";
function score(events: ScoreEvent[], ties: { from: string; to: string }[] = []): Score {
  const base = createEmptyScore({ id: "s", createdAt: at, measureCount: 2 });
  const bar = 3840;
  const part = base.parts[0];
  return { ...base, parts: [{ ...part, ties: ties.map((tie) => ({ ...tie })),
    measures: part.measures.map((measure, index) => ({ ...measure,
      events: events.filter((event) => Math.floor(event.startTick / bar) === index) })) }] };
}
const note = (id: string, step: "C" | "D" | "E" | "F" | "G" | "A" | "B", octave: number, startTick: number, durationTicks = 960) =>
  createNoteEvent({ id, step, octave, startTick, durationTicks });

describe("악기에 맞추기 (B-3, decision 7)", () => {
  it("offers only instruments whose values are confirmed; the piri stays out until B-1 confirms it", () => {
    expect(selectableInstruments().map((profile) => profile.id)).toEqual(["piano", "gayageum-25", "gayageum-12-sanjo"]);
  });

  it("counts sounding notes outside the instrument's range, a tie continuation once", () => {
    // 12현 산조: G2 (43) – D5 (74). C2 (36) and F5 (77, tied over) are outside; G3 and C4 are inside.
    const s = score([note("low", "C", 2, 0), note("g3", "G", 3, 960), note("c4", "C", 4, 1920),
      note("f5a", "F", 5, 2880, 960), note("f5b", "F", 5, 3840, 960)], [{ from: "f5a", to: "f5b" }]);
    const fit = analyzeInstrumentFit(s, "gayageum-12-sanjo");
    expect(fit.range).toEqual({ minMidi: 43, maxMidi: 74 });
    expect(fit.outside).toEqual({ below: 1, above: 1, total: 2 });
    expect(fit.logicalNoteCount).toBe(4);
  });

  it("feeds the instrument range into the existing recommender: every candidate fits or is marked partial", () => {
    const s = score([note("low", "C", 2, 0), note("g3", "G", 3, 960), note("c4", "C", 4, 1920)]);
    const fit = analyzeInstrumentFit(s, "gayageum-12-sanjo");
    const result = recommendTranspositions(s, fit.range!);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.candidates[0].fits).toBe(true);
    for (const candidate of result.candidates) {
      const inside = candidate.analysis.minMidi! >= 43 && candidate.analysis.maxMidi! <= 74;
      expect(candidate.fits).toBe(inside);
    }
    // Analysis never changes the score.
    expect(s.parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 36 } });
  });

  it("suggests the bass clef when most notes sit below middle C, the treble clef otherwise, none on a grand staff", () => {
    const low = score([note("a", "C", 3, 0), note("b", "E", 3, 960), note("c", "G", 4, 1920)]);
    expect(analyzeInstrumentFit(low, "piano").suggestedClef).toBe("bass");
    const high = score([note("a", "C", 4, 0), note("b", "E", 4, 960), note("c", "G", 3, 1920)]);
    expect(analyzeInstrumentFit(high, "piano").suggestedClef).toBe("treble");
    expect(analyzeInstrumentFit(low, "gayageum-25").suggestedClef).toBeNull();
    expect(analyzeInstrumentFit(score([]), "piano").suggestedClef).toBeNull();
  });

  it("an unconfirmed instrument has no range to fit and counts nothing", () => {
    const fit = analyzeInstrumentFit(score([note("a", "C", 2, 0)]), "hyang-piri");
    expect(fit.range).toBeNull();
    expect(fit.outside).toEqual({ below: 0, above: 0, total: 0 });
  });
});
