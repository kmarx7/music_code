import { persist } from "../fixtures/persist";
import "fake-indexeddb/auto";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import type { ScoreRepository } from "@/application";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutosave, type AutosaveHandle } from "@/features/score-library";
import { scoreStore } from "@/store/score-store";
import { NoteLabelsControl } from "@/features/score-editor";
import { ScoreConflictError } from "@/application/ports";
import type { NoteLabelMode } from "@/domain/music-theory";
import { analyzeScoreRange, recommendTranspositions } from "@/domain/score";
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

async function mount(repository: ScoreRepository, initiallySaved = false) {
  if (!await repository.read("score-1")) await repository.create(scoreStore.getState()!.current);
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
  await mount(repository);
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
  vi.spyOn(repository, "save").mockImplementationOnce(async (score, revision) => { await gate; return originalSave(score, revision); });
  await mount(repository);
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
  await mount(repository);
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
  await mount(repository);
  changePitch();
  await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("error");
});

it("debounces continuous edits and persists the final canonical snapshot", async () => {
  const repository = new MemoryScoreRepository();
  const save = vi.spyOn(repository, "save"); await mount(repository);
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
  vi.spyOn(repository, "save").mockImplementationOnce(async (score, revision) => { await gate; return original(score, revision); });
  await mount(repository);
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
  await mount(repository);
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
  vi.spyOn(repository, "save").mockImplementationOnce(async (score, revision) => { await gate; return original(score, revision); });
  await mount(repository);
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
  await mount(repository);
  changePitch(); await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("error");
  resize(); await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("navigation must observe the latest renamed score rather than the pre-cleanup list snapshot", async () => {
  vi.useRealTimers();
  const repository = createIndexedDbScoreRepository({ dbName: "autosave-navigation-race" });
  await persist(repository, scoreStore.getState()!.current);
  const autosave = await mount(repository);
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
  vi.spyOn(repository, "save").mockImplementationOnce(async (score, revision) => { await gate; return original(score, revision); });
  const autosave = await mount(repository);
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
  const autosave = await mount(repository);
  changePitch(); const edited = scoreStore.getState();
  vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("quota"));
  expect(await autosave.flush()).toBe(false);
  expect(hooks.status).toBe("error");
  expect(scoreStore.getState()).toBe(edited);
  expect(await repository.load("score-1")).toEqual(fourNoteScore());
  expect(await autosave.flush()).toBe(true);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(edited!.current);
});

it("a successfully loaded baseline is not automatically rewritten on flush or cleanup", async () => {
  const repository = new MemoryScoreRepository();
  const save = vi.spyOn(repository, "save");
  const autosave = await mount(repository, true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await autosave.flush()).toBe(true);
  cleanup?.(); cleanup = undefined;
  await vi.advanceTimersByTimeAsync(0);
  expect(save).not.toHaveBeenCalled();
});

it("edits after a loaded baseline still save and support undo/redo", async () => {
  const repository = new MemoryScoreRepository();
  await persist(repository, scoreStore.getState()!.current);
  await mount(repository, true);
  changePitch(); await vi.advanceTimersByTimeAsync(400);
  expect(hooks.status).toBe("saved");
  scoreStore.undo(); await vi.advanceTimersByTimeAsync(400);
  expect((await repository.load("score-1"))!.parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 60 } });
  scoreStore.redo(); await vi.advanceTimersByTimeAsync(400);
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("concurrent manual/navigation flushes share one promise and bypass the debounce", async () => {
  const repository = new MemoryScoreRepository();
  const original = repository.save.bind(repository);
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => { complete = resolve; });
  const save = vi.spyOn(repository, "save").mockImplementationOnce(async (score, revision) => { await gate; return original(score, revision); });
  const autosave = await mount(repository);
  changePitch();
  const first = autosave.flush(); const second = autosave.flush();
  expect(second).toBe(first);
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(1);
  complete(); expect(await first).toBe(true); expect(await second).toBe(true);
  await vi.advanceTimersByTimeAsync(400);
  expect(save).toHaveBeenCalledTimes(1);
  expect(hooks.status).toBe("saved");
});

it("manual save joins an automatic write, includes further edits and never reports the old snapshot as latest", async () => {
  const repository = new MemoryScoreRepository(); const original = repository.save.bind(repository);
  const releases: (() => void)[] = []; let active = 0; let maximum = 0;
  const save = vi.spyOn(repository, "save").mockImplementation(async (score, revision) => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    const result = await original(score, revision); active -= 1; return result;
  });
  const autosave = await mount(repository);
  changePitch(); await vi.advanceTimersByTimeAsync(400); // First automatic write waits.
  const manual = autosave.flush();
  resize(); await vi.advanceTimersByTimeAsync(400); // Queued autosave for the latest edit.
  expect(save).toHaveBeenCalledTimes(1);
  releases[0](); await vi.advanceTimersByTimeAsync(0);
  expect(hooks.status).toBe("saving");
  expect(save).toHaveBeenCalledTimes(2);
  releases[1](); expect(await manual).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2); expect(maximum).toBe(1);
  expect(hooks.status).toBe("saved");
  expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
});

it("manual save failure preserves the previous raw IndexedDB record and history, then retries the latest edit", async () => {
  vi.useRealTimers();
  const dbName = "manual-save-atomic-failure";
  const repository = createIndexedDbScoreRepository({ dbName });
  const baseline = scoreStore.getState()!.current; await persist(repository, baseline);
  async function raw() {
    const request = indexedDB.open(dbName);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("scores", "readonly").objectStore("scores").get(baseline.id);
      return await new Promise<unknown>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    } finally { db.close(); }
  }
  const before = await raw(); const autosave = await mount(repository, true);
  changePitch(); resize(); const edited = scoreStore.getState()!;
  const put = IDBObjectStore.prototype.put;
  const abort = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = put.apply(this, args);
    request.addEventListener("success", () => request.transaction!.abort());
    return request;
  });
  expect(await autosave.flush()).toBe(false);
  expect(hooks.status).toBe("error"); expect(scoreStore.getState()).toBe(edited);
  expect(await raw()).toEqual(before);
  expect(await repository.load(baseline.id)).toEqual(baseline);
  abort.mockRestore();
  expect(await autosave.flush()).toBe(true);
  expect(hooks.status).toBe("saved"); expect(scoreStore.getState()).toBe(edited);
  expect(await createIndexedDbScoreRepository({ dbName }).load(baseline.id)).toEqual(edited.current);
});

it("a no-op manual save checks the actual revision and blocks stale sessions without changing history", async () => {
  const repository = new MemoryScoreRepository();
  const control = await mount(repository, true);
  const baseline = scoreStore.getState();
  await repository.save({ ...baseline!.current, title: "other tab" }, 1);
  const save = vi.spyOn(repository, "save");
  expect(await control.flush()).toBe(false); expect(hooks.status).toBe("conflict");
  expect(scoreStore.getState()).toBe(baseline);
  changePitch(); const edited = scoreStore.getState();
  await vi.advanceTimersByTimeAsync(1000); expect(await control.flush()).toBe(false);
  cleanup?.(); cleanup = undefined; await vi.advanceTimersByTimeAsync(0);
  expect(save).not.toHaveBeenCalled(); expect(scoreStore.getState()).toBe(edited);
  expect(await repository.load("score-1")).toMatchObject({ title: "other tab" });
  scoreStore.undo(); expect(scoreStore.getState()!.current).toEqual(baseline!.current);
});

it("deletion without any notification still stops manual/autosave/cleanup and preserves memory", async () => {
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  await repository.delete("score-1", 1); changePitch(); const state = scoreStore.getState();
  expect(await control.flush()).toBe(false); expect(hooks.status).toBe("deleted");
  const save = vi.spyOn(repository, "save"); resize();
  await vi.advanceTimersByTimeAsync(500); expect(await control.flush()).toBe(false);
  expect(save).not.toHaveBeenCalled(); expect(scoreStore.getState()!.past).toContainEqual(state!.current);
  await expect(repository.load("score-1")).rejects.toMatchObject({ code: "DELETED" });
});

it("late and duplicate notifications only recheck DB; payload revisions never advance the baseline", async () => {
  const repository = new MemoryScoreRepository();
  let receive!: (change: import("@/application").ScoreChange) => void;
  repository.subscribe = (listener) => { receive = listener; return () => {}; };
  const control = await mount(repository, true);
  const read = vi.spyOn(repository, "read");
  receive({ id: "score-1", revision: 999, kind: "deleted" });
  receive({ id: "score-1", revision: 0, kind: "saved" });
  await vi.advanceTimersByTimeAsync(0);
  expect(hooks.status).toBe("idle"); expect(read).toHaveBeenCalledTimes(2);
  changePitch(); expect(await control.flush()).toBe(true); // expectedRevision remains 1, not 999
  await repository.save({ ...scoreStore.getState()!.current, title: "external" }, 2);
  receive({ id: "score-1", revision: 1, kind: "saved" });
  await vi.advanceTimersByTimeAsync(0); expect(hooks.status).toBe("conflict");
});

it("dirty-only beforeunload, hidden early save and focus/pageshow revalidation share the same queue", async () => {
  const windowEvents = new EventTarget(); const documentEvents = new EventTarget();
  const add = vi.spyOn(windowEvents, "addEventListener"); const remove = vi.spyOn(windowEvents, "removeEventListener");
  const mockDocument = Object.assign(documentEvents, { visibilityState: "visible" });
  vi.stubGlobal("window", windowEvents); vi.stubGlobal("document", mockDocument);
  try {
    const repository = new MemoryScoreRepository(); await mount(repository, true);
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
    changePitch();
    const event = new Event("beforeunload", { cancelable: true });
    Object.defineProperty(event, "returnValue", { value: "", writable: true }); windowEvents.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    mockDocument.visibilityState = "hidden"; documentEvents.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(hooks.status).toBe("saved"); expect(await repository.load("score-1")).toEqual(scoreStore.getState()!.current);
    expect(remove.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
    const cleanEvent = new Event("beforeunload", { cancelable: true }); windowEvents.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
    await repository.save({ ...scoreStore.getState()!.current, title: "other" }, 2);
    windowEvents.dispatchEvent(new Event("pageshow")); windowEvents.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0); expect(hooks.status).toBe("conflict");
    cleanup?.(); cleanup = undefined;
  } finally { vi.unstubAllGlobals(); }
});

it("a conflicted tied score keeps its current content, tie links and undo/redo history", async () => {
  const { tiedScore } = await import("../fixtures/scores");
  const initial = { ...tiedScore(), id: "score-1" }; scoreStore.init(initial);
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: initial.updatedAt });
  const memory = scoreStore.getState();
  await repository.save({ ...initial, title: "other" }, 1);
  expect(await control.flush()).toBe(false); expect(scoreStore.getState()).toBe(memory);
  expect(hooks.status).toBe("conflict");
  scoreStore.undo(); expect(scoreStore.getState()!.current).toEqual(initial);
  scoreStore.redo(); expect(scoreStore.getState()!.current).toBe(memory!.current);
  expect(scoreStore.getState()!.current.parts[0].ties).toEqual(initial.parts[0].ties);
  expect(await control.flush()).toBe(false);
  expect(await repository.load(initial.id)).toMatchObject({ title: "other", tempoBpm: initial.tempoBpm });
});

// Phase 2-2: call the existing dispatch/autosave boundary, without adding a UI or storage path.
const transposeTime = "2026-11-08T06:00:00.000Z";
const transposeCommand = { type: "TransposeScore", spec: { kind: "semitones", semitones: 2 }, updatedAt: transposeTime } as const;
const noopTranspose = { ...transposeCommand, spec: { kind: "semitones", semitones: 0 }, updatedAt: "2026-11-08T07:00:00.000Z" } as const;
const invalidTranspose = { ...transposeCommand, spec: { kind: "semitones", semitones: NaN } } as const;
async function transposeRawRecord(dbName: string) {
  const request = indexedDB.open(dbName);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const read = db.transaction("scores", "readonly").objectStore("scores").get("score-1");
    return await new Promise<unknown>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
  } finally { db.close(); }
}

it("TransposeScore dispatch uses existing autosave, snapshot undo/redo and committed revisions", async () => {
  vi.useRealTimers(); const repository = createIndexedDbScoreRepository({ dbName: "transpose-command-save" });
  const baseline = scoreStore.getState()!.current; const control = await mount(repository, true);
  expect((await repository.read("score-1"))!.revision).toBe(1);
  const save = vi.spyOn(repository, "save");
  expect(scoreStore.dispatch(transposeCommand)?.ok).toBe(true); expect(hooks.status).toBe("saving");
  const changed = scoreStore.getState()!.current;
  expect(changed.updatedAt).toBe(transposeTime); expect(save).not.toHaveBeenCalled();
  expect(await control.flush()).toBe(true); expect(hooks.status).toBe("saved");
  expect(await repository.read("score-1")).toEqual({ score: changed, revision: 2 });
  scoreStore.undo(); expect(scoreStore.getState()!.current).toBe(baseline);
  expect(await control.flush()).toBe(true); expect(await repository.read("score-1")).toEqual({ score: baseline, revision: 3 });
  scoreStore.redo(); expect(scoreStore.getState()!.current).toBe(changed);
  expect(await control.flush()).toBe(true);
  expect(await createIndexedDbScoreRepository({ dbName: "transpose-command-save" }).read("score-1")).toEqual({ score: changed, revision: 4 });
});

it("transpose no-op/failure preserve saved state, redo, raw record and revision without a write", async () => {
  vi.useRealTimers(); const dbName = "transpose-command-noop";
  const repository = createIndexedDbScoreRepository({ dbName }); const control = await mount(repository, true);
  scoreStore.dispatch(transposeCommand); expect(await control.flush()).toBe(true);
  scoreStore.undo(); expect(await control.flush()).toBe(true);
  const state = scoreStore.getState(); const raw = await transposeRawRecord(dbName); const stored = await repository.read("score-1");
  const save = vi.spyOn(repository, "save"); const notify = vi.fn(); const unsubscribe = scoreStore.subscribe(notify);
  try {
    expect(scoreStore.dispatch(noopTranspose)?.ok).toBe(true); expect(scoreStore.dispatch(invalidTranspose)?.ok).toBe(false);
    expect(scoreStore.getState()).toBe(state); expect(hooks.status).toBe("saved"); expect(notify).not.toHaveBeenCalled();
    expect(await control.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled(); expect(await repository.read("score-1")).toEqual(stored);
    expect(await transposeRawRecord(dbName)).toEqual(raw);
    expect(scoreStore.getState()!.future).toHaveLength(1);
  } finally { unsubscribe(); }
});

it("transpose no-op/failure leave the existing dirty debounce deadline unchanged", async () => {
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  const save = vi.spyOn(repository, "save");
  scoreStore.dispatch(transposeCommand); await vi.advanceTimersByTimeAsync(200);
  const state = scoreStore.getState();
  scoreStore.dispatch(noopTranspose); scoreStore.dispatch(invalidTranspose);
  expect(scoreStore.getState()).toBe(state); expect(hooks.status).toBe("saving");
  await vi.advanceTimersByTimeAsync(199); expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(save).toHaveBeenCalledTimes(1); expect(hooks.status).toBe("saved");
  expect(await control.flush()).toBe(true); expect((await repository.read("score-1"))!.revision).toBe(2);
});

it("transpose no-op/failure do not clear an existing save error or trigger a retry", async () => {
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  const save = vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("quota"));
  scoreStore.dispatch(transposeCommand); expect(await control.flush()).toBe(false); expect(hooks.status).toBe("error");
  const state = scoreStore.getState(); scoreStore.dispatch(noopTranspose); scoreStore.dispatch(invalidTranspose);
  await vi.advanceTimersByTimeAsync(1000);
  expect(hooks.status).toBe("error"); expect(save).toHaveBeenCalledTimes(1); expect(scoreStore.getState()).toBe(state);
  expect((await repository.read("score-1"))!.revision).toBe(1);
  expect(await control.flush()).toBe(true); expect(hooks.status).toBe("saved");
  expect(await repository.read("score-1")).toEqual({ score: state!.current, revision: 2 });
});

it("a transposition cannot overwrite another writer and retains its own memory/undo snapshots on OCC conflict", async () => {
  vi.useRealTimers(); const dbName = "transpose-command-conflict";
  const repository = createIndexedDbScoreRepository({ dbName }); const control = await mount(repository, true);
  const baseline = scoreStore.getState()!.current;
  const other = createIndexedDbScoreRepository({ dbName });
  await other.save({ ...baseline, title: "other writer" }, 1); const raw = await transposeRawRecord(dbName);
  scoreStore.dispatch(transposeCommand); const memory = scoreStore.getState();
  expect(await control.flush()).toBe(false); expect(hooks.status).toBe("conflict"); expect(scoreStore.getState()).toBe(memory);
  scoreStore.dispatch(noopTranspose); scoreStore.dispatch(invalidTranspose); expect(scoreStore.getState()).toBe(memory);
  scoreStore.undo(); expect(scoreStore.getState()!.current).toBe(baseline); scoreStore.redo(); expect(scoreStore.getState()!.current).toBe(memory!.current);
  expect(await control.flush()).toBe(false); expect(hooks.status).toBe("conflict");
  expect(await transposeRawRecord(dbName)).toEqual(raw); expect((await other.read("score-1"))!.revision).toBe(2);
});

it("a transposition cannot recreate a tombstoned score, including after noop/failure/cleanup", async () => {
  vi.useRealTimers(); const dbName = "transpose-command-deleted";
  const repository = createIndexedDbScoreRepository({ dbName }); const control = await mount(repository, true);
  await createIndexedDbScoreRepository({ dbName }).delete("score-1", 1); const raw = await transposeRawRecord(dbName);
  scoreStore.dispatch(transposeCommand); const state = scoreStore.getState();
  expect(await control.flush()).toBe(false); expect(hooks.status).toBe("deleted"); expect(scoreStore.getState()).toBe(state);
  scoreStore.dispatch(noopTranspose); scoreStore.dispatch(invalidTranspose);
  expect(await control.flush()).toBe(false); cleanup?.(); cleanup = undefined; await Promise.resolve();
  expect(await transposeRawRecord(dbName)).toEqual(raw);
  await expect(repository.read("score-1")).rejects.toMatchObject({ code: "DELETED" });
});

it("an aborted transposition save preserves raw data/revision and the complete edit history", async () => {
  vi.useRealTimers(); const dbName = "transpose-command-abort";
  const repository = createIndexedDbScoreRepository({ dbName }); const control = await mount(repository, true);
  const raw = await transposeRawRecord(dbName); scoreStore.dispatch(transposeCommand); const state = scoreStore.getState();
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (this: IDBObjectStore, ...args) {
    const request = original.apply(this, args); request.addEventListener("success", () => request.transaction!.abort()); return request;
  });
  expect(await control.flush()).toBe(false); spy.mockRestore();
  expect(hooks.status).toBe("error"); expect(scoreStore.getState()).toBe(state); expect(await transposeRawRecord(dbName)).toEqual(raw);
  expect((await repository.read("score-1"))!.revision).toBe(1);
  expect(await control.flush()).toBe(true); expect(await repository.read("score-1")).toEqual({ score: state!.current, revision: 2 });
});

it("exposes a synchronous read-only revision/status snapshot without repository IO", async () => {
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  const read = vi.spyOn(repository, "read"); const save = vi.spyOn(repository, "save");
  expect(control.getSnapshot!()).toEqual({ revision: 1, status: "idle" });
  changePitch();
  expect(control.getSnapshot!()).toEqual({ revision: 1, status: "saving" });
  expect(read).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  expect(await control.flush()).toBe(true);
  expect(control.getSnapshot!()).toEqual({ revision: 2, status: "saved" });
  read.mockClear(); save.mockClear(); control.getSnapshot!(); control.getSnapshot!();
  expect(read).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});

it("snapshot retains revision after failure and exposes terminal conflict before React can render", async () => {
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("quota"));
  changePitch(); expect(await control.flush()).toBe(false);
  expect(control.getSnapshot!()).toEqual({ revision: 1, status: "error" });
  const other = { ...scoreStore.getState()!.current, title: "external" };
  await repository.save(other, 1);
  expect(await control.flush()).toBe(false);
  expect(control.getSnapshot!()).toEqual({ revision: 1, status: "conflict" });
  expect((await repository.read(other.id))!.score).toEqual(other);
});

it("label mode transitions do not notify the music store, dirty autosave, clear redo, change timestamps or write revision", async () => {
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: "changed" }); scoreStore.undo();
  expect(await control.flush()).toBe(true);
  const session = scoreStore.getState(); const stored = await repository.read("score-1"); const status = hooks.status;
  const save = vi.spyOn(repository, "save"); const read = vi.spyOn(repository, "read");
  const notify = vi.fn(); const unsubscribe = scoreStore.subscribe(notify);
  let mode: NoteLabelMode = "none";
  try {
    for (const value of ["letter", "fixed-do", "none"] as const) {
      const select = NoteLabelsControl({ mode, onChange: (value) => { mode = value; } }).props.children[1];
      select.props.onChange({ target: { value } });
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(mode).toBe("none"); expect(scoreStore.getState()).toBe(session); expect(session!.future).toHaveLength(1);
    expect(hooks.status).toBe(status); expect(notify).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    expect(await repository.read("score-1")).toEqual(stored);
  } finally { unsubscribe(); }
});
it.each(["CONFLICT", "DELETED"] as const)("labels cannot clear %s or restart a blocked save", async (code) => {
  const repository = new MemoryScoreRepository(); const control = await mount(repository, true);
  const save = vi.spyOn(repository, "save").mockRejectedValueOnce(new ScoreConflictError(code));
  changePitch(); expect(await control.flush()).toBe(false); const before = scoreStore.getState(); const state = control.getSnapshot!();
  let mode: NoteLabelMode = "none";
  NoteLabelsControl({ mode, onChange: (value) => { mode = value; } }).props.children[1].props.onChange({ target: { value: "fixed-do" } });
  await vi.advanceTimersByTimeAsync(1000);
  expect(mode).toBe("fixed-do"); expect(control.getSnapshot!()).toEqual(state); expect(scoreStore.getState()).toBe(before);
  expect(save).toHaveBeenCalledTimes(1);
});

it("range analysis/recommendations preserve saved raw data, revision, redo and autosave without repository IO", async () => {
  vi.useRealTimers(); const name = "range-recommendations-readonly"; const repository = createIndexedDbScoreRepository({ dbName: name }); const control = await mount(repository, true);
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: "changed" }); scoreStore.undo(); expect(await control.flush()).toBe(true);
  const before = scoreStore.getState(); const raw = await transposeRawRecord(name); const snapshot = control.getSnapshot!();
  const save = vi.spyOn(repository, "save"); const read = vi.spyOn(repository, "read"); const notify = vi.fn(); const unsubscribe = scoreStore.subscribe(notify);
  try {
    expect(analyzeScoreRange(before!.current).minMidi).toBe(60);
    const result = recommendTranspositions(before!.current, { minMidi: 84, maxMidi: 91 }); expect(result.ok).toBe(true);
    expect(scoreStore.getState()).toBe(before); expect(before!.future).toHaveLength(1); expect(control.getSnapshot!()).toEqual(snapshot);
    expect(notify).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(await transposeRawRecord(name)).toEqual(raw);
  } finally { unsubscribe(); }
});
