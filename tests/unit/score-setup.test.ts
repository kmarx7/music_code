import { describe, expect, it } from "vitest";
import { parseScoreSetup, SETUP_INSTRUMENTS } from "@/features/score-setup/setup";

describe("parseScoreSetup (Phase 7 /new, /record step 1)", () => {
  it("uses 4/4 · 90 BPM · C major · '새 악보' when nothing is given", () => {
    expect(parseScoreSetup({})).toEqual({ ok: true, setup: {
      title: "새 악보", tempoBpm: 90, timeSignature: { numerator: 4, denominator: 4 },
      keySignature: { tonic: "C", alter: 0, mode: "major", fifths: 0 } } });
  });

  it("reads the chosen values and trims the title", () => {
    const result = parseScoreSetup({ title: "  아리랑 ", meter: "3/4", tempo: "72", key: "minor:-3" });
    expect(result).toEqual({ ok: true, setup: { title: "아리랑", tempoBpm: 72, timeSignature: { numerator: 3, denominator: 4 },
      keySignature: { tonic: "C", alter: 0, mode: "minor", fifths: -3 } } });
  });

  it.each([
    [{ title: "   " }, "제목"],
    [{ meter: "5/4" }, "박자"],
    [{ tempo: "19" }, "템포"],
    [{ tempo: "401" }, "템포"],
    [{ tempo: "90.5" }, "템포"],
    [{ key: "major:9" }, "조성"],
  ])("refuses %o", (values, word) => {
    const result = parseScoreSetup(values);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(word);
  });

  it("offers only the piano until Track B confirms the instrument values", () => {
    expect(SETUP_INSTRUMENTS.filter((instrument) => instrument.available).map((instrument) => instrument.id)).toEqual(["piano"]);
    // Every listed instrument is one a Score can carry; the Korean ones wait for B-3–B-6 (향피리 on hold).
    expect(SETUP_INSTRUMENTS.map((instrument) => instrument.id)).toEqual(["piano", "gayageum-25", "gayageum-12-sanjo", "hyang-piri"]);
  });
});
