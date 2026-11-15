import { describe, expect, it } from "vitest";
import { parseScoreSetup, SETUP_INSTRUMENTS } from "@/features/score-setup/setup";

describe("parseScoreSetup (Phase 7 /new, /record step 1)", () => {
  it("uses 4/4 · 90 BPM · C major · '새 악보' when nothing is given", () => {
    expect(parseScoreSetup({})).toEqual({ ok: true, setup: {
      title: "새 악보", tempoBpm: 90, timeSignature: { numerator: 4, denominator: 4 },
      keySignature: { tonic: "C", alter: 0, mode: "major", fifths: 0 }, instrument: "piano" } });
  });

  it("reads the chosen values and trims the title", () => {
    const result = parseScoreSetup({ title: "  아리랑 ", meter: "3/4", tempo: "72", key: "minor:-3", instrument: "gayageum-25" });
    expect(result).toEqual({ ok: true, setup: { title: "아리랑", tempoBpm: 72, timeSignature: { numerator: 3, denominator: 4 },
      keySignature: { tonic: "C", alter: 0, mode: "minor", fifths: -3 }, instrument: "gayageum-25" } });
  });

  it.each([
    [{ title: "   " }, "제목"],
    [{ meter: "5/4" }, "박자"],
    [{ tempo: "19" }, "템포"],
    [{ tempo: "401" }, "템포"],
    [{ tempo: "90.5" }, "템포"],
    [{ key: "major:9" }, "조성"],
    [{ instrument: "violin" }, "악기"],
    // Listed but not confirmed (B-1): refused even if the form is tampered with.
    [{ instrument: "hyang-piri" }, "악기"],
  ])("refuses %o", (values, word) => {
    const result = parseScoreSetup(values);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(word);
  });

  it("offers the confirmed instruments; the piri stays listed as 준비 중 until B-1 confirms it (B-6)", () => {
    expect(SETUP_INSTRUMENTS.filter((instrument) => instrument.available).map((instrument) => instrument.id))
      .toEqual(["piano", "gayageum-25", "gayageum-12-sanjo"]);
    expect(SETUP_INSTRUMENTS.map((instrument) => [instrument.id, instrument.label])).toEqual([
      ["piano", "피아노"], ["gayageum-25", "25현 가야금"], ["gayageum-12-sanjo", "12현 산조가야금"], ["hyang-piri", "향피리 (준비 중)"]]);
  });
});
