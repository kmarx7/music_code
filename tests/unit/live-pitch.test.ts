import { describe, expect, it } from "vitest";
import { estimateLivePitch, LIVE_PITCH_WINDOW_SECONDS } from "@/domain/transcription";

const tone = (hz: number, seconds = LIVE_PITCH_WINDOW_SECONDS, rate = 48000, amplitude = 0.3) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, index) => amplitude * Math.sin(2 * Math.PI * hz * index / rate));

describe("estimateLivePitch (MVP-002 녹음 중 추정 음높이)", () => {
  it("names the nearest semitone of a steady tone with its cent offset", () => {
    // Display precision: the detector's interpolation may be off by a few cents.
    const near = (pitch: { midi: number; cents: number } | null, midi: number) => {
      expect(pitch?.midi).toBe(midi);
      expect(Math.abs(pitch!.cents)).toBeLessThanOrEqual(3);
    };
    near(estimateLivePitch(tone(440), 48000), 69);
    near(estimateLivePitch(tone(261.63), 48000), 60);
    const sharp = estimateLivePitch(tone(440 * 2 ** (20 / 1200)), 48000);
    expect(sharp?.midi).toBe(69);
    expect(sharp!.cents).toBeGreaterThanOrEqual(17);
    expect(sharp!.cents).toBeLessThanOrEqual(23);
  });

  it("works at 44.1 kHz and for a low hum", () => {
    expect(estimateLivePitch(tone(110, LIVE_PITCH_WINDOW_SECONDS, 44100), 44100)?.midi).toBe(45);
  });

  it("returns null for silence, noise, or a window too short to analyse", () => {
    expect(estimateLivePitch(new Float32Array(6000), 48000)).toBeNull();
    let seed = 7;
    const noise = Float32Array.from({ length: 6000 }, () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.6; });
    expect(estimateLivePitch(noise, 48000)).toBeNull();
    expect(estimateLivePitch(tone(440, 0.01), 48000)).toBeNull();
  });
});
