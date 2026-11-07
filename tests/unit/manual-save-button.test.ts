import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { SaveButton, type AutosaveHandle, type SaveStatus } from "@/features/score-library";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0,
  setup: undefined as undefined | (() => void | (() => void)) }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++; if (index >= hooks.values.length) hooks.values.push(initial);
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useRef: (initial: unknown) => { const index = hooks.refIndex++; return hooks.refs[index] ??= { current: initial }; },
  useEffect: (setup: () => void | (() => void)) => { hooks.setup ??= setup; },
}));
type Element = ReactElement<{ children?: unknown; onClick?: () => void; disabled?: boolean; [key: string]: unknown }>;
let control: { current: AutosaveHandle | null };
let flush = vi.fn<() => Promise<boolean>>();
let cleanup: (() => void) | undefined;
function render(status: SaveStatus = "idle") {
  hooks.stateIndex = 0; hooks.refIndex = 0;
  const tree = SaveButton({ autosave: control, status }) as Element;
  const [button, feedback] = tree.props.children as Element[];
  return { button, message: feedback.props.children };
}
beforeEach(() => {
  hooks.values.length = 0; hooks.refs.length = 0; hooks.setup = undefined;
  flush = vi.fn<() => Promise<boolean>>().mockResolvedValue(true); control = { current: { flush } };
  render();
  const setup = hooks.setup as (() => void | (() => void)) | undefined;
  cleanup = setup?.() as (() => void) | undefined;
});
afterEach(() => cleanup?.());

it("saves once on rapid clicks and disables only the manual button while pending", async () => {
  let complete!: (saved: boolean) => void;
  flush.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const { button } = render(); button.props.onClick!(); button.props.onClick!();
  expect(flush).toHaveBeenCalledTimes(1);
  expect(render("saving").button.props.disabled).toBe(true);
  expect(render("saving").message).toContain("저장 중");
  complete(true); await Promise.resolve();
  expect(render("saved").button.props.disabled).toBe(false);
  expect(render("saved").message).toContain("저장이 완료");
});
it("a later edit hides prior success until the shared autosave state confirms the latest save", async () => {
  render().button.props.onClick!(); await Promise.resolve();
  expect(render("saved").message).toContain("저장이 완료");
  expect(render("saving").message).toContain("저장 중");
  expect(render("saving").message).not.toContain("완료");
  expect(render("saved").message).toContain("저장이 완료");
});
it("failure provides retry/backup guidance and retries using the same autosave handle", async () => {
  flush.mockResolvedValueOnce(false);
  render().button.props.onClick!(); await Promise.resolve();
  expect(render("error").message).toContain("다시 시도");
  expect(render("error").message).toContain("JSON 백업");
  expect(render("error").button.props.disabled).toBe(false);
  render("error").button.props.onClick!(); await Promise.resolve();
  expect(flush).toHaveBeenCalledTimes(2); expect(render("saved").message).toContain("저장이 완료");
});
it("an unavailable handle cannot report a previously saved score as a successful manual request", async () => {
  control.current = null;
  render("saved").button.props.onClick!(); await Promise.resolve();
  expect(render("saved").message).toContain("저장하지 못했습니다");
  expect(flush).not.toHaveBeenCalled();
});
it("unexpected rejection is recoverable and does not escape the click handler", async () => {
  flush.mockRejectedValueOnce(new Error("storage unavailable"));
  render().button.props.onClick!(); await Promise.resolve();
  expect(render().message).toContain("저장하지 못했습니다");
  render().button.props.onClick!(); await Promise.resolve();
  expect(render("saved").message).toContain("저장이 완료");
});
it("unmount ignores late UI results without cancelling the storage queue", async () => {
  let complete!: (saved: boolean) => void;
  flush.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  render().button.props.onClick!(); const before = [...hooks.values];
  cleanup?.(); cleanup = undefined; complete(false); await Promise.resolve();
  expect(hooks.values).toEqual(before); expect(flush).toHaveBeenCalledTimes(1);
});
