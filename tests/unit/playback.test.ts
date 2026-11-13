import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { playScore, type PlaybackHandle } from "@/adapters/tone/playback";
import { playbackEndTick, playbackPositionAt, createRestEvent, measureTicks } from "@/domain/score";
import { highlightPlayback } from "@/features/playback";
import { baseScore, fourNoteScore, longTiedScore, tiedScore } from "../fixtures/scores";

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

it.each([60, 120, 240])("cursor uses raw audio time at %s BPM and excludes scheduling lead-in", async (tempoBpm) => {
  const score = { ...fourNoteScore(), tempoBpm };
  const update = vi.fn();
  const handle = await play(score, { onPosition: update });
  expect(handle.getPosition().activeNoteIds).toEqual([]);
  await vi.advanceTimersByTimeAsync(200 + 60 / tempoBpm * 1000);
  expect(handle.getPosition().tick).toBeCloseTo(960);
  expect(handle.getPosition().activeNoteIds).toEqual(["n2"]);
  expect(update).toHaveBeenCalled();
});

it("pause freezes the cursor, clears highlights/audio, and resume schedules only remaining notes", async () => {
  const score = fourNoteScore(); const before = structuredClone(score);
  const handle = await play(score);
  await vi.advanceTimersByTimeAsync(950); // 0.2s lead-in + 0.75s = 1440 ticks
  handle.pause();
  expect(handle.getPosition().tick).toBeCloseTo(1440);
  expect(handle.getPosition().activeNoteIds).toEqual([]);
  expect(audio.voices[0].dispose).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(handle.getPosition().tick).toBeCloseTo(1440);
  handle.resume();
  expect(audio.voices[1].attack.mock.calls.map((call) => call[0])).toEqual([62, 64, 67]);
  expect(audio.voices[1].attack.mock.calls[0][1]).toBeCloseTo(0.225);
  await vi.advanceTimersByTimeAsync(450);
  expect(handle.getPosition().tick).toBeCloseTo(1920);
  handle.stop(); handle.resume(); handle.pause();
  expect(handle.getPosition()).toMatchObject({ tick: 0, activeNoteIds: [] });
  expect(audio.voices).toHaveLength(2);
  expect(score).toEqual(before);
});

it("ties have a single full-duration attack while the highlight advances to the continuation", async () => {
  const handle = await play(tiedScore());
  expect(audio.voices[0].attack).toHaveBeenCalledTimes(1);
  expect(audio.voices[0].attack.mock.calls[0]).toEqual([60, 1, 1.7]);
  await vi.advanceTimersByTimeAsync(1800);
  expect(handle.getPosition().activeNoteIds).toEqual(["t1"]);
  await vi.advanceTimersByTimeAsync(400);
  expect(handle.getPosition().activeNoteIds).toEqual(["t1:tie1"]);
  expect(audio.voices[0].attack).toHaveBeenCalledTimes(1);
});

it("resuming in a tie continuation re-attacks the remaining logical note once", async () => {
  const handle = await play(tiedScore());
  await vi.advanceTimersByTimeAsync(2450);
  handle.pause(); handle.resume();
  expect(audio.voices[1].attack.mock.calls).toHaveLength(1);
  expect(audio.voices[1].attack.mock.calls[0][1]).toBeCloseTo(0.25);
});

it.each([{ numerator: 2, denominator: 4 }, { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 }, { numerator: 6, denominator: 8 }])("metronome honors $numerator/$denominator and accents each bar", async (meter) => {
  const score = baseScore(); score.parts[0].timeSignature = meter;
  const before = structuredClone(score);
  await play(score, { metronome: true });
  const clicks = audio.voices.find((voice) => voice.click)!.attack.mock.calls;
  expect(clicks).toHaveLength(meter.numerator * 2);
  const interval = 0.5 * 4 / meter.denominator;
  clicks.forEach((call, index) => {
    expect(call[0]).toBe(index % meter.numerator === 0 ? 1200 : 800);
    expect(call[2]).toBeCloseTo(0.2 + index * interval);
    expect(playbackPositionAt(score, index * 960 * 4 / meter.denominator)).toMatchObject({
      measure: Math.floor(index / meter.numerator) + 1, beat: index % meter.numerator + 1,
    });
  });
  expect(playbackEndTick(score)).toBe(2 * measureTicks(meter));
  expect(score).toEqual(before);
});

it.each([60, 90, 240])("metronome uses committed tempo %s", async (tempoBpm) => {
  await play({ ...baseScore(), tempoBpm }, { metronome: true });
  const clicks = audio.voices[1].attack.mock.calls;
  expect(clicks[1][2] - clicks[0][2]).toBeCloseTo(60 / tempoBpm);
});

it("live metronome toggles dispose clicks without restarting melody or replaying elapsed beats", async () => {
  const handle = await play(fourNoteScore());
  await vi.advanceTimersByTimeAsync(950);
  handle.setMetronome(true);
  const click = audio.voices[1];
  expect(click.attack.mock.calls.map((call) => call[2])).toEqual([1.2, 1.7]);
  handle.setMetronome(true);
  expect(audio.voices).toHaveLength(2);
  handle.setMetronome(false);
  expect(click.dispose).toHaveBeenCalledTimes(1);
  expect(audio.voices[0].attack).toHaveBeenCalledTimes(4);
  expect(handle.getPosition().tick).toBeCloseTo(1440);
});

it("pause cancels metronome clicks and honors a toggle before resume", async () => {
  const handle = await play(fourNoteScore(), { metronome: true });
  await vi.advanceTimersByTimeAsync(450);
  handle.pause(); expect(audio.voices[1].dispose).toHaveBeenCalledTimes(1);
  handle.setMetronome(false); handle.resume();
  expect(audio.voices.filter((voice) => voice.click)).toHaveLength(1);
});

it("natural end includes trailing rests, resets position and invokes onEnd exactly once", async () => {
  const score = fourNoteScore(); score.parts[0].measures[1].events = [createRestEvent({ id: "r", startTick: 3840, durationTicks: 960 })];
  const onEnd = vi.fn(); const onState = vi.fn();
  const handle = await play(score, { onEnd, onState });
  await vi.advanceTimersByTimeAsync(2300);
  expect(handle.getPosition().tick).toBeCloseTo(4032);
  expect(handle.getPosition().activeNoteIds).toEqual([]);
  expect(onEnd).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(400);
  expect(handle.getPosition()).toMatchObject({ tick: 0, activeNoteIds: [] });
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onState.mock.calls.map((call) => call[0])).toEqual(["playing", "stopped"]);
  handle.stop(); await vi.advanceTimersByTimeAsync(10000);
  expect(onEnd).toHaveBeenCalledTimes(1);
});

it("manual stop cancels callbacks, disposes both voices and is idempotent", async () => {
  const onEnd = vi.fn(); const update = vi.fn();
  const handle = await play(tiedScore(), { metronome: true, onEnd, onPosition: update });
  handle.stop(); handle.stop();
  const count = update.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(update).toHaveBeenCalledTimes(count);
  expect(onEnd).not.toHaveBeenCalled();
  expect(audio.voices.every((voice) => voice.dispose.mock.calls.length === 1)).toBe(true);
});

it("rests and gaps have no active note and event ends are exclusive", () => {
  const score = tiedScore();
  expect(playbackPositionAt(score, 0).activeNoteIds).toEqual([]);
  expect(playbackPositionAt(score, 3839).activeNoteIds).toEqual(["t1"]);
  expect(playbackPositionAt(score, 3840).activeNoteIds).toEqual(["t1:tie1"]);
  expect(playbackPositionAt(score, 4800).activeNoteIds).toEqual([]);
});

it("DOM highlight updates matching chip/SVG segments without changing selection", () => {
  const elements = ["t1", "t1", "t1:tie1"].map((id) => {
    const attrs = new Map([["data-event-id", id], ["aria-pressed", "true"]]);
    return { attrs, getAttribute: (key: string) => attrs.get(key), setAttribute: (key: string, value: string) => attrs.set(key, value), removeAttribute: (key: string) => attrs.delete(key) };
  });
  const root = { querySelectorAll: () => elements } as unknown as HTMLElement;
  highlightPlayback(root, ["t1"]);
  expect(elements.map((element) => element.attrs.has("data-playing"))).toEqual([true, true, false]);
  highlightPlayback(root, ["t1:tie1"]);
  expect(elements.map((element) => element.attrs.has("data-playing"))).toEqual([false, false, true]);
  highlightPlayback(root, []);
  expect(elements.every((element) => !element.attrs.has("data-playing") && element.attrs.get("aria-pressed") === "true")).toBe(true);
});

it("audio initialization failure rejects without creating voices or timers", async () => {
  const Tone = await import("tone");
  vi.mocked(Tone.start).mockRejectedValueOnce(new Error("audio permission"));
  const position = vi.fn();
  await expect(playScore(fourNoteScore(), { onPosition: position })).rejects.toThrow("audio permission");
  expect(audio.voices).toHaveLength(0);
  expect(position).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});


it.each([66, 67, 128])("schedules all %s tied segments in one attack and resumes the final segment", async (count) => {
  const score = longTiedScore(count); const before = JSON.stringify(score);
  const handle = await play(score);
  expect(audio.voices[0].attack.mock.calls).toEqual([[60, count * 0.5, 0.2]]);
  await vi.advanceTimersByTimeAsync(200 + (count - 1) * 500 + 250);
  expect(handle.getPosition().activeNoteIds).toEqual([`long-${count - 1}`]);
  handle.pause(); expect(audio.voices[0].dispose).toHaveBeenCalledTimes(1);
  handle.resume();
  expect(audio.voices[1].attack).toHaveBeenCalledTimes(1);
  expect(audio.voices[1].attack.mock.calls[0][1]).toBeCloseTo(0.25);
  handle.stop(); expect(audio.voices[1].dispose).toHaveBeenCalledTimes(1);
  expect(handle.getPosition()).toMatchObject({ tick: 0, activeNoteIds: [] });
  expect(JSON.stringify(score)).toBe(before);
});

it.each(["missing", "cycle"])("rejects %s ties before scheduling any audio voice", async (kind) => {
  const score = longTiedScore(67);
  if (kind === "missing") score.parts[0].ties[0].to = "missing";
  else score.parts[0].ties.push({ from: "long-66", to: "long-0" });
  const before = JSON.stringify(score);
  await expect(playScore(score)).rejects.toThrow(kind === "missing" ? "TIE_UNKNOWN_REF" : "TIE_CYCLE");
  expect(audio.voices).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  expect(JSON.stringify(score)).toBe(before);
});

it("starts from a cursor tick: a note under the cursor sounds its remainder, later notes follow (MVP-012)", async () => {
  const score = fourNoteScore(); const before = structuredClone(score);
  const handle = await play(score, { fromTick: 1440 });
  expect(handle.getPosition().tick).toBe(1440);
  const calls = audio.voices[0].attack.mock.calls;
  expect(calls.map((call) => call[0])).toEqual([62, 64, 67]);
  expect(calls[0][1]).toBeCloseTo(480 * (0.5 / 960) * 0.9); // remaining half beat at 120 BPM, playback gate
  expect(calls[1][2] - calls[0][2]).toBeCloseTo(0.25);
  await vi.advanceTimersByTimeAsync(200 + 250); // 0.2 s scheduling lead-in, then half a beat
  expect(handle.getPosition().tick).toBeCloseTo(1920);
  expect(score).toEqual(before);
});

it("a cursor start inside the A–B loop is kept; outside it starts at A", async () => {
  const score = fourNoteScore();
  const loop = { startTick: 0, endTick: measureTicks(score.parts[0].timeSignature) };
  expect((await play(score, { fromTick: 960, loop })).getPosition().tick).toBe(960);
  const later = { startTick: measureTicks(score.parts[0].timeSignature), endTick: 2 * measureTicks(score.parts[0].timeSignature) };
  expect((await play(score, { fromTick: 960, loop: later })).getPosition().tick).toBe(later.startTick);
});

it.each([-1, 0.5, Number.NaN, 2 * 3840 + 1])("rejects an invalid start tick %s before any audio starts", async (fromTick) => {
  await expect(playScore(fourNoteScore(), { fromTick })).rejects.toThrow(RangeError);
  expect(audio.voices).toHaveLength(0);
});
