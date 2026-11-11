import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playScore, type PlaybackHandle } from "@/adapters/tone/playback";
import {
  measureRangeLoop, playbackLoopIssue, playbackLoopTick, scoreLengthTicks, serializeScore,
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
type Call = [number, number, number];
const melody = (index = 0) => audio.voices.filter((voice) => !voice.click)[index].attack.mock.calls as Call[];
const clicks = (index = 0) => audio.voices.filter((voice) => voice.click)[index].attack.mock.calls as Call[];
const START = 0.2; // mocked lead-in: Tone.now() look-ahead 0.1s + scheduling margin 0.1s
/** Calls whose audio start time is before `seconds`, i.e. what has sounded by then. */
const before = (calls: Call[], seconds: number) => calls.filter((call) => call[2] < seconds - 1e-9);

describe("P3-04 A–B loop — pure range contract", () => {
  it("score length covers every measure of the first part, including trailing empty ones", () => {
    expect(scoreLengthTicks(fourNoteScore())).toBe(7680);
  });

  it.each([
    [{ startTick: 0, endTick: 3840 }, null],
    [{ startTick: 3840, endTick: 7680 }, null],
    [{ startTick: 480, endTick: 1440 }, null],
    [{ startTick: 960, endTick: 960 }, "EMPTY_RANGE"],
    [{ startTick: 1920, endTick: 960 }, "EMPTY_RANGE"],
    [{ startTick: -960, endTick: 960 }, "OUT_OF_SCORE"],
    [{ startTick: 0, endTick: 7681 }, "OUT_OF_SCORE"],
    [{ startTick: 0.5, endTick: 960 }, "NOT_INTEGER"],
    [{ startTick: 0, endTick: NaN }, "NOT_INTEGER"],
    [{ startTick: 0, endTick: Infinity }, "NOT_INTEGER"],
  ])("validates %j as %s", (loop, issue) => {
    expect(playbackLoopIssue(fourNoteScore(), loop)).toBe(issue);
  });

  it("converts 1-based inclusive measures to a half-open tick range", () => {
    const score = fourNoteScore();
    expect(measureRangeLoop(score, 1, 1)).toEqual({ startTick: 0, endTick: 3840 });
    expect(measureRangeLoop(score, 2, 2)).toEqual({ startTick: 3840, endTick: 7680 });
    expect(measureRangeLoop(score, 1, 2)).toEqual({ startTick: 0, endTick: 7680 });
    const sixEight = baseScore(); sixEight.parts[0].timeSignature = { numerator: 6, denominator: 8 };
    expect(measureRangeLoop(sixEight, 2, 2)).toEqual({ startTick: 2880, endTick: 5760 });
  });

  it.each([[0, 1], [2, 1], [1, 3], [1.5, 2], [NaN, 1], [1, Infinity]])("rejects the measure range %s–%s", (first, last) => {
    expect(measureRangeLoop(fourNoteScore(), first, last)).toBeNull();
  });

  it("wraps elapsed ticks so that B itself belongs to the next pass", () => {
    const loop = { startTick: 960, endTick: 2880 };
    expect(playbackLoopTick(loop, 960, 0)).toBe(960);
    expect(playbackLoopTick(loop, 960, 1919)).toBe(2879);
    expect(playbackLoopTick(loop, 960, 1920)).toBe(960);
    expect(playbackLoopTick(loop, 1440, 1440)).toBe(960);
    expect(playbackLoopTick(loop, 960, 1920 * 7 + 480)).toBe(1440);
  });
});

describe("P3-04 A–B loop — scheduling", () => {
  const loop = { startTick: 960, endTick: 2880 }; // D4, E4 — one second at 120 BPM

  it("starts at A, excludes events outside [A,B) and the event that starts at B", async () => {
    const handle = await play(fourNoteScore(), { loop });
    expect(handle.getPosition().tick).toBe(960);
    const first = melody().slice(0, 2);
    expect(first.map((call) => call[0])).toEqual([62, 64]);
    expect(first[0][2]).toBeCloseTo(START);
    expect(first[1][2]).toBeCloseTo(START + 0.5);
    expect(first[0][1]).toBeCloseTo(0.45);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(new Set(melody().map((call) => call[0]))).toEqual(new Set([62, 64]));
  });

  it("repeats N times with exact audio-time boundaries, no duplicates and no drift", async () => {
    await play(fourNoteScore(), { loop });
    await vi.advanceTimersByTimeAsync(START * 1000 + 30_000);
    const calls = melody();
    const sounded = before(calls, START + 30);
    expect(sounded).toHaveLength(60); // 30 passes × 2 notes
    sounded.forEach((call, index) => {
      expect(call[0]).toBe(index % 2 === 0 ? 62 : 64);
      expect(call[2]).toBeCloseTo(START + index * 0.5, 6);
      expect(call[1]).toBeCloseTo(0.45, 6);
    });
    const times = calls.map((call) => call[2]);
    expect(new Set(times.map((time) => time.toFixed(6))).size).toBe(times.length);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(audio.voices.filter((voice) => !voice.click)).toHaveLength(1);
  });

  it("always has the next pass scheduled before it is due, but never an unbounded backlog", async () => {
    await play(fourNoteScore(), { loop });
    for (let step = 0; step < 200; step += 1) {
      await vi.advanceTimersByTimeAsync(137);
      const now = Date.now() / 1000;
      const last = Math.max(...melody().map((call) => call[2]));
      expect(last).toBeGreaterThan(now + 0.5);
      expect(last).toBeLessThan(now + 10);
    }
  });

  it("cursor and highlight wrap from B back to A", async () => {
    const handle = await play(fourNoteScore(), { loop });
    await vi.advanceTimersByTimeAsync(START * 1000 + 750);
    expect(handle.getPosition().tick).toBeCloseTo(2400, 3);
    expect(handle.getPosition().activeNoteIds).toEqual(["n3"]);
    await vi.advanceTimersByTimeAsync(250);
    expect(handle.getPosition().tick).toBeCloseTo(960, 3);
    expect(handle.getPosition().activeNoteIds).toEqual(["n2"]);
    await vi.advanceTimersByTimeAsync(7_250);
    expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    expect(handle.getPosition()).toMatchObject({ measure: 1, beat: 2 });
  });

  it("a note sounding across A is attacked once with its remainder; one crossing B is clipped at B", async () => {
    await play(fourNoteScore(), { loop: { startTick: 480, endTick: 1440 } });
    await vi.advanceTimersByTimeAsync(3_000);
    const sounded = before(melody(), START + 1.5);
    expect(sounded.map((call) => call[0])).toEqual([60, 62, 60, 62, 60, 62]);
    sounded.forEach((call, index) => {
      expect(call[1]).toBeCloseTo(0.225); // 480 ticks × gate 0.9
      expect(call[2]).toBeCloseTo(START + index * 0.25);
    });
  });

  it("a tie crossing B is clipped at B, and a loop starting inside the tie re-attacks only the remainder", async () => {
    await play(tiedScore(), { loop: { startTick: 0, endTick: 3840 } });
    expect(melody()[0]).toEqual([60, expect.closeTo(0.5), expect.closeTo(START + 1.5)]);
    handles.pop()!.stop(); audio.voices.length = 0;
    await play(tiedScore(), { loop: { startTick: 3840, endTick: 7680 } });
    await vi.advanceTimersByTimeAsync(2_500);
    const sounded = before(melody(), START + 2.5);
    expect(sounded).toHaveLength(2);
    expect(sounded[0]).toEqual([60, expect.closeTo(0.5), expect.closeTo(START)]);
    expect(sounded[1]).toEqual([60, expect.closeTo(0.5), expect.closeTo(START + 2)]);
  });

  it("never ends on its own and never mutates the Score", async () => {
    const score = fourNoteScore(); const original = structuredClone(score); const json = serializeScore(score);
    const onEnd = vi.fn(); const onState = vi.fn();
    await play(score, { loop, onEnd, onState });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onState.mock.calls.map((call) => call[0])).toEqual(["playing"]);
    expect(score).toEqual(original);
    expect(serializeScore(score)).toBe(json);
  });

  it("stop disposes the voice, returns to tick 0 and schedules nothing afterwards", async () => {
    const handle = await play(fourNoteScore(), { loop, metronome: true });
    await vi.advanceTimersByTimeAsync(3_300);
    handle.stop();
    const counts = audio.voices.map((voice) => voice.attack.mock.calls.length);
    audio.voices.forEach((voice) => expect(voice.dispose).toHaveBeenCalledTimes(1));
    expect(handle.getPosition()).toMatchObject({ tick: 0, activeNoteIds: [] });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(audio.voices.map((voice) => voice.attack.mock.calls.length)).toEqual(counts);
  });

  it("pause keeps the looped tick; resume finishes the pass and keeps looping", async () => {
    const handle = await play(fourNoteScore(), { loop });
    await vi.advanceTimersByTimeAsync(START * 1000 + 1_750); // second pass, tick 2400
    handle.pause();
    expect(handle.getPosition().tick).toBeCloseTo(2400, 3);
    const frozen = melody().length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(melody()).toHaveLength(frozen);
    expect(handle.getPosition().tick).toBeCloseTo(2400, 3);
    const resumedAt = Date.now() / 1000 + START;
    handle.resume();
    await vi.advanceTimersByTimeAsync(3_000);
    const resumed = before(melody(1), resumedAt + 1.25);
    expect(resumed.map((call) => call[0])).toEqual([64, 62, 64]);
    expect(resumed[0][1]).toBeCloseTo(0.225);
    expect(resumed.map((call) => call[2] - resumedAt)).toEqual([expect.closeTo(0), expect.closeTo(0.25), expect.closeTo(0.75)]);
  });

  it("metronome clicks stay inside [A,B) per pass with one click at each boundary", async () => {
    await play(baseScore(), { loop: { startTick: 0, endTick: 3840 }, metronome: true });
    await vi.advanceTimersByTimeAsync(START * 1000 + 6_000);
    const sounded = before(clicks(), START + 6);
    expect(sounded).toHaveLength(12);
    sounded.forEach((call, index) => {
      expect(call[0]).toBe(index % 4 === 0 ? 1200 : 800);
      expect(call[2]).toBeCloseTo(START + index * 0.5, 6);
    });
    const times = clicks().map((call) => call[2].toFixed(6));
    expect(new Set(times).size).toBe(times.length);
  });

  it("toggling the metronome while looping reschedules clicks only, without duplicates", async () => {
    const handle = await play(fourNoteScore(), { loop });
    const voice = audio.voices[0];
    await vi.advanceTimersByTimeAsync(START * 1000 + 1_300);
    handle.setMetronome(true);
    expect(voice.dispose).not.toHaveBeenCalled();
    const now = Date.now() / 1000;
    const first = clicks();
    expect(first.every((call) => call[2] > now)).toBe(true);
    expect(first[0][2]).toBeCloseTo(START + 1.5);
    await vi.advanceTimersByTimeAsync(5_000);
    const times = clicks().map((call) => call[2].toFixed(6));
    expect(new Set(times).size).toBe(times.length);
    handle.setMetronome(false);
    expect(audio.voices.filter((entry) => entry.click)[0].dispose).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(audio.voices.filter((entry) => entry.click)).toHaveLength(1);
  });

  it("the practice rate scales the loop, and changing it mid-loop keeps the looped tick", async () => {
    const handle = await play(fourNoteScore(), { loop, rate: 0.5 });
    await vi.advanceTimersByTimeAsync(START * 1000 + 2_500); // second pass, 0.5s in → tick 1440
    expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    const slow = before(melody(), START + 2.5);
    expect(slow.map((call) => call[2] - START)).toEqual([expect.closeTo(0), expect.closeTo(1), expect.closeTo(2)]);
    const changedAt = Date.now() / 1000 + START;
    handle.setRate(1);
    expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    await vi.advanceTimersByTimeAsync(3_000);
    const fast = before(melody(1), changedAt + 1.5);
    expect(fast.map((call) => call[0])).toEqual([62, 64, 62, 64]);
    expect(fast.map((call) => call[2] - changedAt)).toEqual(
      [expect.closeTo(0), expect.closeTo(0.25), expect.closeTo(0.75), expect.closeTo(1.25)]);
  });
});

describe("P3-04 A–B loop — changing the loop on a live handle", () => {
  const loop = { startTick: 960, endTick: 2880 };

  it("turning the loop off continues from the current tick to the natural end", async () => {
    const onEnd = vi.fn();
    const handle = await play(fourNoteScore(), { loop, onEnd });
    await vi.advanceTimersByTimeAsync(START * 1000 + 1_250); // second pass, tick 1440
    handle.setLoop(null);
    expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    expect(audio.voices[0].dispose).toHaveBeenCalledTimes(1);
    expect(melody(1).map((call) => call[0])).toEqual([62, 64, 67]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(handle.getPosition().tick).toBe(0);
  });

  it("turning a loop on keeps the tick when it is inside the range and jumps to A otherwise", async () => {
    const inside = await play(fourNoteScore());
    await vi.advanceTimersByTimeAsync(START * 1000 + 750); // tick 1440
    inside.setLoop(loop);
    expect(inside.getPosition().tick).toBeCloseTo(1440, 3);
    expect(melody(1).slice(0, 2).map((call) => call[0])).toEqual([62, 64]);
    handles.pop()!.stop(); audio.voices.length = 0;
    const outside = await play(fourNoteScore());
    await vi.advanceTimersByTimeAsync(START * 1000 + 250); // tick 480, before A
    outside.setLoop(loop);
    expect(outside.getPosition().tick).toBe(960);
    expect(melody(1)[0][0]).toBe(62);
  });

  it("while paused it applies silently and resume starts inside the new range", async () => {
    const handle = await play(fourNoteScore());
    await vi.advanceTimersByTimeAsync(START * 1000 + 250);
    handle.pause();
    handle.setLoop(loop);
    expect(audio.voices).toHaveLength(1);
    expect(handle.getPosition()).toMatchObject({ tick: 960, activeNoteIds: [] });
    handle.resume();
    expect(melody(1).slice(0, 2).map((call) => call[0])).toEqual([62, 64]);
  });

  it("an identical range is a no-op and a finished handle ignores changes", async () => {
    const handle = await play(fourNoteScore(), { loop });
    handle.setLoop({ ...loop });
    expect(audio.voices).toHaveLength(1);
    expect(audio.voices[0].dispose).not.toHaveBeenCalled();
    handle.stop();
    handle.setLoop(null);
    expect(audio.voices).toHaveLength(1);
  });

  it.each([{ startTick: 960, endTick: 960 }, { startTick: 0, endTick: 99_999 }, { startTick: 0.5, endTick: 960 }])(
    "rejects the invalid range %j before audio and on a live handle", async (invalid) => {
      await expect(playScore(fourNoteScore(), { loop: invalid })).rejects.toThrow(RangeError);
      expect(audio.voices).toHaveLength(0);
      const handle = await play(fourNoteScore(), { loop });
      await vi.advanceTimersByTimeAsync(START * 1000 + 250);
      expect(() => handle.setLoop(invalid)).toThrow(RangeError);
      expect(audio.voices).toHaveLength(1);
      expect(audio.voices[0].dispose).not.toHaveBeenCalled();
      expect(handle.getPosition().tick).toBeCloseTo(1440, 3);
    });
});
