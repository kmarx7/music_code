import { describe, expect, it } from "vitest";
import {
  buildPianoKeys,
  midiToPitch,
  pitchFromComputerKey,
  PIANO_HIGH_MIDI,
  PIANO_LOW_MIDI,
} from "@/features/piano-input";

describe("piano key layout", () => {
  it("builds the full 88-key range", () => {
    const keys = buildPianoKeys();
    expect(keys).toHaveLength(88);
    expect(keys[0].midi).toBe(PIANO_LOW_MIDI);
    expect(keys[keys.length - 1].midi).toBe(PIANO_HIGH_MIDI);
    expect(keys.filter((key) => !key.isBlack)).toHaveLength(52);
    expect(keys.filter((key) => key.isBlack)).toHaveLength(36);
  });

  it("maps MIDI to consistent pitch spellings", () => {
    expect(midiToPitch(60)).toEqual({ midi: 60, step: "C", alter: 0, octave: 4 });
    expect(midiToPitch(61)).toEqual({ midi: 61, step: "C", alter: 1, octave: 4 });
    expect(midiToPitch(21)).toEqual({ midi: 21, step: "A", alter: 0, octave: 0 });
    expect(midiToPitch(108)).toEqual({ midi: 108, step: "C", alter: 0, octave: 8 });
  });
});

describe("computer keyboard mapping", () => {
  it("maps letters to fixed-Do-adjacent white keys", () => {
    expect(pitchFromComputerKey("a")?.midi).toBe(60);
    expect(pitchFromComputerKey("s")?.midi).toBe(62);
    expect(pitchFromComputerKey("d")?.midi).toBe(64);
    expect(pitchFromComputerKey("j")?.midi).toBe(71);
  });

  it("maps modifier keys to accidentals", () => {
    expect(pitchFromComputerKey("w")?.midi).toBe(61);
    expect(pitchFromComputerKey("e")?.midi).toBe(63);
    expect(pitchFromComputerKey("t")?.midi).toBe(66);
  });

  it("is case-insensitive and ignores unknown keys", () => {
    expect(pitchFromComputerKey("A")?.midi).toBe(60);
    expect(pitchFromComputerKey("z")).toBeNull();
    expect(pitchFromComputerKey("Enter")).toBeNull();
  });
});
