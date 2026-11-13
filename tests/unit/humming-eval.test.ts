import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HUMMING_MELODIES, synthesizeHumming } from "../fixtures/humming";
import { encodeWav, evaluateHummingFolder, formatHummingReport, parseGroundTruth, readWav, writeHummingTemplates, HUMMING_GATE, HUMMING_TAKE_PLAN } from "../eval/humming-eval";
import { existsSync, readFileSync } from "node:fs";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const tempDir = () => { const dir = mkdtempSync(join(tmpdir(), "humming-eval-")); dirs.push(dir); return dir; };

describe("readWav", () => {
  it.each([16, 24, 32] as const)("reads %i-bit PCM back within quantization error", (bits) => {
    const samples = Float32Array.from([0, 0.5, -0.5, 0.25, -1, 0.999]);
    const wav = readWav(encodeWav(samples, 44100, { bitsPerSample: bits }));
    expect(wav.sampleRate).toBe(44100);
    expect(wav.samples.length).toBe(samples.length);
    wav.samples.forEach((value, index) => expect(Math.abs(value - samples[index])).toBeLessThan(2 / 2 ** (bits - 1) + 1e-6));
  });

  it("reads 32-bit float and averages stereo channels to mono", () => {
    const wav = readWav(encodeWav(Float32Array.from([0.5, -0.5, 1, 0]), 48000, { float: true, channels: 2 }));
    expect(wav.sampleRate).toBe(48000);
    expect(Array.from(wav.samples)).toEqual([0, 0.5]);
  });

  it("skips unknown chunks and rejects non-WAV or unsupported formats", () => {
    const plain = encodeWav(Float32Array.from([0.5]), 8000, { bitsPerSample: 16 });
    const junk = new Uint8Array(plain.length + 12);
    junk.set(plain.subarray(0, 12));
    junk.set([0x4c, 0x49, 0x53, 0x54, 4, 0, 0, 0, 1, 2, 3, 4], 12); // "LIST" chunk, 4 bytes
    junk.set(plain.subarray(12), 24);
    expect(Array.from(readWav(junk).samples)[0]).toBeCloseTo(0.5, 3);
    expect(() => readWav(new TextEncoder().encode("not a wave file at all"))).toThrow(/RIFF/);
    const eightBit = encodeWav(Float32Array.from([0]), 8000, { bitsPerSample: 16 });
    new DataView(eightBit.buffer).setUint16(34, 8, true);
    expect(() => readWav(eightBit)).toThrow(/8-bit/);
  });
});

describe("parseGroundTruth", () => {
  const valid = { tempoBpm: 90, timeSignature: { numerator: 4, denominator: 4 }, notes: [{ midi: 60, startTick: 0, durationTicks: 960 }] };

  it("accepts the documented shape and defaults the key and alignment", () => {
    const truth = parseGroundTruth(valid, "a.json");
    expect(truth.key.tonic).toBe("C");
    expect(truth.downbeatSeconds).toBeUndefined();
  });

  it.each([
    [{ ...valid, tempoBpm: 0 }, /tempoBpm/],
    [{ ...valid, timeSignature: { numerator: 4, denominator: 3 } }, /timeSignature/],
    [{ ...valid, notes: [] }, /notes/],
    [{ ...valid, notes: [{ midi: 60.5, startTick: 0, durationTicks: 960 }] }, /MIDI/],
    [{ ...valid, downbeatSeconds: -1 }, /downbeatSeconds/],
    [{ ...valid, octaveShift: 0.5 }, /octaveShift/],
  ])("rejects invalid ground truth %#", (input, message) => {
    expect(() => parseGroundTruth(input, "a.json")).toThrow(message);
  });
});

describe("octaveShift and templates", () => {
  it("octaveShift moves every reference note by whole octaves", () => {
    const truth = parseGroundTruth({ tempoBpm: 90, timeSignature: { numerator: 4, denominator: 4 }, octaveShift: -1,
      notes: [{ midi: 60, startTick: 0, durationTicks: 960 }] }, "a.json");
    expect(truth.notes[0].midi).toBe(48);
  });

  it("writes one ground-truth template per planned take, valid and never overwriting", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "scale-1.json"), "keep");
    const written = writeHummingTemplates(dir);
    expect(written.length + 1).toBe(HUMMING_TAKE_PLAN.length);
    expect(HUMMING_TAKE_PLAN.length).toBeGreaterThanOrEqual(HUMMING_GATE.minTakes);
    expect(readFileSync(join(dir, "scale-1.json"), "utf8")).toBe("keep");
    for (const file of written) {
      expect(existsSync(join(dir, file))).toBe(true);
      expect(() => parseGroundTruth(JSON.parse(readFileSync(join(dir, file), "utf8")), file)).not.toThrow();
    }
  });
});

describe("evaluateHummingFolder on synthetic takes (tool self-check)", () => {
  function writeTake(dir: string, name: string, melodyIndex: number, truth: Record<string, unknown> = {}, options = {}) {
    const melody = HUMMING_MELODIES[melodyIndex];
    const clip = synthesizeHumming(melody.notes, { tempoBpm: melody.tempoBpm, leadSilenceMs: 400, tailSilenceMs: 300, ...options });
    writeFileSync(join(dir, `${name}.wav`), encodeWav(clip.samples, clip.sampleRate, { bitsPerSample: 16 }));
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({
      tempoBpm: melody.tempoBpm, timeSignature: melody.timeSignature, notes: melody.notes, ...truth,
    }));
    return clip;
  }

  it("scores clean synthetic takes as perfect, with an explicit downbeat or first-note alignment", () => {
    const dir = tempDir();
    const clip = writeTake(dir, "scale-known", 0, { downbeatSeconds: 0.4 });
    expect(clip.downbeatSeconds).toBeCloseTo(0.4);
    writeTake(dir, "scale-aligned", 0);
    const result = evaluateHummingFolder(dir);
    expect(result.takes.map((take) => take.name)).toEqual(["scale-aligned", "scale-known"]);
    expect(result.takes.map((take) => take.alignment)).toEqual(["first-note", "downbeat"]);
    for (const take of result.takes) expect(take.score?.f1).toBe(1);
    expect(result.total.f1).toBe(1);
    // Two takes are far fewer than the gate needs: never a pass.
    expect(result.verdict).toBe("INSUFFICIENT");
  });

  it("first-note alignment honours a reference that starts after tick 0", () => {
    const dir = tempDir();
    const shifted = HUMMING_MELODIES[0].notes.map((note) => ({ ...note, startTick: note.startTick + 960 }));
    // The clip starts singing at 0.4 s; the truth says that is beat 2, so tick 0 is one beat (0.6 s at 100 bpm) earlier.
    writeTake(dir, "late", 0, { notes: shifted });
    const take = evaluateHummingFolder(dir).takes[0];
    expect(take.alignment).toBe("first-note");
    expect(take.score?.f1).toBe(1);
  });

  it("counts a wrong ground truth as misses, so the tool can fail", () => {
    const dir = tempDir();
    writeTake(dir, "wrong", 0, { downbeatSeconds: 0.4, notes: HUMMING_MELODIES[0].notes.map((note) => ({ ...note, midi: note.midi + 1 })) });
    const take = evaluateHummingFolder(dir).takes[0];
    expect(take.score?.truePositives).toBe(0);
    expect(take.score?.pitchErrors).toBe(HUMMING_MELODIES[0].notes.length);
  });

  it("reports a take without its pair or with a silent signal instead of skipping it", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "orphan.wav"), encodeWav(new Float32Array(4410), 44100, { bitsPerSample: 16 }));
    writeTake(dir, "silent", 0, { downbeatSeconds: 0.4 }, { amplitude: 0 });
    writeFileSync(join(dir, "lonely.json"), "{}");
    const result = evaluateHummingFolder(dir);
    expect(result.takes.map((take) => [take.name, take.error ? "error" : "ok"])).toEqual([
      ["lonely", "error"], ["orphan", "error"], ["silent", "error"],
    ]);
    // A silent take still counts every reference note as missed.
    expect(result.takes[2].error).toMatch(/SILENT/);
    expect(result.total.falseNegatives).toBe(HUMMING_MELODIES[0].notes.length);
    expect(result.verdict).toBe("INSUFFICIENT");
  });

  it("passes only with enough takes and F1 at or above the target, and the report says so", () => {
    const dir = tempDir();
    for (let index = 0; index < HUMMING_GATE.minTakes; index += 1) writeTake(dir, `take-${String(index).padStart(2, "0")}`, index % 2, { downbeatSeconds: 0.4 });
    const result = evaluateHummingFolder(dir);
    expect(result.verdict).toBe("PASS");
    const report = formatHummingReport(result, { generatedAt: "2026-11-14T00:00:00.000Z" });
    expect(report).toContain("판정: PASS");
    expect(report).toContain("| take-00 |");
    expect(report).toContain("C-09");
  });

  it("fails the gate when total F1 is below the target", () => {
    const dir = tempDir();
    const wrong = HUMMING_MELODIES[0].notes.map((note) => ({ ...note, midi: note.midi + 2 }));
    for (let index = 0; index < HUMMING_GATE.minTakes; index += 1) writeTake(dir, `t${index}`, 0, { downbeatSeconds: 0.4, notes: wrong });
    expect(evaluateHummingFolder(dir).verdict).toBe("FAIL");
  });

  it("refuses an empty folder", () => {
    expect(() => evaluateHummingFolder(tempDir())).toThrow(/WAV/);
  });
});
