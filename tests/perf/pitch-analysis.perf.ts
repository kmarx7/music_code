import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arch, cpus, platform } from "node:os";
import { expect, it } from "vitest";
import { estimatePitchTrack } from "@/domain/transcription";
import { synthesizeHumming } from "../fixtures/humming";
import type { MelodyNote } from "../fixtures/transcription-score";

/**
 * P4-02: main-thread analysis time of the longest allowed recording (8 measures, decisions 2 and 4).
 * Node measurement, not a browser or device figure, and not a pass/fail gate (no time thresholds asserted).
 */
const Q = 960;
const SAMPLES = Number(process.env.PERF_SAMPLES ?? 5);
const OUT_DIR = process.env.PERF_OUT ?? join("test-results", "perf");

/** 8 measures of 4/4: the C-major scale up and down, quarter notes (32 notes). */
const EIGHT_MEASURES: MelodyNote[] = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60, 62,
  64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60, 64, 67, 60].map((midi, beat) => ({ midi, startTick: beat * Q, durationTicks: Q }));

const CASES = [
  { tempoBpm: 120, sampleRate: 44100 }, { tempoBpm: 60, sampleRate: 44100 }, { tempoBpm: 20, sampleRate: 44100 },
  { tempoBpm: 60, sampleRate: 48000 }, { tempoBpm: 20, sampleRate: 48000 },
];

it("measures pitch analysis time for 8-measure recordings", () => {
  // Warm up the JIT on a short clip so the first case does not pay for compilation.
  const warm = synthesizeHumming(EIGHT_MEASURES.slice(0, 4), { tempoBpm: 120 });
  estimatePitchTrack(warm.samples, warm.sampleRate);

  const results = CASES.map(({ tempoBpm, sampleRate }) => {
    const clip = synthesizeHumming(EIGHT_MEASURES, { tempoBpm, sampleRate, vibratoCents: 40, vibratoHz: 5.5, noiseLevel: 0.02, seed: 9 });
    const audioSeconds = clip.samples.length / clip.sampleRate;
    const samplesMs: number[] = [];
    let frames = 0;
    for (let run = 0; run < SAMPLES; run += 1) {
      const started = performance.now();
      frames = estimatePitchTrack(clip.samples, clip.sampleRate).length;
      samplesMs.push(+(performance.now() - started).toFixed(1));
    }
    const median = [...samplesMs].sort((a, b) => a - b)[Math.floor(samplesMs.length / 2)];
    return { tempoBpm, sampleRate, audioSeconds: +audioSeconds.toFixed(2), pcmMegabytes: +(clip.samples.byteLength / 2 ** 20).toFixed(1),
      frames, samplesMs, medianMs: median, msPerAudioSecond: +(median / audioSeconds).toFixed(1) };
  });
  const report = {
    measuredAt: new Date().toISOString(), node: process.version, platform: `${platform()} ${arch()}`, cpu: cpus()[0]?.model,
    samplesPerCase: SAMPLES, melody: "8 measures 4/4, 32 quarter notes, vibrato ±40 cents, noise 0.02", results,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "pitch-analysis.json"), JSON.stringify(report, null, 2));
  expect(results.every((result) => result.frames > 0)).toBe(true);
});
