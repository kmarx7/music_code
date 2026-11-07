import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutosave } from "@/features/score-library";
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

function AutosaveHarness({ repository }: { repository: MemoryScoreRepository }) {
  useAutosave(repository, 400);
  return null;
}

function mount(repository: MemoryScoreRepository) {
  AutosaveHarness({ repository });
  const result = hooks.setup?.();
  if (typeof result !== "function") throw new Error("autosave effect missing");
  cleanup = result;
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
