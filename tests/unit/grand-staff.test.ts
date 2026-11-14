import { describe, expect, it } from "vitest";
import {
  assignGrandStaves, createEmptyScore, createNoteEvent, createRestEvent, getInstrumentProfile, planPartNotation,
  usesGrandStaff, type Part, type ScoreEvent,
} from "@/domain/score";

const at = "2026-11-15T00:00:00.000Z";
function part(events: ScoreEvent[], instrument: Part["instrument"] = "gayageum-25", measureCount = 2): Part {
  const score = createEmptyScore({ id: "s", createdAt: at, measureCount });
  const base = score.parts[0];
  const bar = 3840;
  return { ...base, instrument, measures: base.measures.map((measure, index) => ({ ...measure,
    events: events.filter((event) => Math.floor(event.startTick / bar) === index) })) };
}
const note = (id: string, step: "C" | "B" | "E" | "G", octave: number, startTick: number, durationTicks = 960) =>
  createNoteEvent({ id, step, octave, startTick, durationTicks });
function staves(p: Part) {
  const plan = planPartNotation(p);
  if (!plan.ok) throw new Error(plan.issue.message);
  return assignGrandStaves(plan.measures);
}

describe("25현 큰보표 (B-1 answer: treble and bass together)", () => {
  it("only the 25-string gayageum uses the grand staff", () => {
    expect(getInstrumentProfile("gayageum-25").grandStaff).toBe(true);
    for (const id of ["piano", "gayageum-12-sanjo", "hyang-piri"] as const) expect(getInstrumentProfile(id).grandStaff).toBe(false);
    expect(usesGrandStaff(part([], "gayageum-25"))).toBe(true);
    expect(usesGrandStaff(part([], "piano"))).toBe(false);
    // A part without the field is a piano part (v2 documents, instrumentOf).
    const withoutInstrument: Part = { ...part([], "gayageum-25") };
    delete withoutInstrument.instrument;
    expect(usesGrandStaff(withoutInstrument)).toBe(false);
  });

  it("puts middle C and above on the treble staff (1), below it on the bass staff (2)", () => {
    const p = part([note("c4", "C", 4, 0), note("b3", "B", 3, 960), note("e2", "E", 2, 1920), note("g5", "G", 5, 2880)]);
    expect(staves(p)).toEqual([[1, 2, 2, 1], []]);
  });

  it("a rest follows the note before it, also across bar lines; a leading rest goes on the treble staff", () => {
    const p = part([
      createRestEvent({ id: "r0", startTick: 0, durationTicks: 960 }),
      note("low", "E", 2, 960),
      createRestEvent({ id: "r1", startTick: 1920, durationTicks: 960 }),
      createRestEvent({ id: "r2", startTick: 3840, durationTicks: 960 }),
      note("high", "G", 5, 4800),
      createRestEvent({ id: "r3", startTick: 5760, durationTicks: 960 }),
    ]);
    expect(staves(p)).toEqual([[1, 2, 2], [2, 1, 1]]);
  });

  it("every glyph of a note tied across a bar line stays on the note's staff", () => {
    const tied = { ...part([note("a", "E", 2, 2880), note("b", "E", 2, 3840)]), ties: [{ from: "a", to: "b" }] };
    expect(staves(tied)).toEqual([[2], [2]]);
  });
});
