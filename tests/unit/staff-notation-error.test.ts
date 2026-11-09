import { afterEach, expect, it, vi } from "vitest";
import { StaffView } from "@/features/score-editor";
import { renderScoreInto, NotationRenderError } from "@/adapters/vexflow/renderScore";
import { baseScore, withMeasureEvents } from "../fixtures/scores";
import { createNoteEvent, createRestEvent } from "@/domain/score";
const hooks = vi.hoisted(() => ({ setup: undefined as undefined | (() => (() => void)), host: null as unknown }));
vi.mock("react", () => ({ useRef: () => ({ current: hooks.host }), useEffect: (setup: () => () => void) => { hooks.setup = setup; } }));
vi.mock("@/adapters/vexflow/renderScore", () => ({ renderScoreInto: vi.fn(), NotationRenderError: class extends Error { constructor(issue: { message: string }) { super(issue.message); } } }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
function host() {
  const value = { innerHTML: "<svg>old</svg>", notice: null as { textContent: string | null } | null,
    ownerDocument: { createElement: () => ({ textContent: null, setAttribute: vi.fn() }) },
    replaceChildren(notice: { textContent: string | null }) { this.innerHTML = ""; this.notice = notice; } };
  hooks.host = value; return value;
}
it("shows the explicit notation failure without keeping old SVG, and a later effect can recover", async () => {
  const value = host(); vi.mocked(renderScoreInto).mockRejectedValueOnce(new NotationRenderError({ code: "NOT_NOTATABLE", message: "1마디 bad 시작0 길이1000ticks" }));
  StaffView({ score: baseScore() }); const cleanup = hooks.setup!(); await Promise.resolve();
  expect(value.innerHTML).toBe(""); expect(value.notice?.textContent).toContain("1000ticks"); cleanup();
  vi.mocked(renderScoreInto).mockImplementationOnce(async () => { value.notice = null; value.innerHTML = "<svg>current</svg>"; });
  StaffView({ score: baseScore() }); const end = hooks.setup!(); await Promise.resolve(); expect(value.innerHTML).toBe("<svg>current</svg>"); end();
});
it("an abandoned effect cannot replace the latest notation with its error", async () => {
  const value = host(); let reject!: (error: Error) => void;
  vi.mocked(renderScoreInto).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  StaffView({ score: baseScore() }); const cleanup = hooks.setup!(); cleanup(); value.innerHTML = "<svg>latest</svg>";
  reject(new Error("late")); await Promise.resolve(); expect(value.innerHTML).toBe("<svg>latest</svg>"); expect(value.notice).toBeNull();
});
it("delegates split glyph clicks to their original event and keeps the preview read-only", () => {
  class Target { closest() { return { getAttribute: () => "original" }; } }
  vi.stubGlobal("Element", Target); const select = vi.fn();
  const score = withMeasureEvents(baseScore(), [createNoteEvent({ id: "original", step: "C", octave: 4, startTick: 0, durationTicks: 300 })]);
  const view = StaffView({ score, onSelectEvent: select }); view.props.onClick({ target: new Target() }); expect(select).toHaveBeenCalledExactlyOnceWith("original");
  select.mockClear(); StaffView({ score }).props.onClick({ target: new Target() }); expect(select).not.toHaveBeenCalled();
});
it("routes native pointerRect targets to the containing original note/rest without selecting a neighbor", () => {
  class RectTarget {
    readonly tagName = "rect";
    constructor(private readonly eventId: string) {}
    closest() { return { getAttribute: () => this.eventId }; }
  }
  vi.stubGlobal("Element", RectTarget);
  const score = withMeasureEvents(baseScore(), [
    createNoteEvent({ id: "original", step: "C", octave: 4, startTick: 120, durationTicks: 300 }),
    createNoteEvent({ id: "neighbor", step: "D", octave: 4, startTick: 480, durationTicks: 960 }),
    createRestEvent({ id: "rest", startTick: 1440, durationTicks: 300 }),
  ]);
  const before = JSON.stringify(score); const select = vi.fn(); const view = StaffView({ score, onSelectEvent: select });
  for (const id of ["original", "neighbor", "original", "rest"]) view.props.onClick({ target: new RectTarget(id) });
  expect(select.mock.calls).toEqual([["original"], ["neighbor"], ["original"], ["rest"]]);
  select.mockClear(); view.props.onClick({ target: new RectTarget("unknown") });
  StaffView({ score }).props.onClick({ target: new RectTarget("original") });
  expect(select).not.toHaveBeenCalled(); expect(JSON.stringify(score)).toBe(before);
});
