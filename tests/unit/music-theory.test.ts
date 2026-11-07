import { describe, expect, it } from "vitest";
import {
  createPitch,
  koreanFixedDo,
  letterName,
  midiFromSpelling,
} from "@/domain/music-theory/pitch";
import { TICKS_PER_QUARTER } from "@/domain/score/constants";

describe("music theory — pitch spelling", () => {
  it("maps natural spellings to MIDI numbers", () => {
    expect(midiFromSpelling("C", 0, 4)).toBe(60);
    expect(midiFromSpelling("D", 0, 4)).toBe(62);
    expect(midiFromSpelling("E", 0, 4)).toBe(64);
    expect(midiFromSpelling("G", 0, 4)).toBe(67);
    expect(midiFromSpelling("C", 0, 3)).toBe(48);
  });

  it("handles alterations", () => {
    expect(midiFromSpelling("F", 1, 4)).toBe(66);
    expect(midiFromSpelling("B", -1, 4)).toBe(70);
  });

  it("creates a consistent Pitch object", () => {
    const pitch = createPitch("F", 1, 4);
    expect(pitch).toEqual({ midi: 66, step: "F", alter: 1, octave: 4 });
  });

  it("renders letter and fixed-Do labels", () => {
    expect(letterName(createPitch("C", 0, 4))).toBe("C4");
    expect(letterName(createPitch("F", 1, 4))).toBe("F#4");
    expect(letterName(createPitch("B", -1, 4))).toBe("Bb4");
    expect(koreanFixedDo(createPitch("C", 0, 4))).toBe("도");
    expect(koreanFixedDo(createPitch("G", 0, 4))).toBe("솔");
    expect(koreanFixedDo(createPitch("F", 1, 4))).toBe("파#");
  });

  it("uses 960 ticks per quarter note", () => {
    expect(TICKS_PER_QUARTER).toBe(960);
  });
});
