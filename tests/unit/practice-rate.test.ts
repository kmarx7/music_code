import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playScore, type PlaybackHandle } from "@/adapters/tone/playback";
import {
  DEFAULT_PRACTICE_RATE, PRACTICE_RATE_MAX, PRACTICE_RATE_MIN,
  effectiveTempoBpm, isValidPracticeRate, playbackSecondsPerTick, serializeScore,
} from "@/domain/score";
import { baseScore, fourNoteScore, tiedScore } from "../fixtures/scores";

const audio = vi.hoisted(() => ({ voices: [] as { click: boolean; attack: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] }));
vi.mock("tone", () => ({
  start: vi.fn().mockResolvedValue(undefined),
  now: () => Date.now() / 1000 + 0.1,
  immediate: () => Date.now() / 1000,
  Frequency: (midi: number) => ({ toFrequency: () => midi }),
  Synth: class {
    attack = vi.fn(); dispose = vi.fn(); triggerAttackRelease = this.attack;
    constructor(options?: unknown) { audio.voices.push({ click: !!options, attack: this.attack, dispose: this.dispose }); }
    toDestination() { return this; }
  },
}));
const handles: PlaybackHandle[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); audio.voices.length = 0; });
afterEach(() => { handles.forEach((handle) => handle.stop()); handles.length = 0; vi.useRealTimers(); });
async function play(...args: Parameters<typeof playScore>) { const handle = await playScore(...args); handles.push(handle); return handle; }
const noteCalls = () => audio.voices.find((voice) => !voice.click)!.attack.mock.calls;
const clickCalls = () => audio.voices.find((voice) => voice.click)!.attack.mock.calls;

describe("P3-01 practice rate — pure time contract", () => {
  it("exposes the PRD range 25%–150% with a 100% default", () => {
    expect([PRACTICE_RATE_MIN, PRACTICE_RATE_MAX, DEFAULT_PRACTICE_RATE]).toEqual([0.25, 1.5, 1]);
  });

  it.each([0.25, 0.3, 0.5, 0.95, 1, 1.05, 1.5])("accepts %s", (rate) => {
    expect(isValidPracticeRate(rate)).toBe(true);
  });

  it.each([0, -1, 0.2, 0.2499, 1.5001, 1.55, 2, NaN, Infinity, -Infinity, "1", null, undefined])("rejects %s", (rate) => {
    expect(isValidPracticeRate(rate)).toBe(false);
  });

  it("120 BPM at 50% is an effective 60 BPM", () => {
    expect(effectiveTempoBpm(120, 0.5)).toBe(60);
    expect(playbackSecondsPerTick(120, 0.5)).toBeCloseTo(1 / 960, 12);
    expect(playbackSecondsPerTick(120, 1)).toBeCloseTo(0.5 / 960, 12);
  });

  it("does not clamp the effective tempo into the stored 20–400 BPM range", () => {
    expect(effectiveTempoBpm(20, 0.25)).toBe(5);
    expect(effectiveTempoBpm(400, 1.5)).toBe(600);
  });

  it.each([0, NaN, 2, -0.5])("throws for the invalid rate %s instead of approximating", (rate) => {
    expect(() => effectiveTempoBpm(120, rate)).toThrow(RangeError);
    expect(() => playbackSecondsPerTick(120, rate)).toThrow(RangeError);
  });
});

describe("P3-01 practice rate — Tone scheduling uses one clock", () => {
  it("omitting rate schedules exactly like 100%", async () => {
    await play({ ...fourNoteScore(), tempoBpm: 120 });
    const implicit = noteCalls().map((call) => [...call]);
    handles.pop()!.stop(); audio.voices.length = 0;
    await play({ ...fourNoteScore(), tempoBpm: 120 }, { rate: 1 });
    expect(noteCalls()).toEqual(implicit);
  });

  it("50% doubles every onset and duration while pitches stay identical", async () => {
    await play({ ...fourNoteScore(), tempoBpm: 120 });
    const normal = noteCalls().map((call) => [...call] as [number, number, number]);
    handles.pop()!.stop(); audio.voices.length = 0;
    await play({ ...fourNoteScore(), tempoBpm: 120 }, { rate: 0.5 });
    const slow = noteCalls() as [number, number, number][];
    expect(slow.map((call) => call[0])).toEqual(normal.map((call) => call[0]));
    const startAt = normal[0][2];
    expect(slow[0][2]).toBeCloseTo(startAt);
    slow.forEach((call, index) => {
      expect(call[1]).toBeCloseTo(normal[index][1] * 2);
      expect(call[2] - startAt).toBeCloseTo((normal[index][2] - startAt) * 2);
    });
  });

  // Whole-millisecond durations only: fake timers cannot advance 333.33 ms.
  it.each([[0.25, 2000, 960, "n2"], [0.5, 1000, 960, "n2"], [1, 500, 960, "n2"], [1.5, 1000, 2880, "n4"]])(
    "cursor at 120 BPM × %s after %s ms is tick %s", async (rate, elapsedMs, tick, activeId) => {
      const handle = await play({ ...fourNoteScore(), tempoBpm: 120 }, { rate });
      await vi.advanceTimersByTimeAsync(200 + elapsedMs);
      expect(handle.getPosition().tick).toBeCloseTo(tick, 3);
      expect(handle.getPosition().activeNoteIds).toEqual([activeId]);
    });

  it("metronome clicks share the slowed clock", async () => {
    const score = { ...baseScore(), tempoBpm: 120 };
    await play(score, { metronome: true, rate: 0.5 });
    const times = clickCalls().map((call) => call[2] as number);
    expect(times.length).toBeGreaterThan(1);
    expect(times[1] - times[0]).toBeCloseTo(1);
  });

  it("a tied note keeps a single attack whose length scales with the rate", async () => {
    await play(tiedScore());
    const [, normalDuration] = noteCalls()[0];
    handles.pop()!.stop(); audio.voices.length = 0;
    await play(tiedScore(), { rate: 0.5 });
    expect(noteCalls()).toHaveLength(1);
    expect(noteCalls()[0][1]).toBeCloseTo(normalDuration * 2);
  });

  it("pause/resume keeps the tick and reschedules the remainder at the same rate", async () => {
    const handle = await play({ ...fourNoteScore(), tempoBpm: 120 }, { rate: 0.5 });
    await vi.advanceTimersByTimeAsync(200 + 1500); // 1.5s at effective 60 BPM = 1440 ticks
    handle.pause();
    expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    handle.resume();
    const resumed = audio.voices[1].attack.mock.calls;
    expect(resumed.map((call) => call[0])).toEqual([62, 64, 67]);
    expect(resumed[0][1]).toBeCloseTo(0.45); // remaining 480 ticks × (1/960 s) × gate 0.9
  });

  it("never mutates the Score, its tempo or its serialized form", async () => {
    const score = { ...fourNoteScore(), tempoBpm: 120 };
    const before = structuredClone(score); const json = serializeScore(score);
    const handle = await play(score, { rate: 0.5 });
    await vi.advanceTimersByTimeAsync(700);
    handle.pause(); handle.resume(); handle.stop();
    expect(score).toEqual(before);
    expect(score.tempoBpm).toBe(120);
    expect(serializeScore(score)).toBe(json);
  });

  it.each([0, NaN, 0.2, 1.6, Infinity])("rejects the invalid rate %s before any audio is created", async (rate) => {
    await expect(playScore(fourNoteScore(), { rate })).rejects.toThrow(RangeError);
    expect(audio.voices).toHaveLength(0);
  });
});

describe("P3-02 practice rate — changing the rate reschedules from the current tick", () => {
  it("while playing: keeps the tick, disposes old audio once and reschedules the remainder", async () => {
    const score = { ...fourNoteScore(), tempoBpm: 120 }; const before = structuredClone(score);
    const handle = await play(score);
    await vi.advanceTimersByTimeAsync(200 + 750); // 1440 ticks at 120 BPM
    handle.setRate(0.5);
    expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    expect(audio.voices).toHaveLength(2);
    expect(audio.voices[0].dispose).toHaveBeenCalledTimes(1);
    const calls = audio.voices[1].attack.mock.calls;
    expect(calls.map((call) => call[0])).toEqual([62, 64, 67]);
    expect(calls[0][1]).toBeCloseTo(0.45); // remaining 480 ticks at effective 60 BPM × gate 0.9
    expect(calls[1][2] - calls[0][2]).toBeCloseTo(0.5);
    expect(calls[2][2] - calls[1][2]).toBeCloseTo(1);
    await vi.advanceTimersByTimeAsync(200 + 500);
    expect(handle.getPosition().tick).toBeCloseTo(1920, 3);
    expect(handle.getPosition().activeNoteIds).toEqual(["n3"]);
    expect(score).toEqual(before);
  });

  it("repeated changes never accumulate voices or stale schedules", async () => {
    const handle = await play({ ...fourNoteScore(), tempoBpm: 120 });
    await vi.advanceTimersByTimeAsync(300);
    for (const rate of [0.5, 0.75, 1.5, 0.25]) handle.setRate(rate);
    expect(audio.voices).toHaveLength(5);
    audio.voices.slice(0, 4).forEach((voice) => expect(voice.dispose).toHaveBeenCalledTimes(1));
    expect(audio.voices[4].dispose).not.toHaveBeenCalled();
    handle.stop();
    expect(audio.voices[4].dispose).toHaveBeenCalledTimes(1);
    expect(handle.getPosition()).toMatchObject({ tick: 0, activeNoteIds: [] });
  });

  it("an unchanged rate is a no-op", async () => {
    const handle = await play({ ...fourNoteScore(), tempoBpm: 120 }, { rate: 0.5 });
    handle.setRate(0.5);
    expect(audio.voices).toHaveLength(1);
    expect(audio.voices[0].dispose).not.toHaveBeenCalled();
  });

  it("while paused: keeps the tick silently and resume uses the new rate", async () => {
    const handle = await play({ ...fourNoteScore(), tempoBpm: 120 });
    await vi.advanceTimersByTimeAsync(200 + 750);
    handle.pause();
    handle.setRate(0.5);
    expect(audio.voices).toHaveLength(1);
    expect(handle.getPosition()).toMatchObject({ activeNoteIds: [] });
    expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    handle.resume();
    expect(audio.voices[1].attack.mock.calls[0][1]).toBeCloseTo(0.45);
    await vi.advanceTimersByTimeAsync(200 + 500);
    expect(handle.getPosition().tick).toBeCloseTo(1920, 3);
  });

  it("after stop or natural end it does nothing", async () => {
    const handle = await play({ ...fourNoteScore(), tempoBpm: 120 });
    handle.stop();
    handle.setRate(0.5);
    expect(audio.voices).toHaveLength(1);
    expect(handle.getPosition().tick).toBe(0);
  });

  it.each([0, NaN, 0.2, 1.6])("rejects the invalid rate %s and leaves playback untouched", async (rate) => {
    const handle = await play({ ...fourNoteScore(), tempoBpm: 120 });
    await vi.advanceTimersByTimeAsync(200 + 500);
    expect(() => handle.setRate(rate)).toThrow(RangeError);
    expect(audio.voices).toHaveLength(1);
    expect(audio.voices[0].dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(handle.getPosition().tick).toBeCloseTo(1920, 3);
  });

  it("a change inside a tied note re-attacks the remaining length exactly once", async () => {
    const handle = await play(tiedScore());
    const [, fullDuration, onsetAt] = noteCalls()[0] as [number, number, number];
    await vi.advanceTimersByTimeAsync((onsetAt + fullDuration / 2) * 1000); // halfway through the tied note
    handle.setRate(0.5);
    expect(audio.voices[1].attack.mock.calls).toHaveLength(1);
    expect(audio.voices[1].attack.mock.calls[0][1]).toBeCloseTo(fullDuration); // half left, twice as slow
  });

  it("metronome clicks are rescheduled on the new clock without duplicates", async () => {
    const handle = await play({ ...baseScore(), tempoBpm: 120 }, { metronome: true });
    const first = audio.voices.find((voice) => voice.click)!;
    const total = first.attack.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200 + 750); // beats at 0 and 0.5s have sounded
    handle.setRate(0.5);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    const clicks = audio.voices.filter((voice) => voice.click);
    expect(clicks).toHaveLength(2);
    const times = clicks[1].attack.mock.calls.map((call) => call[2] as number);
    expect(times).toHaveLength(total - 2);
    expect(times[1] - times[0]).toBeCloseTo(1);
  });
});
