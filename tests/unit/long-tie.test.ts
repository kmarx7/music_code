import { expect, it } from "vitest";
import { chainIdsOf, mergeTiedNotes, splitNoteIntoMeasures } from "@/domain/score/tie";
import { createEmptyScore, deserializeScore, serializeScore, validateScore } from "@/domain/score";
import { createPitch } from "@/domain/music-theory";
import { createScoreStore } from "@/store/score-store";
import { longTiedScore } from "../fixtures/scores";

it.each([1, 2, 3, 63, 64, 65, 66, 67, 128])("imports and fully traverses %s valid segments from head, middle and tail", (count) => {
  const source = longTiedScore(count); const raw = serializeScore(source);
  expect(validateScore(source)).toEqual([]);
  const parsed = deserializeScore(raw); if (!parsed.ok) throw new Error(parsed.message);
  const part = parsed.score.parts[0];
  const ids = Array.from({ length: count }, (_, index) => `long-${index}`);
  for (const index of [0, Math.floor(count / 2), count - 1]) expect(chainIdsOf(part, ids[index])).toEqual(ids);
  expect(mergeTiedNotes(part)).toEqual([{ id: "long-0", pitch: createPitch("C", 0, 4), startTick: 0, durationTicks: count * 960, velocity: 96 }]);
  expect(serializeScore(parsed.score)).toBe(raw); expect(serializeScore(source)).toBe(raw);
});

it("rests remain separate and do not shorten the 66-segment sustain", () => {
  const score = longTiedScore(66, true); const before = serializeScore(score);
  expect(validateScore(score)).toEqual([]);
  expect(mergeTiedNotes(score.parts[0])).toEqual([{ id: "long-0", pitch: createPitch("C", 0, 4), startTick: 960, durationTicks: 63360, velocity: 96 }]);
  expect(serializeScore(score)).toBe(before);
});

it.each(["unknown", "rest", "cycle", "branch", "gap", "pitch"] as const)("rejects %s ties at import and direct traversal without mutating the source", (kind) => {
  const score = longTiedScore(67, true); const part = score.parts[0];
  if (kind === "unknown") part.ties[0].to = "missing";
  if (kind === "rest") part.ties[0].to = "leading-rest";
  if (kind === "cycle") part.ties.push({ from: "long-66", to: "long-0" });
  if (kind === "branch") part.ties.push({ from: "long-0", to: "long-2" });
  if (kind === "gap") part.ties[0].to = "long-2";
  if (kind === "pitch") {
    const tail = part.measures.flatMap((measure) => measure.events).find((event) => event.id === "long-66")!;
    if (tail.kind === "note") tail.pitch = createPitch("D", 0, 4);
  }
  const before = serializeScore(score);
  const codes = validateScore(score).map((issue) => issue.code);
  expect(codes).toContain(kind === "cycle" ? "TIE_CYCLE" : kind === "unknown" || kind === "rest" ? "TIE_UNKNOWN_REF"
    : kind === "branch" ? "TIE_BRANCHING" : kind === "gap" ? "TIE_NOT_CONTIGUOUS" : "TIE_PITCH_MISMATCH");
  expect(deserializeScore(before).ok).toBe(false);
  expect(() => mergeTiedNotes(part)).toThrow();
  expect(() => chainIdsOf(part, "long-0")).toThrow();
  expect(serializeScore(score)).toBe(before);
});

it.each([0, 66, 127])("editing segment %s updates the entire 128-segment chain and one undo restores it", (index) => {
  const source = longTiedScore(128); const store = createScoreStore(); store.init(source);
  expect(store.dispatch({ type: "UpdateNote", partId: source.parts[0].id, noteId: `long-${index}`, patch: { pitch: createPitch("D", 0, 4) } })?.ok).toBe(true);
  const changed = store.getState()!;
  expect(changed.past).toEqual([source]);
  expect(changed.current.parts[0].measures.flatMap((measure) => measure.events).every((event) => event.kind === "note" && event.pitch.midi === 62)).toBe(true);
  expect(mergeTiedNotes(changed.current.parts[0])[0].durationTicks).toBe(128 * 960);
  store.undo(); expect(store.getState()!.current).toBe(source);
  store.redo(); expect(store.getState()!.current).toBe(changed.current);
});

it("resizing an imported long chain from its tail replaces the entire chain, not a truncated suffix", () => {
  const source = longTiedScore(128, true); const store = createScoreStore(); store.init(source);
  expect(store.dispatch({ type: "ResizeNote", partId: source.parts[0].id, noteId: "long-127", durationTicks: 960 })?.ok).toBe(true);
  const changed = store.getState()!.current;
  expect(changed.parts[0].ties).toEqual([]);
  expect(changed.parts[0].measures.flatMap((measure) => measure.events)).toEqual([
    source.parts[0].measures[0].events[0], source.parts[0].measures[0].events[1],
  ]);
  store.undo(); expect(store.getState()!.current).toBe(source);
});

it("keeps the existing 64-segment generation limit separate from traversal of valid imported chains", () => {
  const part = createEmptyScore({ id: "split-limit", measureCount: 65, createdAt: "fixed" }).parts[0];
  const spec = { id: "generated", pitch: createPitch("C", 0, 4), startTick: 0 };
  const allowed = splitNoteIntoMeasures(part, { ...spec, durationTicks: 64 * 3840 });
  expect(allowed.ok).toBe(true); if (allowed.ok) expect(allowed.segments).toHaveLength(64);
  expect(splitNoteIntoMeasures(part, { ...spec, durationTicks: 65 * 3840 })).toEqual({ ok: false, code: "TOO_MANY_SEGMENTS" });
});

it("traverses long chains independently of stored tie-link order", () => {
  const score = longTiedScore(128); const part = score.parts[0];
  part.ties.reverse(); const before = serializeScore(score);
  expect(validateScore(score)).toEqual([]);
  expect(chainIdsOf(part, "long-127")).toEqual(Array.from({ length: 128 }, (_, index) => `long-${index}`));
  expect(mergeTiedNotes(part)).toEqual([{ id: "long-0", pitch: createPitch("C", 0, 4), startTick: 0, durationTicks: 122880, velocity: 96 }]);
  expect(serializeScore(score)).toBe(before);
});
