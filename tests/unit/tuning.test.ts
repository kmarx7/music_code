import { describe, expect, it } from "vitest";
import {
  createEmptyScore, createNoteEvent, pressedNoteIds, recommendTunings, getInstrumentProfile,
  type Part, type Score, type ScoreEvent,
} from "@/domain/score";

const at = "2026-11-15T00:00:00.000Z";
function score(events: ScoreEvent[], instrument: Part["instrument"], fifths = 0, ties: { from: string; to: string }[] = []): Score {
  const base = createEmptyScore({ id: "s", createdAt: at, measureCount: 2 });
  const part = base.parts[0];
  return { ...base, parts: [{ ...part, instrument, keySignature: { ...part.keySignature, fifths }, ties,
    measures: part.measures.map((measure, index) => ({ ...measure,
      events: events.filter((event) => Math.floor(event.startTick / 3840) === index) })) }] };
}
type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B";
const note = (id: string, step: Step, octave: number, startTick: number, alter: -1 | 0 | 1 = 0, durationTicks = 960) =>
  createNoteEvent({ id, step, octave, alter, startTick, durationTicks });

describe("25현 조율 추천과 누름 판정 (B-4, decision 8)", () => {
  it("marks every attack that is not an open string, a tie continuation once, at the lowest and highest strings", () => {
    const eb = getInstrumentProfile("gayageum-25").tunings[0];
    // Eb2 (lowest string) and Ab5 (highest) are open; E2 and A5 are a semitone off; D3 is open in Eb조.
    const s = score([note("eb2", "E", 2, 0, -1), note("e2", "E", 2, 960), note("ab5", "A", 5, 1920, -1),
      note("a5a", "A", 5, 2880), note("a5b", "A", 5, 3840), note("d3", "D", 3, 4800)], "gayageum-25", -3,
      [{ from: "a5a", to: "a5b" }]);
    expect([...pressedNoteIds(s.parts[0], eb)].sort()).toEqual(["a5a", "e2"]);
  });

  it("Ab조 presses the D strings that Eb조 plays open", () => {
    const [eb, ab] = getInstrumentProfile("gayageum-25").tunings;
    const s = score([note("d4", "D", 4, 0), note("db4", "D", 4, 960, -1)], "gayageum-25");
    expect([...pressedNoteIds(s.parts[0], eb)]).toEqual(["db4"]);
    expect([...pressedNoteIds(s.parts[0], ab)]).toEqual(["d4"]);
  });

  it("recommends the tuning with the fewest presses; a tie goes to the tuning of the score's key", () => {
    const ab = score([note("db4", "D", 4, 0, -1), note("ab4", "A", 4, 960, -1)], "gayageum-25", -4);
    expect(recommendTunings(ab).map((entry) => [entry.tuning.id, entry.pressed, entry.keyMatch]))
      .toEqual([["ab", 0, true], ["eb", 1, false]]);
    // No note tells them apart: the key decides (Ab major, 4 flats).
    const neutral = score([note("c4", "C", 4, 0)], "gayageum-25", -4);
    expect(recommendTunings(neutral).map((entry) => entry.tuning.id)).toEqual(["ab", "eb"]);
    // An empty score with a key matching neither keeps the profile order.
    expect(recommendTunings(score([], "gayageum-25", 0)).map((entry) => entry.tuning.id)).toEqual(["eb", "ab"]);
  });

  it("12현 산조 has one tuning; notes above the top string are presses", () => {
    const s = score([note("d5", "D", 5, 0), note("e5", "E", 5, 960)], "gayageum-12-sanjo");
    const [only] = recommendTunings(s);
    expect(only).toMatchObject({ pressed: 1 });
    expect([...pressedNoteIds(s.parts[0], only.tuning)]).toEqual(["e5"]);
  });

  it("instruments without tunings recommend nothing", () => {
    expect(recommendTunings(score([note("c4", "C", 4, 0)], "piano"))).toEqual([]);
    expect(recommendTunings(score([note("c4", "C", 4, 0)], "hyang-piri"))).toEqual([]);
  });
});

describe("인쇄 주소에 조율 전달 (B-4)", () => {
  it("keeps the old label-only path and adds the tuning only when one is shown", async () => {
    const { printPath } = await import("@/features/export/ExportControls");
    expect(printPath("a b", "none")).toBe("/print/a%20b");
    expect(printPath("s", "letter")).toBe("/print/s?labels=letter");
    expect(printPath("s", "letter", "eb")).toBe("/print/s?labels=letter&tuning=eb");
    expect(printPath("s", "none", "ab")).toBe("/print/s?tuning=ab");
  });
});
