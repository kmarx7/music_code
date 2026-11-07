import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPianoPreview, type PianoPreview } from "@/adapters/tone/pianoPreview";
import { playScore, type PlaybackHandle } from "@/adapters/tone/playback";
import { fourNoteScore } from "../fixtures/scores";

const audio = vi.hoisted(() => ({
  start: vi.fn(), state: "running", gains: [] as { param: Param; dispose: ReturnType<typeof vi.fn> }[],
  oscillators: [] as { frequency: Param; start: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
  synthDispose: vi.fn(), failConnect: false,
}));
type Param = { events: { value: number; time: number }[]; cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> };
vi.mock("tone", () => {
  function param(): Param {
    const events: Param["events"] = [];
    return { events,
      cancelAndHoldAtTime: vi.fn((time: number) => { for (let i = events.length - 1; i >= 0; i--) if (events[i].time >= time) events.splice(i, 1); }),
      setValueAtTime: vi.fn((value: number, time: number) => events.push({ value, time })),
      linearRampToValueAtTime: vi.fn((value: number, time: number) => events.push({ value, time })),
    };
  }
  return {
    start: audio.start, getContext: () => ({ state: audio.state }),
    immediate: () => Date.now() / 1000, now: () => Date.now() / 1000 + 0.1,
    Frequency: (midi: number) => ({ toFrequency: () => 440 * 2 ** ((midi - 69) / 12) }),
    Gain: class { gain = param(); dispose = vi.fn(); constructor() { audio.gains.push({ param: this.gain, dispose: this.dispose }); } toDestination() { return this; } },
    Oscillator: class {
      frequency = param(); start = vi.fn(); dispose = vi.fn();
      constructor() { audio.oscillators.push(this); }
      connect() { if (audio.failConnect) throw new Error("closed context"); return this; }
    },
    Synth: class { toDestination() { return this; } triggerAttackRelease() {} dispose = audio.synthDispose; },
  };
});
const previews: PianoPreview[] = [];
const playbacks: PlaybackHandle[] = [];
function create() { const preview = createPianoPreview(); previews.push(preview); return preview; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0); audio.state = "running"; audio.failConnect = false;
  audio.start.mockReset().mockResolvedValue(undefined); audio.gains.length = 0; audio.oscillators.length = 0; audio.synthDispose.mockClear();
});
afterEach(() => { previews.splice(0).forEach((preview) => preview.dispose()); playbacks.splice(0).forEach((playback) => playback.stop()); vi.useRealTimers(); });

it("preloading never unlocks audio or creates nodes before a user input", async () => {
  const preview = create(); await preview.prepare(); await preview.prepare();
  expect(audio.start).not.toHaveBeenCalled(); expect(audio.gains).toHaveLength(0); expect(audio.oscillators).toHaveLength(0);
});
it("a preloaded user input invokes audio activation synchronously and schedules the correct pitch", async () => {
  const preview = create(); await preview.prepare();
  const playing = preview.play(69);
  expect(audio.start).toHaveBeenCalledTimes(1);
  expect(await playing).toBe(true);
  expect(audio.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
  expect(audio.gains[0].param.events.at(-1)).toEqual({ value: 0, time: 0.2 });
  expect(vi.getTimerCount()).toBe(0); // The audio envelope, not a JS timeout, ends the pulse.
});
it.each([21, 60, 61, 108])("previews MIDI %s using the canonical MIDI pitch", async (midi) => {
  expect(await create().play(midi)).toBe(true);
  expect(audio.oscillators[0].frequency.events.at(-1)!.value).toBeCloseTo(440 * 2 ** ((midi - 69) / 12));
});
it("rapid notes share one voice and cancel old note-offs instead of cutting off the newest note", async () => {
  const preview = create(); await preview.play(60);
  vi.setSystemTime(50); await preview.play(62);
  vi.setSystemTime(80); await preview.play(64);
  expect(audio.oscillators).toHaveLength(1); expect(audio.gains).toHaveLength(1);
  expect(audio.oscillators[0].start).toHaveBeenCalledTimes(1);
  expect(audio.oscillators[0].dispose).not.toHaveBeenCalled();
  const zeros = audio.gains[0].param.events.filter((event) => event.value === 0);
  expect(zeros).toHaveLength(1); expect(zeros[0].time).toBeCloseTo(0.28);
  expect(audio.gains[0].param.cancelAndHoldAtTime).toHaveBeenCalledTimes(3);
});
it("an initial burst keeps only the latest preview without replaying delayed old inputs", async () => {
  const preview = create();
  const results = await Promise.all([preview.play(60), preview.play(62), preview.play(64)]);
  expect(results).toEqual([false, false, true]);
  expect(audio.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledTimes(1);
});
it("out-of-order audio activation completion cannot supersede the latest pitch", async () => {
  const preview = create(); await preview.prepare();
  let finish!: () => void;
  audio.start.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const old = preview.play(60); await preview.play(67); finish();
  expect(await old).toBe(false);
  expect(audio.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledTimes(1);
});
it("stop invalidates pending activation and silences future envelopes", async () => {
  const preview = create(); await preview.play(60); vi.setSystemTime(20); preview.stop();
  expect(audio.gains[0].param.events.filter((event) => event.value === 0)).toEqual([{ value: 0, time: 0.03 }]);
  let finish!: () => void;
  audio.start.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const old = preview.play(62); preview.stop(); finish(); expect(await old).toBe(false);
  expect(audio.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledTimes(1);
});
it("dispose releases both nodes once and prevents delayed or subsequent sound", async () => {
  const preview = create(); await preview.play(60); preview.dispose(); preview.dispose();
  expect(audio.oscillators[0].dispose).toHaveBeenCalledTimes(1); expect(audio.gains[0].dispose).toHaveBeenCalledTimes(1);
  expect(await preview.play(64)).toBe(false);
  const pending = create(); const request = pending.play(65); pending.dispose(); expect(await request).toBe(false);
  expect(audio.oscillators).toHaveLength(1);
});
it("rejected audio activation is retryable", async () => {
  const preview = create(); audio.start.mockRejectedValueOnce(new Error("not allowed"));
  await expect(preview.play(60)).rejects.toThrow("not allowed");
  expect(audio.oscillators).toHaveLength(0); expect(await preview.play(60)).toBe(true);
});
it("a suspended context is reported instead of falsely claiming audible playback", async () => {
  audio.state = "suspended";
  await expect(create().play(60)).rejects.toThrow("not running"); expect(audio.oscillators).toHaveLength(0);
});
it.each([-1, 128, 60.5, NaN])("rejects invalid MIDI %s before any audio initialization", async (midi) => {
  await expect(create().play(midi)).rejects.toThrow("Invalid MIDI"); expect(audio.start).not.toHaveBeenCalled();
});
it("an old rejected activation cannot dispose a newer voice", async () => {
  const preview = create(); await preview.prepare(); let rejectOld!: (error: Error) => void;
  audio.start.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOld = reject; }));
  const old = preview.play(60); await preview.play(64); rejectOld(new Error("old request"));
  expect(await old).toBe(false); expect(audio.oscillators[0].dispose).not.toHaveBeenCalled();
});
it("preview controls neither dispose score playback nor mutate its Score", async () => {
  const score = fourNoteScore(); const before = JSON.stringify(score);
  const playback = await playScore(score); playbacks.push(playback);
  const preview = create(); await preview.play(60); preview.stop(); preview.dispose();
  expect(audio.synthDispose).not.toHaveBeenCalled();
  const other = create(); await other.play(64); playback.stop();
  expect(audio.oscillators[1].dispose).not.toHaveBeenCalled(); expect(JSON.stringify(score)).toBe(before);
});
it("node initialization errors release partially created resources and can be retried", async () => {
  const preview = create(); audio.failConnect = true;
  await expect(preview.play(60)).rejects.toThrow("closed context");
  expect(audio.gains[0].dispose).toHaveBeenCalledTimes(1);
  expect(audio.oscillators[0].dispose).toHaveBeenCalledTimes(1);
  audio.failConnect = false; expect(await preview.play(60)).toBe(true);
});
