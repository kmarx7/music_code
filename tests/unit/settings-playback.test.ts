import { afterEach, expect, it, vi } from "vitest";
import { playScore } from "@/adapters/tone/playback";
import { applyEditCommand } from "@/domain/commands";
import { fourNoteScore } from "../fixtures/scores";

const calls = vi.hoisted(() => ({ attack: vi.fn() }));
vi.mock("tone", () => ({
  start: vi.fn().mockResolvedValue(undefined), now: () => 10,
  Frequency: (midi: number) => ({ toFrequency: () => midi }),
  Synth: class {
    toDestination() { return this; }
    triggerAttackRelease = calls.attack;
    dispose() {}
  },
}));
afterEach(() => calls.attack.mockClear());

it.each([60, 120, 240])("uses committed tempo %s for scheduling without changing pitches", async (tempoBpm) => {
  const changed = applyEditCommand(fourNoteScore(), { type: "SetTempo", tempoBpm, updatedAt: "2026-11-08T01:00:00.000Z" });
  if (!changed.ok) throw new Error(changed.error.message);
  const handle = await playScore(changed.score);
  try {
    expect(calls.attack.mock.calls.map((call) => call[0])).toEqual([60, 62, 64, 67]);
    expect(calls.attack.mock.calls[1][2] - calls.attack.mock.calls[0][2]).toBeCloseTo(60 / tempoBpm);
    expect(calls.attack.mock.calls[0][1]).toBeCloseTo((60 / tempoBpm) * 0.9);
  } finally { handle.stop(); }
});
