import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { RangeRecommendations, RangeSummary } from "@/features/transposition/RangeRecommendations";
import { analyzeScoreRange } from "@/domain/score";
import { scoreStore } from "@/store/score-store";
import { baseScore, fourNoteScore } from "../fixtures/scores";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], state: 0, ref: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => { const index = hooks.state++; if (index >= hooks.values.length) hooks.values.push(initial); return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }]; },
  useRef: (initial: unknown) => { const index = hooks.ref++; return hooks.refs[index] ??= { current: initial }; },
  useMemo: (compute: () => unknown) => compute(),
}));
type Element = ReactElement<{ children?: unknown; [key: string]: unknown }>;
let tree: Element; let score = fourNoteScore(); let disabled = false;
const onPreview = vi.fn(); const onInvalidate = vi.fn();
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element; return [element, ...nodes(element.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node && typeof node === "object" && "props" in node) return text((node as Element).props.children);
  return typeof node === "number" || typeof node === "string" ? String(node) : "";
}
function find(predicate: (node: Element) => boolean) { const node = nodes(tree).find(predicate); if (!node) throw new Error("missing element"); return node; }
function render() { hooks.state = hooks.ref = 0; tree = RangeRecommendations({ score, disabled, onPreview, onInvalidate }); }
function change(name: string, value: string) { (find((node) => node.props["aria-label"] === name).props.onChange as (e: unknown) => void)({ target: { value } }); render(); }
function submit() { (find((node) => node.type === "form").props.onSubmit as (e: unknown) => void)({ preventDefault: vi.fn() }); render(); }
function previewButtons() { return nodes(tree).filter((node) => node.type === "button" && node.props.children === "후보 미리보기"); }
beforeEach(() => {
  hooks.values.length = hooks.refs.length = 0; onPreview.mockClear(); onInvalidate.mockClear(); disabled = false;
  score = fourNoteScore(); scoreStore.init(score); render();
});
it("shows correct whole-score summary and target MIDI names; calculating is read-only and selecting invokes only the supplied preview callback", () => {
  expect(text(RangeSummary({ analysis: analyzeScoreRange(score) }))).toContain("C4 (MIDI 60) ~ G4 (MIDI 67)");
  expect(text(tree)).toContain("C4"); const before = scoreStore.getState();
  change("목표 최저 MIDI", "62"); change("목표 최고 MIDI", "69"); expect(previewButtons()).toHaveLength(0);
  submit(); expect(text(tree)).toContain("전체 적합"); expect(text(tree)).toContain("D 장조"); expect(text(tree)).toContain("+2반음");
  expect(previewButtons().length).toBeGreaterThan(0); expect(onPreview).not.toHaveBeenCalled(); expect(scoreStore.getState()).toBe(before);
  (previewButtons()[0].props.onClick as () => void)();
  expect(onPreview).toHaveBeenCalledTimes(1); expect(onPreview.mock.calls[0][0]).toMatchObject({ fits: true, interval: { deltaSemitones: 2 } });
  expect(scoreStore.getState()).toBe(before);
});
it("target edits remove old results immediately and old handlers cannot select their obsolete target", () => {
  submit(); const old = previewButtons()[0]; change("목표 최저 MIDI", "61");
  expect(previewButtons()).toHaveLength(0); (old.props.onClick as () => void)(); expect(onPreview).not.toHaveBeenCalled(); expect(onInvalidate).toHaveBeenCalledTimes(1);
  submit(); expect(previewButtons().length).toBeGreaterThan(0);
});
it("displays explicit no-fit and out-of-range logical notes rather than labelling partial candidates complete", () => {
  change("목표 최저 MIDI", "64"); change("목표 최고 MIDI", "64"); submit();
  expect(text(tree)).toContain("완전히 들어가는 유효 후보가 없습니다"); expect(text(tree)).toContain("부분 적합");
  expect(text(tree)).toContain("낮음 4반음"); expect(text(tree)).toContain("높음 3반음");
});
it.each([["", "70"], ["70", "60"], ["-1", "70"], ["60", "128"], ["60.5", "70"]])("rejects invalid range %s..%s", (low, high) => {
  change("목표 최저 MIDI", low); change("목표 최고 MIDI", high); submit();
  expect(previewButtons()).toHaveLength(0); expect(nodes(tree).some((node) => node.props.role === "alert")).toBe(true); expect(onPreview).not.toHaveBeenCalled();
});
it("empty score has no invented range and disables recommendations", () => {
  score = baseScore(); render(); expect(text(RangeSummary({ analysis: analyzeScoreRange(score) }))).toContain("음표 없음");
  expect(find((node) => node.type === "button" && node.props.children === "추천 계산").props.disabled).toBe(true);
  submit(); expect(previewButtons()).toHaveLength(0);
});
it("disabled stale/conflict/deleted input cannot calculate or select a result", () => {
  submit(); disabled = true; render();
  expect(previewButtons().every((node) => node.props.disabled === true)).toBe(true);
  (previewButtons()[0].props.onClick as () => void)(); expect(onPreview).not.toHaveBeenCalled();
  change("목표 최저 MIDI", "61"); submit(); expect(previewButtons()).toHaveLength(0);
});
it("MIDI 0 target is displayed with the existing converter and no Score pitch is rewritten", () => {
  const before = JSON.stringify(score); change("목표 최저 MIDI", "0"); expect(text(tree)).toContain("C-1"); submit();
  expect(JSON.stringify(score)).toBe(before);
});
it("re-submitting an unchanged target keeps the same target object, so a double click never recomputes", () => {
  change("목표 최저 MIDI", "62"); change("목표 최고 MIDI", "69"); submit();
  const first = hooks.values[2]; expect(first).toEqual({ minMidi: 62, maxMidi: 69 });
  const buttons = previewButtons().length;
  submit(); submit();
  expect(hooks.values[2]).toBe(first); expect(previewButtons()).toHaveLength(buttons);
  (previewButtons()[0].props.onClick as () => void)(); expect(onPreview).toHaveBeenCalledTimes(1);
  change("목표 최고 MIDI", "70"); expect(hooks.values[2]).toBeNull();
  submit(); expect(hooks.values[2]).not.toBe(first); expect(hooks.values[2]).toEqual({ minMidi: 62, maxMidi: 70 });
});
