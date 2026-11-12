import { mockVexflowCssFont } from "../fixtures/vexflow-font";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Annotation, StaveNote, type Voice } from "vexflow";
import { renderScoreInto } from "@/adapters/vexflow/renderScore";
import { createEmptyScore, createNoteEvent, type Score, type ScoreEvent, type TieLink } from "@/domain/score";
import { FIXTURE_CREATED_AT } from "../fixtures/scores";

/** Minimal DOM double: enough parent/child bookkeeping to observe which row nodes stay, move or go. */
type Node = { row: string | null; parentNode: unknown; children: Node[]; attributes: { name: string; value: string }[];
  setAttribute(key: string, value: string): void; appendChild(node: Node): void; remove(): void; replaceWith(node: Node): void };
const capture = vi.hoisted(() => ({
  voices: [] as Voice[], ties: [] as { firstNote?: unknown; lastNote?: unknown; parent: unknown }[],
  opened: [] as unknown[], context: null as null | { parent: unknown }, svgs: [] as unknown[],
}));
vi.mock("vexflow", async (original) => {
  const v = await original<typeof import("vexflow")>();
  function node(): Node {
    return { row: null, parentNode: null, children: [], attributes: [],
      setAttribute(key, value) {
        if (key === "data-staff-row") this.row = value;
        this.attributes = [...this.attributes.filter((item) => item.name !== key), { name: key, value }];
      },
      appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); },
      remove() {
        const parent = this.parentNode as Node | null;
        if (parent?.children) parent.children = parent.children.filter((item) => item !== this);
        this.parentNode = null;
      },
      replaceWith(next) {
        const parent = this.parentNode as Node; next.remove();
        parent.children = parent.children.map((item) => (item === this ? next : item)); next.parentNode = parent; this.parentNode = null;
      } };
  }
  /** A real `SVGContext` instance as far as `instanceof` goes, drawing into the DOM double. */
  function context(element: unknown) {
    const svg = node(); svg.parentNode = element; capture.svgs.push(svg);
    const fake = Object.assign(Object.create(v.SVGContext.prototype) as Record<string, unknown>, {
      svg, parent: svg as unknown,
      openGroup() { const group = node(); svg.appendChild(group); capture.opened.push(group); fake.parent = group; return group; },
      closeGroup() { fake.parent = svg; },
    });
    capture.context = fake as { parent: unknown };
    return fake;
  }
  return { ...v,
    Renderer: class {
      static Backends = { SVG: 1 }; private made: unknown;
      constructor(element: unknown) { this.made = context(element); }
      resize() {} getContext() { return this.made; }
    },
    Stave: class extends v.Stave { draw() {} },
    Voice: class extends v.Voice { constructor(time: ConstructorParameters<typeof v.Voice>[0]) { super(time); capture.voices.push(this); } draw(_context: unknown, stave: InstanceType<typeof v.Stave>) { this.getTickables().forEach((note) => note.setStave(stave)); } },
    StaveTie: class {
      constructor(private link: { firstNote?: unknown; lastNote?: unknown }) {}
      setContext() { return this; }
      draw() { capture.ties.push({ ...this.link, parent: capture.context?.parent }); }
    },
  };
});
beforeEach(() => {
  mockVexflowCssFont();
  capture.voices.length = capture.ties.length = capture.opened.length = capture.svgs.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(StaveNote.prototype, "getSVGElement").mockReturnValue({ setAttribute() {} } as unknown as SVGElement);
  vi.spyOn(Annotation.prototype, "getSVGElement").mockReturnValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

const BAR = 3840;
/** 12 measures (3 rows of 4), one whole note per measure; `pitches` overrides the step of a measure. */
function score(steps: Record<number, "C" | "D" | "E"> = {}, ties: TieLink[] = [], measureCount = 12): Score {
  const empty = createEmptyScore({ id: "rows", measureCount, createdAt: FIXTURE_CREATED_AT });
  const part = empty.parts[0];
  const events = (index: number): ScoreEvent[] =>
    [createNoteEvent({ id: `n${index}`, step: steps[index] ?? "C", octave: 4, startTick: index * BAR, durationTicks: BAR })];
  return { ...empty, parts: [{ ...part, ties, measures: part.measures.map((measure, index) => ({ ...measure, events: events(index) })) }] };
}
const line = () => ({ setAttribute() {}, remove() {} });
const host = () => ({ innerHTML: "", ownerDocument: { createElementNS: line } }) as unknown as HTMLDivElement;
function reset() { capture.voices.length = capture.ties.length = capture.opened.length = 0; }
const rows = (groups: unknown[]) => (groups as Node[]).map((group) => group.row);
/** The SVG that stays on screen (the first one made for the element) and its current row nodes. */
const staff = () => capture.svgs[0] as Node;
const scratch = () => capture.svgs.at(-1) as Node;

it("an unchanged score is not redrawn: the same SVG and the same row nodes stay in place", async () => {
  const element = host();
  await renderScoreInto(element, score());
  expect(capture.voices).toHaveLength(12); expect(rows(capture.opened)).toEqual(["0", "1", "2"]);
  const groups = [...capture.opened]; reset();
  await renderScoreInto(element, score(), { cursorTick: 5 * BAR });
  expect(capture.voices).toHaveLength(0); expect(capture.opened).toEqual([]);
  expect(staff().parentNode).toBe(element); expect(scratch()).not.toBe(staff()); expect(scratch().parentNode).toBeNull();
  expect(staff().children.slice(0, 3)).toEqual(groups);
  groups.forEach((group, index) => expect(staff().children[index]).toBe(group));
});

it("editing one measure swaps only its own row in place; adding or removing a row leaves the others alone", async () => {
  const element = host();
  await renderScoreInto(element, score());
  const groups = [...capture.opened] as Node[]; reset();
  await renderScoreInto(element, score({ 9: "E" }));
  expect(capture.voices).toHaveLength(4); // measures 9–12 only
  expect(rows(capture.opened)).toEqual(["2"]);
  const third = capture.opened[0] as Node;
  expect(staff().children).toHaveLength(3);
  expect(staff().children[0]).toBe(groups[0]); expect(staff().children[1]).toBe(groups[1]); expect(staff().children[2]).toBe(third);
  expect(groups[2].parentNode).toBeNull(); expect(scratch().parentNode).toBeNull();
  reset();
  // Appending a measure adds a row; the three existing rows stay as they are.
  await renderScoreInto(element, score({ 9: "E" }, [], 13));
  expect(capture.voices).toHaveLength(1); expect(rows(capture.opened)).toEqual(["3"]);
  expect(staff().children).toHaveLength(4);
  [groups[0], groups[1], third, capture.opened[0]].forEach((group, index) => expect(staff().children[index]).toBe(group));
  const fourth = capture.opened[0] as Node; reset();
  // Removing it again drops only that row.
  await renderScoreInto(element, score({ 9: "E" }));
  expect(capture.voices).toHaveLength(0); expect(fourth.parentNode).toBeNull();
  expect(staff().children).toHaveLength(3); expect(staff().children[2]).toBe(third);
});

it("a label mode change, a key change or a failure invalidates every row; another element shares nothing", async () => {
  const element = host();
  await renderScoreInto(element, score());
  const first = [...capture.opened] as Node[];
  reset(); await renderScoreInto(element, score(), { labelMode: "letter" });
  expect(capture.voices).toHaveLength(12); expect(first.every((group) => group.parentNode === null)).toBe(true);
  expect(staff().children).toEqual(capture.opened);
  reset();
  const keyed = score(); keyed.parts[0].keySignature = { ...keyed.parts[0].keySignature, fifths: 2 };
  await renderScoreInto(element, keyed, { labelMode: "letter" });
  expect(capture.voices).toHaveLength(12); expect(staff().children).toEqual(capture.opened);
  reset();
  const broken = score(); broken.parts[0].measures[0].events[0] = { ...broken.parts[0].measures[0].events[0], durationTicks: 1000 };
  const made = capture.svgs.length;
  await expect(renderScoreInto(element, broken, { labelMode: "letter" })).rejects.toThrow();
  expect(element.innerHTML).toBe(""); // the renderer cleared its host
  await renderScoreInto(element, keyed, { labelMode: "letter" });
  // After a failure nothing is kept: every row is drawn again into a brand-new SVG.
  expect(capture.voices).toHaveLength(12); expect(capture.svgs).toHaveLength(made + 1);
  expect((capture.svgs.at(-1) as Node).children).toEqual(capture.opened);
  reset(); await renderScoreInto(host(), keyed, { labelMode: "letter" });
  expect(capture.voices).toHaveLength(12); expect((capture.svgs.at(-1) as Node).children).toEqual(capture.opened);
});

it("an SVG that left its element (e.g. replaced by an error notice) is never reused", async () => {
  const element = host();
  await renderScoreInto(element, score());
  staff().parentNode = null; reset();
  await renderScoreInto(element, score());
  expect(capture.voices).toHaveLength(12); expect(rows(capture.opened)).toEqual(["0", "1", "2"]);
  expect((capture.svgs.at(-1) as Node).parentNode).toBe(element);
});

it("a row-crossing tie is drawn inside each end's own row and survives a redraw of only one end", async () => {
  const element = host(); const tie = [{ from: "n3", to: "n4" }];
  await renderScoreInto(element, score({}, tie));
  const [first, second, third] = capture.opened as Node[];
  expect(capture.ties).toHaveLength(2);
  expect(capture.ties[0]).toMatchObject({ parent: first }); expect(capture.ties[0].lastNote).toBeUndefined();
  expect(capture.ties[1]).toMatchObject({ parent: second }); expect(capture.ties[1].firstNote).toBeUndefined();
  expect(capture.context?.parent).not.toBe(second); // the context parent is restored after each tie
  reset();
  // Only row 2 changes: its half of the tie is redrawn in the new group, row 1 keeps its own half untouched.
  await renderScoreInto(element, score({ 6: "D" }, tie));
  expect(rows(capture.opened)).toEqual(["1"]);
  expect(staff().children[0]).toBe(first); expect(staff().children[1]).toBe(capture.opened[0]); expect(staff().children[2]).toBe(third);
  expect(capture.ties).toHaveLength(1);
  expect(capture.ties[0]).toMatchObject({ parent: capture.opened[0] }); expect(capture.ties[0].firstNote).toBeUndefined();
  reset();
  // Removing the tie changes both rows it touched, and only those.
  await renderScoreInto(element, score({ 6: "D" }));
  expect(rows(capture.opened)).toEqual(["0", "1"]); expect(capture.ties).toEqual([]); expect(staff().children[2]).toBe(third);
});
