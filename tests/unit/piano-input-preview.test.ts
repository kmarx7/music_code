import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { Pitch } from "@/domain/score";
import { PianoKeyboard } from "@/features/piano-input";

const mock = vi.hoisted(() => ({ play: vi.fn(), prepare: vi.fn(), stop: vi.fn(), dispose: vi.fn(),
  effects: [] as (() => void | (() => void))[], values: [] as unknown[] }));
vi.mock("@/adapters/tone/pianoPreview", () => ({ createPianoPreview: () => ({ play: mock.play, prepare: mock.prepare, stop: mock.stop, dispose: mock.dispose }) }));
// Event handlers and lifecycle are exercised without introducing a DOM-test dependency.
// Native pointer/touch/accessibility behavior is covered by Playwright.
vi.mock("react", () => ({
  useEffect: (setup: () => void | (() => void)) => { mock.effects.push(setup); },
  useMemo: (compute: () => unknown) => compute(), useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => { const index = mock.values.push(initial) - 1; return [initial, (value: unknown) => { mock.values[index] = value; }]; },
}));

type Element = ReactElement<{ children?: unknown; [key: string]: unknown }>;
let tree: Element;
let cleanup: (() => void)[];
let browser: EventTarget;
let documentTarget: EventTarget & { hidden: boolean };
let onPitch = vi.fn<(pitch: Pitch) => void>();
function find(predicate: (element: Element) => boolean, node: unknown = tree): Element {
  if (Array.isArray(node)) { for (const child of node) { const found = findMaybe(predicate, child); if (found) return found; } }
  else if (node && typeof node === "object" && "props" in node) {
    const element = node as Element;
    if (predicate(element)) return element;
    const found = findMaybe(predicate, element.props.children); if (found) return found;
  }
  throw new Error("element not found");
}
function findMaybe(predicate: (element: Element) => boolean, node: unknown): Element | undefined { try { return find(predicate, node); } catch { return undefined; } }
function key(midi = 60) { return find((element) => element.props["aria-label"] === `MIDI ${midi}`); }
function emit(element: Element, name: string, event: Record<string, unknown>) { (element.props[name] as (event: unknown) => void)(event); }
function keyboard(key: string, repeat = false) {
  const event = new Event("keydown", { cancelable: true }); Object.assign(event, { key, repeat }); browser.dispatchEvent(event);
}
beforeEach(() => {
  mock.effects.length = 0; mock.values.length = 0;
  mock.play.mockReset().mockResolvedValue(true); mock.prepare.mockReset().mockResolvedValue(undefined); mock.stop.mockReset(); mock.dispose.mockReset();
  browser = new EventTarget(); documentTarget = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", browser); vi.stubGlobal("document", documentTarget);
  onPitch = vi.fn<(pitch: Pitch) => void>(); tree = PianoKeyboard({ onPitch });
  cleanup = mock.effects.map((setup) => setup()).filter((value): value is () => void => typeof value === "function");
});
afterEach(() => { cleanup.forEach((dispose) => dispose()); vi.unstubAllGlobals(); });

it("pointer/touch press auditions immediately and its compatibility click inserts exactly one note", async () => {
  emit(key(), "onPointerDown", { button: 0, pointerId: 10 });
  expect(mock.play).toHaveBeenCalledWith(60); expect(onPitch).not.toHaveBeenCalled();
  await Promise.resolve(); // Native click follows pointerdown after its microtask checkpoint.
  emit(key(), "onClick", { detail: 1 });
  expect(mock.play).toHaveBeenCalledTimes(1); expect(onPitch).toHaveBeenCalledTimes(1);
  expect(onPitch.mock.calls[0][0]).toMatchObject({ midi: 60 });
});
it("keyboard/assistive activation inserts and auditions once", () => {
  emit(key(61), "onClick", { detail: 0 });
  expect(onPitch).toHaveBeenCalledTimes(1); expect(mock.play).toHaveBeenCalledWith(61);
});
it("computer keys audition while repeat events do not multiply entries", () => {
  keyboard("a"); keyboard("a", true); keyboard("s");
  expect(onPitch.mock.calls.map((call) => call[0].midi)).toEqual([60, 62]);
  expect(mock.play.mock.calls.map((call) => call[0])).toEqual([60, 62]);
});
it("separate presses of the same key each insert and audition without being treated as held-key repeat", () => {
  keyboard("a"); keyboard("a"); keyboard("a", true); keyboard("a");
  expect(onPitch.mock.calls.map(([pitch]) => pitch.midi)).toEqual([60, 60, 60]);
  expect(mock.play.mock.calls.map(([midi]) => midi)).toEqual([60, 60, 60]);
});
it("muting cancels preview only and leaves note input active", () => {
  const toggle = find((element) => element.props["aria-label"] === "입력 소리 미리듣기");
  emit(toggle, "onChange", { target: { checked: false } });
  emit(key(), "onPointerDown", { button: 0, pointerId: 1 }); emit(key(), "onClick", { detail: 1 }); keyboard("s");
  expect(mock.stop).toHaveBeenCalledTimes(1); expect(mock.play).not.toHaveBeenCalled(); expect(onPitch).toHaveBeenCalledTimes(2);
  emit(toggle, "onChange", { target: { checked: true } });
  expect(mock.play).not.toHaveBeenCalled(); keyboard("d"); expect(mock.play).toHaveBeenCalledWith(64);
});
it("a preview failure never blocks insertion and gives a separate retry message", async () => {
  mock.play.mockRejectedValue(new Error("audio blocked"));
  emit(key(), "onPointerDown", { button: 0, pointerId: 1 }); emit(key(), "onClick", { detail: 1 });
  await Promise.resolve(); await Promise.resolve();
  expect(onPitch).toHaveBeenCalledTimes(1); expect(mock.values[1]).toContain("음표 입력과 저장은 계속됩니다");
  mock.play.mockResolvedValue(true); keyboard("s"); await Promise.resolve(); expect(mock.values[1]).toBe("");
});
it("an older finger's cancellation cannot stop a newer pointer's preview", () => {
  emit(key(), "onPointerDown", { button: 0, pointerId: 1 });
  emit(key(62), "onPointerDown", { button: 0, pointerId: 2 });
  emit(key(), "onPointerCancel", { pointerId: 1 }); expect(mock.stop).not.toHaveBeenCalled();
  emit(key(62), "onPointerCancel", { pointerId: 2 }); expect(mock.stop).toHaveBeenCalledTimes(1);
  expect(onPitch).not.toHaveBeenCalled(); // A cancelled touch scroll never commits a note.
});
it("blur/hidden and unmount release preview and invalidate a pending error", async () => {
  let reject!: (error: Error) => void;
  mock.play.mockImplementationOnce(() => new Promise((_, failure) => { reject = failure; }));
  keyboard("a"); browser.dispatchEvent(new Event("blur"));
  documentTarget.hidden = true; documentTarget.dispatchEvent(new Event("visibilitychange"));
  expect(mock.stop).toHaveBeenCalledTimes(2);
  cleanup.forEach((dispose) => dispose()); cleanup = [];
  reject(new Error("late failure")); await Promise.resolve(); await Promise.resolve();
  expect(mock.dispose).toHaveBeenCalledTimes(1); expect(mock.values[1]).toBe("");
});
it("right click does not audition and initial preparation does not insert notes", () => {
  expect(mock.prepare).toHaveBeenCalledTimes(1); expect(onPitch).not.toHaveBeenCalled();
  emit(key(), "onPointerDown", { button: 2, pointerId: 1 }); expect(mock.play).not.toHaveBeenCalled();
});

it("a blocked pointer activation retries within the click gesture without duplicating the note", async () => {
  mock.play.mockRejectedValueOnce(new Error("touch requires click"));
  emit(key(), "onPointerDown", { button: 0, pointerId: 7 });
  await Promise.resolve(); await Promise.resolve();
  emit(key(), "onClick", { detail: 1 });
  await Promise.resolve();
  expect(mock.play).toHaveBeenCalledTimes(2);
  expect(onPitch).toHaveBeenCalledTimes(1);
  expect(mock.values[1]).toBe("");
});
