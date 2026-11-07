import "fake-indexeddb/auto";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import type { ScoreRepository } from "@/application";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutosave, type AutosaveHandle } from "@/features/score-library";
import { scoreStore } from "@/store/score-store";
import { createPitch } from "@/domain/music-theory";
import { MemoryScoreRepository } from "../fixtures/memory-repository";
import { fourNoteScore } from "../fixtures/scores";

// DOM 없이 기존 훅의 effect/타이머와 상태 전이를 검사한다. React 렌더 검증은 E2E가 담당한다.
const hooks = vi.hoisted(() => ({ status: "idle", setup: undefined as undefined | (() => void | (() => void)) }));
vi.mock("react", () => ({
  useEffect: (setup: () => void | (() => void)) => { hooks.setup = setup; },
  useState: (initial: string) => { hooks.status = initial; return [initial, (value: string) => { hooks.status = value; }]; },
  useRef: (initial: unknown) => ({ current: initial }),
}));

let cleanup: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); scoreStore.init(fourNoteScore()); });
afterEach(async () => {
  cleanup?.(); cleanup = undefined;
  await Promise.resolve();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

function AutosaveHarness({ repository, control, initiallySaved }: { repository: ScoreRepository; control: { current: AutosaveHandle | null }; initiallySaved: boolean }) {
  useAutosave(repository, 400, control, initiallySaved);
  return null;
}

function mount(repository: ScoreRepository, initiallySaved = false) {
  const control = { current: null as AutosaveHandle | null };
  AutosaveHarness({ repository, control, initiallySaved });
  const result = hooks.setup?.();
  if (typeof result !== "function") throw new Error("autosave effect missing");
  cleanup = result;
  return control.current!;
}

function changePitch() {
  expect(scoreStore.dispatch({ type: "UpdateNote", partId: "score-1:part:1", noteId: "n1",
    patch: { pitch: createPitch("C", 1, 4) } })?.ok).toBe(true);
}

function resize() {
  expect(scoreStore.dispatch({ type: "ResizeNote", partId: "score-1:part:1", noteId: "n1", durationTicks: 1920 })?.ok).toBe(true);
}

it("invalidates saved immediately and only reports saved after the latest pitch/length is persisted", async () => {
  const repository = new MemoryScoreRepository();
  mount(repository);
  resize();
  await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("saved");
  changePitch();
  expect(hooks.status).toBe("saving");
  await vi.advanceTimersByTimeAsync(399);
  expect(hooks.status).toBe("saving");
  expect((await repository.load("score-1"))!.parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 60 } });
  await vi.advanceTimersByTimeAsync(1);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
  expect((await repository.load("score-1"))!.parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 61 }, durationTicks: 1920 });
});

it("does not report an older in-flight write as the latest saved edit", async () => {
  const repository = new MemoryScoreRepository();
  const originalSave = repository.save.bind(repository);
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => { complete = resolve; });
  vi.spyOn(repository, "save").mockImplementationOnce(async (score) => { await gate; await originalSave(score); });
  mount(repository);
  changePitch();
  await vi.advanceTimersByTimeAsync(400);
  resize();
  complete();
  await vi.advanceTimersByTimeAsync(0);
  expect(hooks.status).toBe("saving");
  await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("returns to saved without a redundant write when undo restores the saved content", async () => {
  const repository = new MemoryScoreRepository();
  const save = vi.spyOn(repository, "save");
  mount(repository);
  changePitch();
  await vi.advanceTimersByTimeAsync(400);
  resize();
  scoreStore.undo();
  await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("saved");
  expect(save).toHaveBeenCalledTimes(1);
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("reports a failed save as error", async () => {
  const repository = new MemoryScoreRepository();
  vi.spyOn(repository, "save").mockRejectedValue(new Error("quota"));
  mount(repository);
  changePitch();
  await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("error");
});

it("debounces continuous edits and persists the final canonical snapshot", async () => {
  const repository = new MemoryScoreRepository();
  const save = vi.spyOn(repository, "save"); mount(repository);
  for (const tempoBpm of [60, 90, 120, 150, 180]) {
    scoreStore.dispatch({ type: "SetTempo", tempoBpm, updatedAt: "2026-11-08T02:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(100);
    expect(hooks.status).toBe("saving");
  }
  await vi.advanceTimersByTimeAsync(300);
  expect(save).toHaveBeenCalledTimes(1);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("a slow earlier write cannot overwrite the last edit when saves overlap", async () => {
  const repository = new MemoryScoreRepository();
  const original = repository.save.bind(repository);
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => { complete = resolve; });
  vi.spyOn(repository, "save").mockImplementationOnce(async (score) => { await gate; await original(score); });
  mount(repository);
  changePitch(); await vi.advanceTimersByTimeAsync(400);
  resize(); await vi.advanceTimersByTimeAsync(400);
  complete(); await vi.advanceTimersByTimeAsync(0);
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
  expect(hooks.status).toBe("saved");
});

it("autosaves the last continuous edit and reopens identical content from IndexedDB", async () => {
  vi.useRealTimers();
  const dbName = "autosave-last-edit";
  const repository = createIndexedDbScoreRepository({ dbName });
  mount(repository);
  changePitch(); resize();
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: "2026-11-08T02:00:00.000Z" });
  await vi.waitFor(() => expect(hooks.status).toBe("saved"));
  const reopened = createIndexedDbScoreRepository({ dbName });
  expect(await reopened.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("cleanup queues the final edit after a slow in-flight save", async () => {
  const repository = new MemoryScoreRepository();
  const original = repository.save.bind(repository);
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => { complete = resolve; });
  vi.spyOn(repository, "save").mockImplementationOnce(async (score) => { await gate; await original(score); });
  mount(repository);
  changePitch(); await vi.advanceTimersByTimeAsync(400);
  resize();
  const final = scoreStore.getState()!.current;
  cleanup?.(); cleanup = undefined;
  complete(); await vi.advanceTimersByTimeAsync(0);
  expect(await repository.load("score-1")).toEqual(final);
});

it("a failed write does not block the next queued snapshot", async () => {
  const repository = new MemoryScoreRepository();
  vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("temporary"));
  mount(repository);
  changePitch(); await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("error");
  resize(); await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("navigation must observe the latest renamed score rather than the pre-cleanup list snapshot", async () => {
  vi.useRealTimers();
  const repository = createIndexedDbScoreRepository({ dbName: "autosave-navigation-race" });
  await repository.save(scoreStore.getState()!.current);
  const autosave = mount(repository);
  scoreStore.dispatch({ type: "RenameScore", title: "백업 연습곡", updatedAt: "2026-11-08T03:00:00.000Z" });
  scoreStore.undo(); scoreStore.redo();
  expect(await autosave.flush()).toBe(true);
  cleanup?.(); cleanup = undefined;
  const list = await repository.list();
  expect(list[0]).toMatchObject({ id: "score-1", title: "백업 연습곡" });
  expect(await createIndexedDbScoreRepository({ dbName: "autosave-navigation-race" }).load("score-1"))
    .toEqual(scoreStore.getState()!.current);
});

it("explicit flush bypasses debounce and includes edits made during a pending write", async () => {
  const repository = new MemoryScoreRepository();
  const original = repository.save.bind(repository);
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => { complete = resolve; });
  vi.spyOn(repository, "save").mockImplementationOnce(async (score) => { await gate; await original(score); });
  const autosave = mount(repository);
  changePitch();
  const flush = autosave.flush();
  await vi.advanceTimersByTimeAsync(0);
  resize();
  complete();
  expect(await flush).toBe(true);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("explicit flush reports failure, preserves the session and can be retried", async () => {
  const repository = new MemoryScoreRepository();
  const autosave = mount(repository);
  changePitch(); const edited = scoreStore.getState();
  vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("quota"));
  expect(await autosave.flush()).toBe(false);
  expect(hooks.status).toBe("error");
  expect(scoreStore.getState()).toBe(edited);
  expect(await repository.load("score-1")).toBeNull();
  expect(await autosave.flush()).toBe(true);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(edited!.current);
});

it("a successfully loaded baseline is not automatically rewritten on flush or cleanup", async () => {
  const repository = new MemoryScoreRepository();
  const save = vi.spyOn(repository, "save");
  const autosave = mount(repository, true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await autosave.flush()).toBe(true);
  cleanup?.(); cleanup = undefined;
  await vi.advanceTimersByTimeAsync(0);
  expect(save).not.toHaveBeenCalled();
});

it("edits after a loaded baseline still save and support undo/redo", async () => {
  const repository = new MemoryScoreRepository();
  await repository.save(scoreStore.getState()!.current);
  mount(repository, true);
  changePitch(); await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("saved");
  scoreStore.undo(); await vi.advanceTimersByTimeAsync(400);
  expect((await repository.load("score-1"))!.parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 60 } });
  scoreStore.redo(); await vi.advanceTimersByTimeAsync(400);
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});
