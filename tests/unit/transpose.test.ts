import { describe, expect, it } from "vitest";
import { KEY_SIGNATURE_OPTIONS, createPitch, intervalBetweenKeys, midiFromSpelling, transposeKeySignature, transposePitch } from "@/domain/music-theory";
import type { TransposeResult } from "@/domain/music-theory";
import { createNoteEvent, createRestEvent, mergeTiedNotes, transposeScore, validateScore } from "@/domain/score";
import type { DiatonicStep, KeySignature, Pitch, Score } from "@/domain/score";
import { applyEditCommand } from "@/domain/commands";
import { baseScore, tiedScore, withMeasureEvents } from "../fixtures/scores";

function value<T>(result: TransposeResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
function key(name: string, mode = "major"): KeySignature {
  const option = KEY_SIGNATURE_OPTIONS.find(({ label, key }) => label.startsWith(`${name} `) && key.mode === mode);
  if (!option) throw new Error(`unknown test key ${name}/${mode}`);
  return { ...option.key };
}
function p(name: string, octave = 4): Pitch {
  const alter = [...name.slice(1)].reduce((sum, symbol) => sum + (symbol === "#" ? 1 : -1), 0);
  return createPitch(name[0] as DiatonicStep, alter, octave);
}
function melody(pitches: Pitch[], signature = key("C")): Score {
  const score = withMeasureEvents(baseScore(), pitches.map((pitch, index) => ({
    ...createNoteEvent({ id: `n${index}`, step: pitch.step, alter: pitch.alter, octave: pitch.octave, startTick: index * 480, durationTicks: 480 }), pitch,
  })));
  return { ...score, parts: [{ ...score.parts[0], keySignature: signature }] };
}
function pitches(score: Score): Pitch[] {
  return score.parts.flatMap((part) => part.measures.flatMap((measure) => measure.events.flatMap((event) => event.kind === "note" ? [event.pitch] : [])));
}
function frozen<T>(object: T): T {
  if (object && typeof object === "object") {
    Object.values(object).forEach(frozen); Object.freeze(object);
  }
  return object;
}

describe("written and sounding intervals", () => {
  it.each([
    ["C", "D", "nearest", 2, 1], ["C", "C#", "nearest", 1, 0], ["C", "Db", "nearest", 1, 1],
    ["C", "B", "up", 11, 6], ["C", "B", "down", -1, -1], ["C", "B", "nearest", -1, -1],
    ["C", "F#", "nearest", 6, 3], ["C", "Gb", "nearest", 6, 4],
    ["C", "F#", "down", -6, -4], ["F#", "C", "nearest", 6, 4],
    ["Cb", "B", "nearest", 0, -1], ["B", "Cb", "nearest", 0, 1],
    ["C#", "Db", "nearest", 0, 1], ["Db", "C#", "nearest", 0, -1],
    ["C", "C", "up", 0, 0], ["C", "C", "down", 0, 0],
  ] as const)("%s → %s (%s) = %i semitones, %i letter steps", (source, target, direction, deltaSemitones, diatonicSteps) => {
    expect(value(intervalBetweenKeys(key(source), key(target), direction))).toEqual({ deltaSemitones, diatonicSteps });
  });
  it("rejects cross-mode conversion without pretending it is a uniform transpose", () => {
    expect(intervalBetweenKeys(key("C"), key("D", "minor"))).toMatchObject({ ok: false, error: { code: "MODE_CHANGE_NOT_SUPPORTED" } });
  });
  it("rejects inconsistent key tuples even though the legacy Score validator accepts their shape", () => {
    const bad = { ...key("C"), fifths: 2 };
    expect(intervalBetweenKeys(bad, key("D"))).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_KEY_SIGNATURE" } });
    expect(intervalBetweenKeys(key("C"), bad)).toMatchObject({ ok: false });
    expect(transposeScore(melody([p("C")], bad), { kind: "semitones", semitones: 2 })).toMatchObject({ ok: false });
  });
  it("rejects an invalid runtime direction", () => {
    expect(intervalBetweenKeys(key("C"), key("D"), "sideways" as "up")).toMatchObject({ ok: false, error: { code: "INVALID_TRANSPOSE" } });
  });
});

describe("Pitch and key primitives", () => {
  it.each([
    [p("E"), 1, 0, p("E#")], [p("B"), 1, 0, p("B#")],
    [p("E"), 1, 1, p("F")], [p("B"), 1, 1, p("C", 5)],
    [p("C"), -1, 0, p("Cb")], [p("C"), -1, -1, p("B", 3)],
    [p("F#"), 2, 1, p("G#")], [p("Bb"), 2, 1, p("C", 5)],
    [p("F#"), 1, 0, p("F##")], [p("Bb"), -1, 0, p("Bbb")],
    [p("C"), 12, 7, p("C", 5)], [p("C"), -12, -7, p("C", 3)],
  ] as const)("preserves a specific interval's spelling (%#)", (source, deltaSemitones, diatonicSteps, expected) => {
    const result = value(transposePitch(frozen(source), { deltaSemitones, diatonicSteps }));
    expect(result).toEqual(expected);
    expect(midiFromSpelling(result.step, result.alter, result.octave)).toBe(result.midi);
  });
  it.each([
    [p("G", 9), 1, 1, "MIDI_OUT_OF_RANGE"], [p("C", 0), -13, -7, "MIDI_OUT_OF_RANGE"],
    [p("C", 0), -12, -7, "PITCH_NOT_REPRESENTABLE"], // MIDI 0 is valid, octave -1 is not.
    [p("C", 0), -1, -1, "PITCH_NOT_REPRESENTABLE"], // MIDI 11 needs B-1 for this interval.
    [p("G", 9), 0, 4, "PITCH_NOT_REPRESENTABLE"],
    [p("E##"), 1, 0, "PITCH_NOT_REPRESENTABLE"], [p("Ebb"), -1, 0, "PITCH_NOT_REPRESENTABLE"],
  ] as const)("rejects MIDI/register/alter overflow rather than respelling (%#)", (source, deltaSemitones, diatonicSteps, code) => {
    expect(transposePitch(source, { deltaSemitones, diatonicSteps })).toMatchObject({ ok: false, error: { code } });
  });
  it.each([
    { ...p("C"), midi: 61 }, { ...p("C"), alter: 3 }, p("C", -1), { ...p("C"), step: "H" as DiatonicStep },
  ])("rejects invalid source pitches (%#)", (pitch) => {
    expect(transposePitch(pitch, { deltaSemitones: 2, diatonicSteps: 1 })).toMatchObject({ ok: false, error: { code: "INVALID_PITCH" } });
  });
  it.each([NaN, Infinity, 0.5])("rejects unsafe interval values %s", (amount) => {
    expect(transposePitch(p("C"), { deltaSemitones: amount, diatonicSteps: 0 })).toMatchObject({ ok: false });
    expect(transposeKeySignature(key("C"), { deltaSemitones: 0, diatonicSteps: amount })).toMatchObject({ ok: false });
  });
  it("keys have no octave limitation, but their tonic spelling must be supported", () => {
    expect(value(transposeKeySignature(key("C#"), { deltaSemitones: 120, diatonicSteps: 70 }))).toEqual(key("C#"));
    expect(transposeKeySignature(key("G"), { deltaSemitones: 1, diatonicSteps: 0 })).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_KEY_SIGNATURE" } });
  });
});

describe("whole-score transposition", () => {
  it.each([
    ["D", [p("D"), p("E"), p("F#"), p("A")]],
    ["C#", [p("C#"), p("D#"), p("E#"), p("G#")]],
    ["Db", [p("Db"), p("Eb"), p("F"), p("Ab")]],
  ])("C major → %s honors the requested spelling", (target, expected) => {
    const source = frozen(melody([p("C"), p("D"), p("E"), p("G")]));
    const { score } = value(transposeScore(source, { kind: "targetKey", targetKey: key(target as string) }));
    expect(pitches(score)).toEqual(expected); expect(score.parts[0].keySignature).toEqual(key(target as string));
    expect(validateScore(score)).toEqual([]);
  });
  it("transposes minor scale alterations instead of normalizing them into natural minor", () => {
    const source = melody([p("A"), p("C", 5), p("F#", 5), p("G#", 5)], key("A", "minor"));
    const result = value(transposeScore(source, { kind: "targetKey", targetKey: key("E", "minor"), direction: "up" }));
    expect(result.interval).toEqual({ deltaSemitones: 7, diatonicSteps: 4 });
    expect(pitches(result.score)).toEqual([p("E", 5), p("G", 5), p("C#", 6), p("D#", 6)]);
    expect(result.score.parts[0].keySignature).toEqual(key("E", "minor"));
  });
  it("automatic semitone transposition moves sound and key together deterministically", () => {
    const source = melody([p("C"), p("E"), p("B")]);
    const first = value(transposeScore(source, { kind: "semitones", semitones: 1 }));
    expect(first.score.parts[0].keySignature).toEqual(key("Db")); // five flats precede seven sharps
    expect(pitches(first.score)).toEqual([p("Db"), p("F"), p("C", 5)]);
    expect(transposeScore(source, { kind: "semitones", semitones: 1 })).toEqual({ ok: true, value: first });
  });
  it("automatic minor transposition preserves mode", () => {
    const source = melody([p("A"), p("G#")], key("A", "minor"));
    const { score } = value(transposeScore(source, { kind: "semitones", semitones: 2 }));
    expect(score.parts[0].keySignature).toEqual(key("B", "minor"));
    expect(pitches(score)).toEqual([p("B"), p("A#")]);
  });
  it("representability precedes key simplicity at the lower register boundary", () => {
    const source = melody([p("C", 0)]);
    const { score } = value(transposeScore(source, { kind: "semitones", semitones: -1 }));
    expect(score.parts[0].keySignature).toEqual(key("Cb")); expect(pitches(score)).toEqual([p("Cb", 0)]);
    expect(transposeScore(source, { kind: "targetKey", targetKey: key("B") })).toMatchObject({ ok: false, error: { code: "PITCH_NOT_REPRESENTABLE" } });
  });
  it("chooses one representable interval, never independently simplifies individual notes", () => {
    const source = melody([p("C#"), p("E##")]);
    const { score, interval } = value(transposeScore(source, { kind: "semitones", semitones: 1 }));
    expect(interval).toEqual({ deltaSemitones: 1, diatonicSteps: 1 });
    expect(pitches(score)).toEqual([p("D"), p("F##")]);
    expect(transposeScore(source, { kind: "targetKey", targetKey: key("C#") })).toMatchObject({ ok: false, error: { code: "PITCH_NOT_REPRESENTABLE" } });
  });
  it("uses catalog order for a neutral automatic enharmonic tie", () => {
    const { score, interval } = value(transposeScore(melody([p("C")]), { kind: "semitones", semitones: 6 }));
    expect(score.parts[0].keySignature).toEqual(key("Gb")); expect(interval.deltaSemitones).toBe(6);
  });
  it("octaves retain the original enharmonic key and zero semitones is a validated no-op", () => {
    const source = frozen(melody([p("B#")], key("C#")));
    expect(value(transposeScore(source, { kind: "semitones", semitones: 0 })).score).toBe(source);
    const { score } = value(transposeScore(source, { kind: "semitones", semitones: 12 }));
    expect(score.parts[0].keySignature).toEqual(key("C#")); expect(pitches(score)).toEqual([p("B#", 5)]);
  });
  it("enharmonic key conversion may change notation with a zero sounding offset", () => {
    const source = melody([p("B#"), p("E#")], key("C#"));
    const { score, interval } = value(transposeScore(source, { kind: "targetKey", targetKey: key("Db") }));
    expect(interval).toEqual({ deltaSemitones: 0, diatonicSteps: 1 });
    expect(pitches(score)).toEqual([p("C", 5), p("F")]);
    expect(pitches(score).map((pitch) => pitch.midi)).toEqual(pitches(source).map((pitch) => pitch.midi));
  });
  it("preserves mixed rests, timing, IDs, ties, velocity, provenance and all score metadata", () => {
    const source = tiedScore(); const part = source.parts[0];
    part.measures[0].events.unshift(createRestEvent({ id: "r", startTick: 0, durationTicks: 480 }));
    source.parts[0].measures[0].events.push({ ...createNoteEvent({ id: "extra", step: "D", octave: 4, startTick: 960, durationTicks: 480,
      velocity: 72, provenance: { source: "transcription", confidence: 0.84 } }) });
    const before = JSON.stringify(source); frozen(source);
    const { score } = value(transposeScore(source, { kind: "targetKey", targetKey: key("D") }));
    expect(JSON.stringify(source)).toBe(before); expect(validateScore(score)).toEqual([]);
    expect({ ...score, parts: [] }).toEqual({ ...source, parts: [] });
    expect(score.parts[0].ties).toBe(source.parts[0].ties);
    expect(score.parts[0].measures[0].events[0]).toBe(source.parts[0].measures[0].events[0]);
    score.parts.forEach((part, index) => {
      expect({ ...part, measures: [], keySignature: null }).toEqual({ ...source.parts[index], measures: [], keySignature: null });
      part.measures.forEach((measure, m) => {
        expect({ ...measure, events: [] }).toEqual({ ...source.parts[index].measures[m], events: [] });
        measure.events.forEach((event, e) => {
          const original = source.parts[index].measures[m].events[e];
          expect({ ...event, pitch: null }).toEqual({ ...original, pitch: null });
        });
      });
    });
    const tied = score.parts[0].measures.flatMap((measure) => measure.events).filter((event) => event.kind === "note" && event.id.startsWith("t1"));
    expect(tied.flatMap((event) => event.kind === "note" ? [event.pitch] : [])).toEqual([p("D"), p("D")]);
    expect(mergeTiedNotes(score.parts[0]).find((note) => note.id === "t1")).toMatchObject({ pitch: p("D"), durationTicks: 1920 });
    expect(mergeTiedNotes(score.parts[0])).toHaveLength(2);
  });
  it("transposes every Part by the same interval while preserving their distinct keys", () => {
    const source = melody([p("C")]); const second = melody([p("G")], key("G")).parts[0];
    source.parts.push({ ...second, id: "second", measures: second.measures.map((measure, m) => ({ ...measure, id: `second-m${m}`,
      events: measure.events.map((event) => ({ ...event, id: `second-${event.id}` })) })) });
    const { score } = value(transposeScore(frozen(source), { kind: "targetKey", targetKey: key("D") }));
    expect(pitches(score)).toEqual([p("D"), p("A")]);
    expect(score.parts.map((part) => part.keySignature)).toEqual([key("D"), key("A")]);
  });
  it("uses existing sharp tendency after all-Part key simplicity ties", () => {
    const source = melody([p("D")], key("D")); const second = melody([p("C")]).parts[0];
    source.parts.push({ ...second, id: "second", measures: second.measures.map((measure, m) => ({ ...measure, id: `second-m${m}`,
      events: measure.events.map((event) => ({ ...event, id: `second-${event.id}` })) })) });
    const { score, interval } = value(transposeScore(source, { kind: "semitones", semitones: -1 }));
    // Both C#/B (7+5) and Db/Cb (5+7) total twelve signature accidentals.
    expect(score.parts.map((part) => part.keySignature)).toEqual([key("C#"), key("B")]);
    expect(interval).toEqual({ deltaSemitones: -1, diatonicSteps: -1 });
    expect(pitches(score)).toEqual([p("C#"), p("B", 3)]);
  });
  it.each([
    [13, p("Db", 5), p("F", 5)], [25, p("Db", 6), p("F", 6)],
    [-13, p("B", 2), p("D#", 3)], [-25, p("B", 1), p("D#", 2)],
  ] as const)("retains the full compound displacement %s rather than reducing it modulo twelve", (semitones, first, second) => {
    const { score, interval } = value(transposeScore(melody([p("C"), p("E")]), { kind: "semitones", semitones }));
    expect(interval.deltaSemitones).toBe(semitones); expect(pitches(score)).toEqual([first, second]);
  });
  it("preserves each Part's mode in a mixed major/minor score", () => {
    const source = melody([p("C")]); const second = melody([p("A", 3)], key("A", "minor")).parts[0];
    source.parts.push({ ...second, id: "second", measures: second.measures.map((measure, m) => ({ ...measure, id: `second-m${m}`,
      events: measure.events.map((event) => ({ ...event, id: `second-${event.id}` })) })) });
    const { score } = value(transposeScore(source, { kind: "targetKey", targetKey: key("D") }));
    expect(score.parts.map((part) => part.keySignature)).toEqual([key("D"), key("B", "minor")]);
    expect(pitches(score)).toEqual([p("D"), p("B", 3)]);
  });
  it("a later Part's MIDI overflow preserves every original Part", () => {
    const source = melody([p("C")]); const second = melody([p("G", 9)]).parts[0];
    source.parts.push({ ...second, id: "second", measures: second.measures.map((measure, m) => ({ ...measure, id: `second-m${m}`,
      events: measure.events.map((event) => ({ ...event, id: `second-${event.id}` })) })) });
    const before = JSON.stringify(source); frozen(source);
    const result = transposeScore(source, { kind: "targetKey", targetKey: key("D") });
    expect(result).toMatchObject({ ok: false, error: { code: "MIDI_OUT_OF_RANGE", partId: "second", eventId: "second-n0" } });
    expect(result).not.toHaveProperty("value"); expect(JSON.stringify(source)).toBe(before);
  });
  it("a later Part requiring an unsupported key rejects the entire transformation", () => {
    const source = melody([p("C")]); const second = melody([p("G")], key("G")).parts[0];
    source.parts.push({ ...second, id: "second", measures: second.measures.map((measure, m) => ({ ...measure, id: `second-m${m}`,
      events: measure.events.map((event) => ({ ...event, id: `second-${event.id}` })) })) });
    const before = JSON.stringify(source); frozen(source);
    expect(transposeScore(source, { kind: "targetKey", targetKey: key("C#") })).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_KEY_SIGNATURE", partId: "second" } });
    expect(JSON.stringify(source)).toBe(before);
    expect(value(transposeScore(source, { kind: "semitones", semitones: 1 })).score.parts.map((part) => part.keySignature)).toEqual([key("Db"), key("Ab")]);
  });
  it("an unrepresentable later note cannot leak a partially transposed candidate", () => {
    const source = frozen(melody([p("C"), p("G", 9)])); const before = JSON.stringify(source);
    const result = transposeScore(source, { kind: "targetKey", targetKey: key("D") });
    expect(result).toMatchObject({ ok: false, error: { code: "MIDI_OUT_OF_RANGE", eventId: "n1" } });
    expect(result).not.toHaveProperty("value"); expect(JSON.stringify(source)).toBe(before);
  });
  it.each([NaN, Infinity, -Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1])("rejects invalid semitone input %s", (semitones) => {
    const source = frozen(melody([p("C")]));
    expect(transposeScore(source, { kind: "semitones", semitones })).toMatchObject({ ok: false, error: { code: "INVALID_TRANSPOSE" } });
  });
  it.each([Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])("rejects unsafe intermediate arithmetic for %s", (semitones) => {
    expect(transposeScore(melody([p("C")]), { kind: "semitones", semitones })).toMatchObject({ ok: false, error: { code: "INVALID_TRANSPOSE" } });
  });
  it("rejects invalid source Score and cross-mode intent without mutation", () => {
    const source = melody([p("C")]);
    expect(transposeScore({ ...source, schemaVersion: 999 }, { kind: "semitones", semitones: 2 })).toMatchObject({ ok: false, error: { code: "INVALID_SCORE" } });
    expect(transposeScore(source, { kind: "targetKey", targetKey: key("D", "minor") })).toMatchObject({ ok: false, error: { code: "MODE_CHANGE_NOT_SUPPORTED" } });
  });
  it("supports empty and rest-only scores without introducing sounding events", () => {
    for (const source of [baseScore(), withMeasureEvents(baseScore(), [createRestEvent({ id: "r", startTick: 0, durationTicks: 960 })])]) {
      const { score } = value(transposeScore(frozen(source), { kind: "targetKey", targetKey: key("Eb") }));
      expect(pitches(score)).toEqual([]); expect(score.parts[0].keySignature).toEqual(key("Eb"));
      expect(score.parts[0].measures[0].events).toEqual(source.parts[0].measures[0].events);
    }
  });
  it("retains the existing key-only command's sound/spelling preservation", () => {
    const source = frozen(melody([p("C"), p("F#")]));
    const result = applyEditCommand(source, { type: "SetKeySignature", partId: source.parts[0].id, keySignature: key("D"), updatedAt: source.updatedAt });
    if (!result.ok) throw new Error(result.error.message);
    expect(pitches(result.score)).toEqual(pitches(source));
    expect(pitches(value(transposeScore(source, { kind: "targetKey", targetKey: key("D") })).score)).toEqual([p("D"), p("G#")]);
  });
  it("covers every supported same-mode key pair and direction, including enharmonic tonic/octave boundaries", () => {
    for (const { key: source } of KEY_SIGNATURE_OPTIONS) for (const { key: target } of KEY_SIGNATURE_OPTIONS) {
      if (source.mode !== target.mode) continue;
      for (const direction of ["up", "down", "nearest"] as const) {
        const original = melody([createPitch(source.tonic, source.alter, 4)], { ...source });
        const result = value(transposeScore(original, { kind: "targetKey", targetKey: target, direction }));
        const [pitch] = pitches(result.score);
        expect(pitch.step).toBe(target.tonic); expect(pitch.alter).toBe(target.alter);
        expect(result.score.parts[0].keySignature).toEqual(target); expect(validateScore(result.score)).toEqual([]);
        expect(pitch.midi - pitches(original)[0].midi).toBe(result.interval.deltaSemitones);
        if (direction === "up") expect(result.interval.deltaSemitones).toBeGreaterThanOrEqual(0);
        if (direction === "down") expect(result.interval.deltaSemitones).toBeLessThanOrEqual(0);
        if (direction === "nearest") {
          expect(Math.abs(result.interval.deltaSemitones)).toBeLessThanOrEqual(6);
          expect(result.interval.deltaSemitones).not.toBe(-6);
        }
      }
    }
  });
});
