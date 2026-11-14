import { describe, expect, it } from "vitest";
import { buildTranscribedScore, createTranscribedScore } from "@/application";
import { createNoteEvent, validateScore, type ClipboardPayload } from "@/domain/score";
import { MemoryScoreRepository } from "../fixtures/memory-repository";

const BAR_34 = 2880;
const CREATED_AT = "2026-11-14T00:00:00.000Z";
const setup = { title: "콧노래", tempoBpm: 72, timeSignature: { numerator: 3, denominator: 4 },
  keySignature: { tonic: "C" as const, alter: 0, mode: "major" as const, fifths: 0 } };
const take: ClipboardPayload = {
  lengthTicks: 9 * BAR_34,
  events: [createNoteEvent({ id: "t1", step: "G", octave: 4, startTick: 0, durationTicks: 960 }),
    createNoteEvent({ id: "t2", step: "A", octave: 4, startTick: 8 * BAR_34, durationTicks: 960 })],
  ties: [],
};
const ids = () => { let next = 0; return () => `id-${next++}`; };

describe("createTranscribedScore (/record step 4 '악보 만들기')", () => {
  it("builds a valid score with the step-1 settings and the take from measure 1, growing measures as needed", () => {
    const result = buildTranscribedScore({ id: "s", createdAt: CREATED_AT, setup, clipboard: take, nextId: ids() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const part = result.score.parts[0];
    expect(result.score).toMatchObject({ title: "콧노래", tempoBpm: 72 });
    expect(part.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(part.measures).toHaveLength(9);
    expect(part.measures[0].events.map((event) => event.startTick)).toEqual([0]);
    expect(validateScore(result.score)).toEqual([]);
  });

  it("saves exactly one score and nothing when the take is empty", async () => {
    const repository = new MemoryScoreRepository();
    const score = await createTranscribedScore(repository, { id: "s", createdAt: CREATED_AT, setup, clipboard: take, nextId: ids() });
    expect(repository.size()).toBe(1);
    expect((await repository.read("s"))?.score).toEqual(score);
    await expect(createTranscribedScore(repository, { id: "e", createdAt: CREATED_AT, setup,
      clipboard: { lengthTicks: 0, events: [], ties: [] }, nextId: ids() })).rejects.toThrow("음표가 없습니다");
    expect(repository.size()).toBe(1);
  });
});
