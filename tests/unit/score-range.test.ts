import { expect, it } from "vitest";
import { analyzeScoreRange, recommendTranspositions, transposeScore, createNoteEvent, createRestEvent, validateScore, type Score, type TargetMidiRange } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { baseScore, fourNoteScore, tiedScore } from "../fixtures/scores";
function single(step: "C" | "G" = "C", octave = 4) {
  const score = baseScore(); score.parts[0].measures[0].events = [createNoteEvent({ id: "note", step, octave, startTick: 0, durationTicks: 960 })]; return score;
}
function recommendations(score: Score = fourNoteScore(), target: TargetMidiRange = { minMidi: 62, maxMidi: 69 }) {
  const result = recommendTranspositions(score, target); if (!result.ok) throw new Error(result.error.message); return result;
}
function freeze<T>(object: T): T {
  if (object && typeof object === "object") { Object.values(object).forEach(freeze); Object.freeze(object); } return object;
}
it("single and multiple notes expose actual MIDI, original spelling, span and both counts", () => {
  expect(analyzeScoreRange(single())).toMatchObject({ empty: false, minMidi: 60, maxMidi: 60, lowestName: "C4", highestName: "C4", spanSemitones: 0, noteEventCount: 1, logicalNoteCount: 1 });
  expect(analyzeScoreRange(fourNoteScore())).toMatchObject({ minMidi: 60, maxMidi: 67, spanSemitones: 7, noteEventCount: 4, logicalNoteCount: 4 });
});
it("empty and rest-only scores return null extrema rather than invented pitches or candidates", () => {
  const score = baseScore(); score.parts[0].measures[0].events = [createRestEvent({ id: "rest", startTick: 0, durationTicks: 960 })];
  for (const input of [baseScore(), score]) {
    expect(analyzeScoreRange(input)).toMatchObject({ empty: true, minMidi: null, maxMidi: null, lowestName: null, highestName: null, spanSemitones: null, noteEventCount: 0, logicalNoteCount: 0 });
    expect(recommendations(input).candidates).toEqual([]);
  }
});
it("ties count separate notated events but only one logical attack; repeated untied MIDI remains separate", () => {
  const tied = tiedScore(); tied.parts[0].measures[0].events.unshift(createRestEvent({ id: "rest", startTick: 0, durationTicks: 960 }));
  expect(analyzeScoreRange(tied)).toMatchObject({ minMidi: 60, maxMidi: 60, noteEventCount: 2, logicalNoteCount: 1 });
  const repeated = fourNoteScore(); repeated.parts[0].measures[0].events = Array.from({ length: 4 }, (_, i) => createNoteEvent({ id: `n${i}`, step: "C", octave: 4, startTick: i * 960, durationTicks: 960 }));
  expect(analyzeScoreRange(repeated).logicalNoteCount).toBe(4);
});
it("all Parts contribute even when the extreme note is outside the displayed first Part", () => {
  const score = fourNoteScore(); const high = structuredClone(single("G", 9).parts[0]); high.id = "high";
  high.measures.forEach((m) => { m.id += ":high"; m.events.forEach((e) => { e.id += ":high"; }); }); score.parts.push(high);
  const range = analyzeScoreRange(score); expect(range).toMatchObject({ minMidi: 60, maxMidi: 127, spanSemitones: 67, noteEventCount: 5, logicalNoteCount: 5 });
  expect(range.parts[1]).toMatchObject({ partId: "high", minMidi: 127, maxMidi: 127 });
  expect(recommendations(score, { minMidi: 60, maxMidi: 67 }).candidates.every((c) => !c.fits)).toBe(true);
});
it("numeric analysis includes MIDI 0/127; recommendation still rejects octave -1 as invalid Score v2", () => {
  const score = single("C", -1); score.parts[0].measures[0].events.push(createNoteEvent({ id: "top", step: "G", octave: 9, startTick: 960, durationTicks: 960 }));
  expect(analyzeScoreRange(score)).toMatchObject({ minMidi: 0, maxMidi: 127, spanSemitones: 127 });
  expect(validateScore(score).length).toBeGreaterThan(0);
  expect(recommendTranspositions(score, { minMidi: 0, maxMidi: 127 })).toMatchObject({ ok: false, error: { code: "INVALID_SCORE" } });
});
it("equal MIDI retains the first enharmonic spelling and detached extrema cannot mutate the input", () => {
  const score = single(); score.parts[0].measures[0].events = [createNoteEvent({ id: "sharp", step: "B", alter: 1, octave: 3, startTick: 0, durationTicks: 960 }), createNoteEvent({ id: "c", step: "C", octave: 4, startTick: 960, durationTicks: 960 })];
  const result = analyzeScoreRange(score); expect(result).toMatchObject({ lowestName: "B♯3", highestName: "B♯3", spanSemitones: 0 });
  const note = score.parts[0].measures[0].events[0]; if (note.kind !== "note") throw new Error("fixture");
  expect(result.lowest).not.toBe(note.pitch);
  const before = JSON.stringify(score); analyzeScoreRange(freeze(score)); expect(JSON.stringify(score)).toBe(before);
});
it.each([
  { minMidi: -1, maxMidi: 70 }, { minMidi: 60, maxMidi: 128 }, { minMidi: 70, maxMidi: 60 },
  { minMidi: 60.5, maxMidi: 70 }, { minMidi: NaN, maxMidi: 70 }, { minMidi: 60, maxMidi: Infinity },
])("rejects invalid target range %j", (target) => {
  const score = freeze(fourNoteScore()); const before = JSON.stringify(score);
  expect(recommendTranspositions(score, target)).toMatchObject({ ok: false, error: { code: "INVALID_TARGET_RANGE" } }); expect(JSON.stringify(score)).toBe(before);
});
it("ranks a whole-score D major fit before closer partial fits and records all boundaries", () => {
  const result = recommendations(); const first = result.candidates[0];
  expect(first).toMatchObject({ fits: true, interval: { deltaSemitones: 2, diatonicSteps: 1 }, targetKey: { tonic: "D", fifths: 2 }, analysis: { minMidi: 62, maxMidi: 69 }, violations: [] });
  const partial = result.candidates.find((candidate) => candidate.id === "0:0")!;
  expect(partial).toMatchObject({ fits: false, belowSemitones: 2, aboveSemitones: 0 });
  expect(partial.violations).toMatchObject([{ eventId: "n1", midi: 60, side: "below", excessSemitones: 2 }]);
});
it("sorts equal distances upward first and reuses the engine's Db/Gb automatic spelling preference", () => {
  const candidates = recommendations(fourNoteScore(), { minMidi: 0, maxMidi: 127 }).candidates;
  expect(candidates[0].id).toBe("0:0");
  expect(candidates.findIndex((c) => c.interval.deltaSemitones === 1)).toBeLessThan(candidates.findIndex((c) => c.interval.deltaSemitones === -1));
  expect(candidates.find((c) => c.interval.deltaSemitones === 1)!.targetKey.fifths).toBe(-5);
  expect(candidates.find((c) => c.interval.deltaSemitones === 6)!.targetKey.fifths).toBe(-6);
  expect(candidates.findIndex((c) => c.interval.deltaSemitones === 6)).toBeLessThan(candidates.findIndex((c) => c.interval.deltaSemitones === -6));
});
it("includes supported octave shifts beyond target-key up/down's one-octave interval", () => {
  const first = recommendations(fourNoteScore(), { minMidi: 84, maxMidi: 91 }).candidates[0];
  expect(first).toMatchObject({ fits: true, spec: { kind: "semitones", semitones: 24 }, interval: { deltaSemitones: 24, diatonicSteps: 14 }, analysis: { minMidi: 84, maxMidi: 91 } });
});
it("only generates same-mode targets for minor scores and removes equivalent direction results", () => {
  const score = fourNoteScore(); score.parts[0].keySignature = KEY_SIGNATURE_OPTIONS.find((option) => option.id === "minor:0")!.key;
  const result = recommendations(score); expect(result.candidates[0].targetKey.mode).toBe("minor"); expect(result.candidates.every((c) => c.targetKey.mode === "minor")).toBe(true);
  expect(new Set(result.candidates.map((c) => c.id)).size).toBe(result.candidates.length);
  expect(result.candidates[0].interval.deltaSemitones).toBe(2);
});
it("returns an explicit no-fit set with logical violations instead of claiming partial fits are complete", () => {
  const result = recommendations(fourNoteScore(), { minMidi: 64, maxMidi: 64 });
  expect(result.candidates.every((candidate) => !candidate.fits)).toBe(true);
  expect(result.candidates[0]).toMatchObject({ belowSemitones: 4, aboveSemitones: 3 }); expect(result.candidates[0].violations).toHaveLength(3);
  const tied = recommendations(tiedScore(), { minMidi: 65, maxMidi: 65 }).candidates.find((c) => c.id === "0:0")!;
  expect(tied.violations).toHaveLength(1);
});
it("records unsupported source keys, MIDI limits, octave limits and alter failures without exposing invalid candidates", () => {
  const unsupported = fourNoteScore(); unsupported.parts[0].keySignature = { tonic: "D", alter: 0, mode: "major", fifths: 0 };
  expect(recommendTranspositions(unsupported, { minMidi: 0, maxMidi: 127 })).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_KEY_SIGNATURE" } });
  const extremes = single("C", 0); extremes.parts[0].measures[0].events.push(createNoteEvent({ id: "high", step: "G", octave: 9, startTick: 960, durationTicks: 960 }));
  const result = recommendations(extremes, { minMidi: 0, maxMidi: 127 });
  expect(result.rejected.some((r) => r.error.code === "MIDI_OUT_OF_RANGE")).toBe(true); expect(result.rejected.some((r) => r.error.code === "PITCH_NOT_REPRESENTABLE")).toBe(true);
  const altered = single(); altered.parts[0].measures[0].events = [createNoteEvent({ id: "n", step: "E", alter: 2, octave: 4, startTick: 0, durationTicks: 960 })];
  const alteredResult = recommendations(altered, { minMidi: 0, maxMidi: 127 });
  expect(alteredResult.rejected.some((r) => r.spec.kind === "targetKey" && r.spec.targetKey.fifths === 7 && r.error.code === "PITCH_NOT_REPRESENTABLE")).toBe(true);
});
it("every candidate replays through the existing engine with the same range and unchanged IDs/metadata/ties", () => {
  const score = tiedScore(); const before = JSON.stringify(score); freeze(score);
  const first = recommendations(score, { minMidi: 0, maxMidi: 127 });
  expect(recommendations(score, { minMidi: 0, maxMidi: 127 })).toEqual(first);
  for (const candidate of first.candidates) {
    const replay = transposeScore(score, candidate.spec); if (!replay.ok) throw new Error(replay.error.message);
    expect(validateScore(replay.value.score)).toEqual([]); expect(analyzeScoreRange(replay.value.score)).toEqual(candidate.analysis);
    expect(replay.value.interval).toEqual(candidate.interval); expect(replay.value.score.id).toBe(score.id);
    expect(replay.value.score.updatedAt).toBe(score.updatedAt); expect(replay.value.score.createdAt).toBe(score.createdAt);
    expect(replay.value.score.parts[0].ties).toEqual(score.parts[0].ties);
    expect(replay.value.score.parts[0].measures.map((m) => [m.id, ...m.events.map((e) => [e.id, e.startTick, e.durationTicks])])).toEqual(score.parts[0].measures.map((m) => [m.id, ...m.events.map((e) => [e.id, e.startTick, e.durationTicks])]));
  }
  expect(JSON.stringify(score)).toBe(before);
});
