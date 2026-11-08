import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { TransposeTool } from "@/features/transposition";
import { RangeRecommendations, RangeSummary } from "@/features/transposition/RangeRecommendations";
import { StaffView } from "@/features/score-editor";
import type { AutosaveHandle, SaveStatus } from "@/features/score-library";
import { scoreStore } from "@/store/score-store";
import { KEY_SIGNATURE_OPTIONS, type NoteLabelMode } from "@/domain/music-theory";
import { createNoteEvent, recommendTranspositions, transposeScore } from "@/domain/score";
import type { Score } from "@/domain/score";
import { baseScore, fourNoteScore, tiedScore, withMeasureEvents } from "../fixtures/scores";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], state: 0, ref: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.state++; if (index >= hooks.values.length) hooks.values.push(initial);
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useRef: (initial: unknown) => { const index = hooks.ref++; return hooks.refs[index] ??= { current: initial }; },
  useMemo: (compute: () => unknown) => compute(), useEffect: () => {},
}));
vi.mock("@/store/useScoreStore", () => ({ useScoreState: () => scoreStore.getState() }));
type Element = ReactElement<{ children?: unknown; [key: string]: unknown }>;
let tree: Element; let revision: number; let storageStatus: SaveStatus; let status: SaveStatus;
let autosave: { current: AutosaveHandle | null }; let onOpen: ReturnType<typeof vi.fn<() => void>>;
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element; return [element, ...nodes(element.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node && typeof node === "object" && "props" in node) return text((node as Element).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function find(predicate: (element: Element) => boolean): Element {
  const result = nodes(tree).find(predicate); if (!result) throw new Error("element missing"); return result;
}
function button(name: string) { return find((element) => element.type === "button" && element.props.children === name); }
function invoke(element: Element, name: string, event?: unknown) { (element.props[name] as (event?: unknown) => void)(event); }
function render(labelMode: NoteLabelMode = "none") {
  hooks.state = 0; hooks.ref = 0; tree = TransposeTool({ autosave, status, onOpen, labelMode }) as Element;
}
function open(target = "major:2") {
  invoke(button("조옮김"), "onClick"); render();
  choose("조옮김 목표 조성", target);
}
function choose(label: string, value: string) {
  invoke(find((element) => element.props["aria-label"] === label), "onChange", { target: { value } }); render();
}
function candidate(): Score { return find((element) => element.type === StaffView).props.score as Score; }
beforeEach(() => {
  hooks.values.length = 0; hooks.refs.length = 0; revision = 1; status = storageStatus = "saved";
  scoreStore.init(fourNoteScore());
  autosave = { current: { flush: vi.fn(), getSnapshot: vi.fn(() => ({ revision, status: storageStatus })) } };
  onOpen = vi.fn(); render();
});
afterEach(() => vi.restoreAllMocks());

it("opens a read-only preview using supported major options and nearest, without dispatch/save/history changes", () => {
  const before = scoreStore.getState(); const dispatch = vi.spyOn(scoreStore, "dispatch"); open();
  expect(text(tree)).toContain("C 장조"); expect(text(tree)).toContain("+ 2 반음");
  expect(find((element) => element.props["aria-label"] === "조옮김 이동 방향").props.value).toBe("nearest");
  const options = nodes(find((element) => element.props["aria-label"] === "조옮김 목표 조성")).filter((element) => element.type === "option");
  expect(options).toHaveLength(15); expect(options.every((element) => String(element.props.value).startsWith("major:"))).toBe(true);
  expect(candidate()).not.toBe(before!.current);
  const calculated = transposeScore(before!.current, { kind: "targetKey", targetKey: KEY_SIGNATURE_OPTIONS.find((option) => option.id === "major:2")!.key });
  if (!calculated.ok) throw new Error("fixture"); expect(candidate()).toEqual(calculated.value.score);
  expect(candidate().updatedAt).toBe(before!.current.updatedAt); expect(scoreStore.getState()).toBe(before);
  expect(dispatch).not.toHaveBeenCalled(); expect(autosave.current!.flush).not.toHaveBeenCalled(); expect(revision).toBe(1); expect(onOpen).toHaveBeenCalledTimes(1);
});
it("minor scores offer only the fifteen supported minor destinations", () => {
  const source = fourNoteScore(); source.parts[0].keySignature = { ...KEY_SIGNATURE_OPTIONS.find((option) => option.id === "minor:0")!.key };
  scoreStore.init(source); render(); open("minor:1");
  expect(text(tree)).toContain("A 단조");
  const options = nodes(find((element) => element.props["aria-label"] === "조옮김 목표 조성")).filter((element) => element.type === "option");
  expect(options).toHaveLength(15); expect(options.every((element) => String(element.props.value).startsWith("minor:"))).toBe(true);
  expect(candidate().parts[0].keySignature.mode).toBe("minor");
});
it("uses engine-derived upward +6 for nearest ties and respects down", () => {
  open("major:6"); expect(text(tree)).toContain("+ 6 반음"); expect(text(tree)).toContain("상행");
  choose("조옮김 이동 방향", "down"); expect(text(tree)).toContain("-6 반음"); expect(text(tree)).toContain("하행");
});
it.each(["취소", "Escape"])("%s discards only local UI and preserves source, redo and save state", (action) => {
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 80, updatedAt: "changed" }); scoreStore.undo(); render();
  const before = scoreStore.getState(); open();
  if (action === "취소") invoke(button("취소"), "onClick");
  else invoke(find((element) => element.props["data-testid"] === "transpose-preview"), "onKeyDown", { key: "Escape", preventDefault: vi.fn() });
  render(); expect(nodes(tree).some((element) => element.props["data-testid"] === "transpose-preview")).toBe(false);
  expect(scoreStore.getState()).toBe(before); expect(before!.future).toHaveLength(1); expect(storageStatus).toBe("saved"); expect(revision).toBe(1);
});
it("confirms exactly once through dispatch, creates one undo snapshot and supports redo", () => {
  const before = scoreStore.getState()!.current; open(); const dispatch = vi.spyOn(scoreStore, "dispatch");
  const confirm = button("확정"); invoke(confirm, "onClick"); invoke(confirm, "onClick"); render();
  expect(dispatch).toHaveBeenCalledTimes(1); expect(dispatch.mock.calls[0][0]).toMatchObject({ type: "TransposeScore", spec: { kind: "targetKey", direction: "nearest" } });
  expect(dispatch.mock.calls[0][0]).toHaveProperty("updatedAt", expect.any(String));
  const changed = scoreStore.getState()!; expect(changed.past).toEqual([before]);
  expect(changed.current.parts[0].keySignature.fifths).toBe(2);
  scoreStore.undo(); expect(scoreStore.getState()!.current).toBe(before); scoreStore.redo(); expect(scoreStore.getState()!.current).toBe(changed.current);
});
it("same-key confirmation preserves redo and timestamps and latches even a double no-op click", () => {
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 80, updatedAt: "changed" }); scoreStore.undo(); render();
  const before = scoreStore.getState(); open("major:0"); expect(text(tree)).toContain("현재 악보와 같은 결과");
  const dispatch = vi.spyOn(scoreStore, "dispatch"); const confirm = button("확정");
  invoke(confirm, "onClick"); invoke(confirm, "onClick"); render();
  expect(dispatch).toHaveBeenCalledTimes(1); expect(scoreStore.getState()).toBe(before); expect(before!.future).toHaveLength(1);
});
it("zero MIDI movement can still commit enharmonic spelling/key changes", () => {
  const source = withMeasureEvents(baseScore(), [createNoteEvent({ id: "bsharp", step: "B", alter: 1, octave: 4, startTick: 0, durationTicks: 960 })]);
  source.parts[0].keySignature = { ...KEY_SIGNATURE_OPTIONS.find((option) => option.id === "major:7")!.key };
  scoreStore.init(source); render(); open("major:-5");
  expect(text(tree)).not.toContain("편집 이력은 추가되지 않습니다"); invoke(button("확정"), "onClick");
  const state = scoreStore.getState()!; expect(state.past).toEqual([source]);
  expect(state.current.parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 72, step: "C", alter: 0, octave: 5 } });
});
it("failed Command keeps the panel open and allows a safe retry", () => {
  open(); const before = scoreStore.getState(); const dispatch = vi.spyOn(scoreStore, "dispatch").mockReturnValueOnce({ ok: false, error: { code: "INVALID_SCORE", message: "failed" } });
  invoke(button("확정"), "onClick"); render(); expect(text(tree)).toContain("안전하게 조옮길 수 없습니다"); expect(scoreStore.getState()).toBe(before);
  expect(button("확정").props.disabled).toBe(false); dispatch.mockRestore(); invoke(button("확정"), "onClick"); render();
  expect(scoreStore.getState()!.past).toHaveLength(1);
});
it("out-of-range candidates show a user explanation, cannot confirm and can cancel", () => {
  scoreStore.init(withMeasureEvents(baseScore(), [createNoteEvent({ id: "high", step: "G", octave: 9, startTick: 0, durationTicks: 960 })])); render();
  const before = scoreStore.getState(); open(); expect(text(tree)).toContain("지원 음역"); expect(button("확정").props.disabled).toBe(true);
  invoke(button("확정"), "onClick"); expect(scoreStore.getState()).toBe(before); invoke(button("취소"), "onClick"); render();
});
it("invalid destination/direction cannot commit or alter the store", () => {
  const before = scoreStore.getState(); open(); choose("조옮김 목표 조성", "unsupported"); expect(button("확정").props.disabled).toBe(true);
  choose("조옮김 목표 조성", "major:2"); choose("조옮김 이동 방향", "invalid"); expect(button("확정").props.disabled).toBe(true);
  expect(scoreStore.getState()).toBe(before);
});
it.each(["edit", "undo", "redo", "same-id", "different-id"])("%s invalidates the immutable session baseline even if ID/time are unchanged", (action) => {
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 80, updatedAt: "unchanged" });
  if (action === "redo") scoreStore.undo(); render(); open();
  const originalConfirm = button("확정"); const base = scoreStore.getState()!;
  if (action === "edit") scoreStore.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: base.current.updatedAt });
  else if (action === "undo") scoreStore.undo(); else if (action === "redo") scoreStore.redo();
  else scoreStore.init({ ...base.current, id: action === "same-id" ? base.current.id : "different" });
  const latest = scoreStore.getState(); const dispatch = vi.spyOn(scoreStore, "dispatch");
  invoke(originalConfirm, "onClick"); render(); expect(button("확정").props.disabled).toBe(true);
  expect(text(tree)).toContain("원본 또는 저장 버전이 변경"); expect(dispatch).not.toHaveBeenCalled(); expect(scoreStore.getState()).toBe(latest);
});
it("a revision change without a score change invalidates both rendered and old confirmation handlers", () => {
  open(); const confirm = button("확정"); const state = scoreStore.getState(); revision = 2;
  const dispatch = vi.spyOn(scoreStore, "dispatch"); invoke(confirm, "onClick"); render();
  expect(button("확정").props.disabled).toBe(true); expect(dispatch).not.toHaveBeenCalled(); expect(scoreStore.getState()).toBe(state);
});
it.each(["conflict", "deleted", "error"] as SaveStatus[])("synchronous %s blocks confirmation even before React status props catch up", (next) => {
  open(); const confirm = button("확정"); storageStatus = next; const state = scoreStore.getState();
  const dispatch = vi.spyOn(scoreStore, "dispatch"); invoke(confirm, "onClick"); render();
  expect(button("확정").props.disabled).toBe(true); expect(dispatch).not.toHaveBeenCalled(); expect(scoreStore.getState()).toBe(state);
});
it("a disappeared autosave handle blocks old preview confirmation", () => {
  open(); const confirm = button("확정"); autosave.current = null;
  const dispatch = vi.spyOn(scoreStore, "dispatch"); invoke(confirm, "onClick"); render();
  expect(button("확정").props.disabled).toBe(true); expect(dispatch).not.toHaveBeenCalled();
});
it("an unavailable handle is explained without creating preview state", () => {
  autosave.current = null; invoke(button("조옮김"), "onClick"); render(); expect(text(tree)).toContain("저장 상태를 준비 중");
  expect(nodes(tree).some((element) => element.props["data-testid"] === "transpose-preview")).toBe(false);
});

it("all parts are transformed while the existing first-part renderer receives a read-only candidate with ties intact", () => {
  const source = tiedScore(); const part = source.parts[0];
  source.parts.push({ ...part, id: "second", measures: part.measures.map((measure) => ({
    ...measure, id: `${measure.id}:second`, events: measure.events.map((event) => ({ ...event, id: `${event.id}:second` })),
  })), ties: part.ties.map((tie) => ({ from: `${tie.from}:second`, to: `${tie.to}:second` })) });
  scoreStore.init(source); render(); open();
  const preview = candidate(); expect(preview.parts).toHaveLength(2);
  for (const part of preview.parts) {
    expect(part.keySignature.fifths).toBe(2);
    expect(part.measures.flatMap((measure) => measure.events).every((event) => event.kind === "note" && event.pitch.midi === 62)).toBe(true);
  }
  expect(preview.parts.map((part) => part.ties)).toEqual(source.parts.map((part) => part.ties));
  expect(text(tree)).toContain("모든 파트가 조옮겨집니다"); expect(text(tree)).toContain("첫 파트를 표시");
  expect(scoreStore.getState()!.current).toBe(source);
});

it("label mode changes project only the candidate and do not invalidate or commit the preview", () => {
  open(); const before = scoreStore.getState(); const dispatch = vi.spyOn(scoreStore, "dispatch");
  const expected = candidate();
  for (const mode of ["letter", "fixed-do", "none"] as const) {
    render(mode); const staff = find((element) => element.type === StaffView);
    expect(staff.props.labelMode).toBe(mode); expect(staff.props.score).toEqual(expected);
    expect(button("확정").props.disabled).toBe(false); expect(scoreStore.getState()).toBe(before);
  }
  expect(dispatch).not.toHaveBeenCalled(); expect(autosave.current!.flush).not.toHaveBeenCalled(); expect(revision).toBe(1);
  invoke(button("취소"), "onClick"); expect(scoreStore.getState()).toBe(before);
});

function recommendation(minMidi = 84, maxMidi = 91) {
  const result = recommendTranspositions(scoreStore.getState()!.current, { minMidi, maxMidi });
  if (!result.ok || !result.candidates.length) throw new Error("fixture"); return result.candidates[0];
}
function chooser() { return find((element) => element.type === RangeRecommendations); }
it("whole-score range and choosing an octave recommendation are read-only until one atomic confirmation", () => {
  const before = scoreStore.getState(); const choice = recommendation(); const dispatch = vi.spyOn(scoreStore, "dispatch");
  expect(find((element) => element.type === RangeSummary).props.analysis).toMatchObject({ minMidi: 60, maxMidi: 67 });
  open(); invoke(chooser(), "onPreview", choice); render();
  expect(scoreStore.getState()).toBe(before); expect(dispatch).not.toHaveBeenCalled(); expect(revision).toBe(1);
  expect(candidate().parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 84 } });
  const confirm = button("확정"); invoke(confirm, "onClick"); invoke(confirm, "onClick");
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "TransposeScore", spec: { kind: "semitones", semitones: 24 } }));
  const changed = scoreStore.getState()!; expect(changed.past).toEqual([before!.current]);
  scoreStore.undo(); expect(scoreStore.getState()!.current).toBe(before!.current); scoreStore.redo(); expect(scoreStore.getState()!.current).toBe(changed.current);
});
it("cancel and no-op recommendations preserve redo, original Score and saving state", () => {
  scoreStore.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: "changed" }); scoreStore.undo(); render();
  const before = scoreStore.getState(); open(); invoke(chooser(), "onPreview", recommendation()); render(); invoke(button("취소"), "onClick"); render();
  expect(scoreStore.getState()).toBe(before); open(); invoke(chooser(), "onPreview", recommendation(0, 127)); render(); invoke(button("확정"), "onClick");
  expect(scoreStore.getState()).toBe(before); expect(before!.future).toHaveLength(1); expect(storageStatus).toBe("saved"); expect(revision).toBe(1);
});
it("changing target invalidates selected recommendation and even its old confirmation closure", () => {
  open(); invoke(chooser(), "onPreview", recommendation()); render(); const confirm = button("확정");
  const before = scoreStore.getState(); const dispatch = vi.spyOn(scoreStore, "dispatch"); invoke(chooser(), "onInvalidate");
  invoke(confirm, "onClick"); render(); expect(button("확정").props.disabled).toBe(true); expect(dispatch).not.toHaveBeenCalled(); expect(scoreStore.getState()).toBe(before);
});
it("manual key selection clears octave recommendation and resumes the existing target-key command", () => {
  open(); invoke(chooser(), "onPreview", recommendation()); render(); choose("조옮김 목표 조성", "major:2");
  const dispatch = vi.spyOn(scoreStore, "dispatch"); invoke(button("확정"), "onClick");
  expect(dispatch.mock.calls[0][0]).toMatchObject({ type: "TransposeScore", spec: { kind: "targetKey", targetKey: { fifths: 2 } } });
  expect(scoreStore.getState()!.current.parts[0].measures[0].events[0]).toMatchObject({ pitch: { midi: 62 } });
});
it.each(["edit", "revision", "conflict", "deleted", "error"])("%s blocks old recommendation selection and confirmation", (action) => {
  open(); const choice = recommendation(); const oldChooser = chooser(); invoke(oldChooser, "onPreview", choice); render();
  const oldConfirm = button("확정");
  if (action === "edit") scoreStore.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: "same" });
  else if (action === "revision") revision++;
  else storageStatus = action as SaveStatus;
  const latest = scoreStore.getState(); const dispatch = vi.spyOn(scoreStore, "dispatch");
  invoke(oldChooser, "onPreview", choice); invoke(oldConfirm, "onClick"); render();
  expect(chooser().props.disabled).toBe(true); expect(button("확정").props.disabled).toBe(true); expect(dispatch).not.toHaveBeenCalled(); expect(scoreStore.getState()).toBe(latest);
});
