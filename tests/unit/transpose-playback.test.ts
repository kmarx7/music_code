import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { PlaybackControls } from "@/features/playback";
import { fourNoteScore } from "../fixtures/scores";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], state: 0, ref: 0,
  deps: [] as unknown[], cleanup: undefined as undefined | (() => void) }));
const audio = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/adapters/tone/playback", () => ({ playScore: audio.play }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.state++; if (index >= hooks.values.length) hooks.values.push(initial);
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useRef: (initial: unknown) => { const index = hooks.ref++; return hooks.refs[index] ??= { current: initial }; },
  useEffect: (setup: () => () => void, deps: unknown[]) => {
    if (deps.some((value, i) => value !== hooks.deps[i])) { hooks.cleanup?.(); hooks.cleanup = setup(); hooks.deps = deps; }
  },
}));
type Element = ReactElement<{ children?: unknown; [key: string]: unknown }>;
const score = fourNoteScore(); const onPosition = vi.fn();
let tree: Element;
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element; return [element, ...nodes(element.props.children)];
}
function render(stopSignal = 0) { hooks.state = hooks.ref = 0; tree = PlaybackControls({ score, onPosition, stopSignal }); }
function find(name: string) { return nodes(tree).find((element) => element.props.children === name)!; }
function click(element: Element) { return (element.props.onClick as () => Promise<void>)(); }
function handle() { return { stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), setMetronome: vi.fn() }; }
beforeEach(() => {
  hooks.values.length = hooks.refs.length = hooks.deps.length = 0; hooks.cleanup = undefined;
  audio.play.mockReset(); onPosition.mockClear(); render();
});
afterEach(() => { hooks.cleanup?.(); hooks.cleanup = undefined; });

it("preview-open stop signal stops original playback without changing the metronome preference or Score", async () => {
  const original = JSON.stringify(score); const next = handle(); audio.play.mockResolvedValue(next);
  const checkbox = nodes(tree).find((element) => element.type === "input")!;
  (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } }); render();
  await click(find("Play")); render(); expect(find("Stop")).toBeDefined();
  render(1); render(1);
  expect(next.stop).toHaveBeenCalledTimes(1); expect(find("Play")).toBeDefined();
  expect(nodes(tree).find((element) => element.type === "input")!.props.checked).toBe(true);
  expect(onPosition).toHaveBeenLastCalledWith({ tick: 0, measure: 1, beat: 1, activeNoteIds: [] });
  expect(JSON.stringify(score)).toBe(original);
});
it("preview-open invalidates an in-flight audio initialization and stops its late result", async () => {
  let resolve!: (value: ReturnType<typeof handle>) => void;
  audio.play.mockReturnValue(new Promise((done) => { resolve = done; }));
  const pending = click(find("Play")); render(1); const late = handle(); resolve(late); await pending; render(1);
  expect(late.stop).toHaveBeenCalledTimes(1); expect(late.setMetronome).not.toHaveBeenCalled(); expect(find("Play")).toBeDefined();
});
