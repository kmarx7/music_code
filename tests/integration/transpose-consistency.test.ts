import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StaveNote, type Accidental, type Tickable } from "vexflow";
import { renderScoreInto } from "@/adapters/vexflow/renderScore";
import { playScore } from "@/adapters/tone/playback";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { exportScoreBackup, importScoreBackup, openOrCreateScore } from "@/application/score-library";
import { createScoreStore } from "@/store/score-store";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { createNoteEvent, createRestEvent, validateScore, type Score } from "@/domain/score";
import { baseScore, fourNoteScore, tiedScore } from "../fixtures/scores";

const notation = vi.hoisted(() => ({ voices: [] as Tickable[][], keys: [] as string[], ties: [] as unknown[] }));
const audio = vi.hoisted(() => ({ attacks: vi.fn(), frequency: vi.fn(), dispose: vi.fn() }));
// Keep actual VexFlow pitch, accidental and tick calculations; replace only DOM drawing/layout.
vi.mock("vexflow", async (original) => {
  const actual = await original<typeof import("vexflow")>();
  return { ...actual,
    Renderer: class { static Backends = { SVG: 1 }; resize() {} getContext() { return {}; } },
    Stave: class {
      addClef() { return this; } addTimeSignature() { return this; }
      addKeySignature(key: string) { notation.keys.push(key); return this; } setContext() { return this; } draw() {}
    },
    Voice: class extends actual.Voice {
      addTickables(notes: Tickable[]) { notation.voices.push(notes); return super.addTickables(notes); } draw() {}
    },
    Formatter: class { joinVoices() { return this; } format() { return this; } },
    StaveTie: class { constructor(link: unknown) { notation.ties.push(link); } setContext() { return this; } draw() {} },
  };
});
vi.mock("tone", () => ({
  start: vi.fn().mockResolvedValue(undefined), now: () => 10, immediate: () => 10,
  Frequency: (midi: number, unit: string) => {
    audio.frequency(midi, unit); return { toFrequency: () => `midi:${midi}` };
  },
  Synth: class { toDestination() { return this; } triggerAttackRelease = audio.attacks; dispose = audio.dispose; },
}));
function key(id: string) { return KEY_SIGNATURE_OPTIONS.find((option) => option.id === id)!.key; }
function store(score: Score, target = "major:2") {
  const result = createScoreStore(); result.init(score);
  expect(result.dispatch({ type: "TransposeScore", spec: { kind: "targetKey", targetKey: key(target) }, updatedAt: "2026-11-08T06:00:00.000Z" })?.ok).toBe(true);
  return result;
}
async function project(score: Score) {
  notation.voices.length = notation.keys.length = notation.ties.length = 0;
  await renderScoreInto({ innerHTML: "" } as HTMLDivElement, score);
  return { keys: [...notation.keys], ties: notation.ties.length,
    notes: notation.voices.flatMap((voice) => voice.filter((note): note is StaveNote => note instanceof StaveNote).map((note) => ({
      keys: note.getKeys(), lines: note.getKeyProps().map((pitch) => pitch.line), rest: note.isRest(),
      ticks: note.getTicks().value(), accidentals: note.getModifiers().filter((modifier) => modifier.getCategory() === "Accidental").map((modifier) => (modifier as Accidental).type),
    }))) };
}
async function schedule(score: Score) {
  audio.attacks.mockClear(); audio.frequency.mockClear();
  const handle = await playScore(score);
  try { return { frequency: [...audio.frequency.mock.calls], attacks: [...audio.attacks.mock.calls] }; }
  finally { handle.stop(); }
}
beforeEach(() => {
  vi.spyOn(StaveNote.prototype, "getSVGElement").mockReturnValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each([
  ["major:0", "major:2", "D", ["d/4", "e/4", "f#/4", "a/4"], [62, 64, 66, 69]],
  ["major:0", "major:-5", "Db", ["db/4", "eb/4", "f/4", "ab/4"], [61, 63, 65, 68]],
  ["major:0", "major:7", "C#", ["c#/4", "d#/4", "e#/4", "g#/4"], [61, 63, 65, 68]],
  ["minor:0", "minor:2", "D", ["d/4", "e/4", "f#/4", "a/4"], [62, 64, 66, 69]],
] as const)("%s → %s uses key-aware notation and matching Tone MIDI", async (source, target, signature, spellings, midis) => {
  const score = fourNoteScore(); score.parts[0].keySignature = key(source); const before = JSON.stringify(score);
  const changed = store(score, target).getState()!.current; const rendered = await project(changed); const played = await schedule(changed);
  expect(rendered.keys).toEqual([signature]); expect(rendered.notes.map((note) => note.keys[0])).toEqual(spellings);
  expect(rendered.notes.every((note) => note.accidentals.length === 0)).toBe(true);
  expect(played.frequency).toEqual(midis.map((midi) => [midi, "midi"]));
  expect(played.attacks.map((call) => call[0])).toEqual(midis.map((midi) => `midi:${midi}`));
  expect(played.attacks.map((call) => call[2])).toEqual([10.1, 10.6, 11.1, 11.6]);
  expect(played.attacks.every((call) => call[1] === 0.45)).toBe(true);
  expect(JSON.stringify(score)).toBe(before); expect(validateScore(changed)).toEqual([]);
});
it("preserves chromatic spelling, doubles, naturals and same-measure accidental state", async () => {
  const score = baseScore(); score.parts[0].measures[0].events = [1, 0, 0, 2].map((alter, index) =>
    createNoteEvent({ id: `n${index}`, step: "F", alter, octave: 4, startTick: index * 960, durationTicks: 960 }));
  const changed = store(score).getState()!.current; const rendered = await project(changed);
  expect(rendered.notes.map((note) => note.keys[0])).toEqual(["g#/4", "g/4", "g/4", "g##/4"]);
  expect(rendered.notes.map((note) => note.accidentals)).toEqual([["#"], ["n"], [], ["##"]]);
  expect((await schedule(changed)).frequency).toEqual([[68, "midi"], [67, "midi"], [67, "midi"], [69, "midi"]]);
});
it("B#4 and C5 sound alike but retain different staff positions; Cb4 keeps its written octave", async () => {
  const score = baseScore(); score.parts[0].measures[0].events = [createNoteEvent({ id: "b", step: "B", octave: 4, startTick: 0, durationTicks: 960 })];
  const sharp = store(score, "major:7").getState()!.current; const flat = store(score, "major:-5").getState()!.current;
  expect((await project(sharp)).notes[0]).toMatchObject({ keys: ["b#/4"], lines: [3] });
  expect((await project(flat)).notes[0]).toMatchObject({ keys: ["c/5"], lines: [3.5] });
  expect((await schedule(sharp)).frequency).toEqual((await schedule(flat)).frequency);
  score.parts[0].measures[0].events = [createNoteEvent({ id: "c", step: "C", octave: 4, startTick: 0, durationTicks: 960 })];
  const low = store(score, "major:-7").getState()!.current;
  expect((await project(low)).notes[0]).toMatchObject({ keys: ["cb/4"], lines: [0] });
  expect((await schedule(low)).frequency).toEqual([[59, "midi"]]);
});
it("ties/rests/tempo survive command, undo/redo, DB reopen and JSON backup/import with identical projections", async () => {
  const score = tiedScore(); score.tempoBpm = 60;
  score.parts[0].measures[0].events.unshift(createRestEvent({ id: "rest", startTick: 0, durationTicks: 960 }));
  const repository = createIndexedDbScoreRepository({ dbName: "transpose-projections" }); await repository.create(score);
  const session = store(score); const changed = session.getState()!.current;
  const expected = await project(changed); const played = await schedule(changed);
  expect(expected.ties).toBe(1); expect(expected.notes[0].rest).toBe(true);
  expect(expected.notes.slice(1).map((note) => note.keys)).toEqual([["d/4"], ["d/4"]]);
  expect(played.frequency).toEqual([[62, "midi"]]); expect(played.attacks).toEqual([["midi:62", 2, 13.1]]);
  session.undo(); expect(session.getState()!.current).toBe(score); expect((await schedule(session.getState()!.current)).frequency).toEqual([[60, "midi"]]);
  session.redo(); expect(session.getState()!.current).toBe(changed);
  expect(await project(session.getState()!.current)).toEqual(expected); expect(await schedule(session.getState()!.current)).toEqual(played);
  expect(await repository.save(changed, 1)).toBe(2);
  const reopened = await openOrCreateScore(createIndexedDbScoreRepository({ dbName: "transpose-projections" }), { id: score.id, createdAt: "unused" });
  expect(reopened).toMatchObject({ score: changed, revision: 2, created: false });
  expect(await project(reopened.score)).toEqual(expected); expect(await schedule(reopened.score)).toEqual(played);
  const backup = exportScoreBackup(reopened.score); expect(JSON.parse(backup.json)).toEqual(changed);
  expect(JSON.parse(backup.json)).not.toHaveProperty("revision"); expect(changed.schemaVersion).toBe(2);
  const imported = await importScoreBackup(repository, backup.json, { id: "imported-transpose", importedAt: "2026-11-08T07:00:00.000Z" });
  expect(imported.score.parts).toEqual(changed.parts); expect(await project(imported.score)).toEqual(expected); expect(await schedule(imported.score)).toEqual(played);
});
it("transposes every Part and round-trips them while current notation/playback explicitly project only the first Part", async () => {
  const score = fourNoteScore(); const second = structuredClone(score.parts[0]); second.id = "second";
  second.measures.forEach((measure) => { measure.id += ":second"; measure.events.forEach((event) => { event.id += ":second"; }); });
  second.measures[0].events = [createNoteEvent({ id: "high", step: "C", octave: 6, startTick: 0, durationTicks: 960 })]; score.parts.push(second);
  const changed = store(score).getState()!.current;
  expect(changed.parts[1].measures[0].events[0]).toMatchObject({ pitch: { midi: 86, step: "D", octave: 6 } });
  const repo = createIndexedDbScoreRepository({ dbName: "transpose-multipart" }); await repo.create(changed);
  expect((await repo.read(changed.id))!.score).toEqual(changed);
  expect((await project(changed)).notes.map((note) => note.keys[0])).toEqual(["d/4", "e/4", "f#/4", "a/4"]);
  expect((await schedule(changed)).frequency).toEqual([[62, "midi"], [64, "midi"], [66, "midi"], [69, "midi"]]);
});
async function raw(name: string, id: string) {
  const request = indexedDB.open(name);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const request = db.transaction("scores", "readonly").objectStore("scores").get(id);
    const record = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return { version: db.version, record };
  } finally { db.close(); }
}
it("concurrent transposed writes without notifications preserve the winner, loser history, raw data and tombstone", async () => {
  const name = "transpose-race-projection";
  const repositories = [createIndexedDbScoreRepository({ dbName: name }), createIndexedDbScoreRepository({ dbName: name })];
  const source = tiedScore(); await repositories[0].create(source);
  const sessions = [store(source), store(source, "major:-5")]; const memories = sessions.map((session) => session.getState()!);
  const results = await Promise.allSettled(repositories.map((repository, index) => repository.save(memories[index].current, 1)));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toMatchObject([{ reason: { code: "CONFLICT" } }]);
  const winnerIndex = results.findIndex((result) => result.status === "fulfilled"); const loserIndex = 1 - winnerIndex;
  const changed = memories[winnerIndex].current; const loser = sessions[loserIndex]; const memory = memories[loserIndex];
  const committed = await raw(name, source.id); expect(committed.version).toBe(2);
  expect(loser.getState()).toBe(memory); loser.undo(); expect(loser.getState()!.current).toBe(source);
  loser.redo(); expect(loser.getState()!.current).toBe(memory.current);
  await expect(repositories[loserIndex].save(memory.current, 1)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await raw(name, source.id)).toEqual(committed);
  expect(await repositories[0].read(source.id)).toEqual({ score: changed, revision: 2 });
  expect(await schedule((await repositories[1].read(source.id))!.score)).toEqual(await schedule(changed));
  await repositories[winnerIndex].delete(source.id, 2); const tombstone = await raw(name, source.id);
  expect(tombstone.record).toMatchObject({ revision: 3, deleted: true });
  await expect(repositories[loserIndex].save(memory.current, 1)).rejects.toMatchObject({ code: "DELETED" });
  await expect(openOrCreateScore(repositories[loserIndex], { id: source.id, createdAt: "unused" })).rejects.toMatchObject({ code: "DELETED" });
  expect(await raw(name, source.id)).toEqual(tombstone);
});
