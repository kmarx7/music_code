import { expect, it } from "vitest";
import { createPitch, formatNoteLabel, KEY_SIGNATURE_OPTIONS, type NoteLabelMode } from "@/domain/music-theory";
import { applyEditCommand } from "@/domain/commands";
import { NoteLabelsControl } from "@/features/score-editor";
import { fourNoteScore } from "../fixtures/scores";

it.each([
  ["C", 0, 4, "C4", "도"], ["C", 1, 4, "C♯4", "도♯"], ["D", -1, 4, "D♭4", "레♭"],
  ["E", 1, 4, "E♯4", "미♯"], ["B", 1, 3, "B♯3", "시♯"], ["C", -1, 4, "C♭4", "도♭"],
  ["F", 2, 4, "F𝄪4", "파𝄪"], ["B", -2, 4, "B𝄫4", "시𝄫"],
  ["C", 0, 0, "C0", "도"], ["G", 0, 9, "G9", "솔"], ["A", 0, 4, "A4", "라"],
] as const)("formats %s/%s/%s using the existing full spelling without mutation", (step, alter, octave, letter, fixed) => {
  const pitch = Object.freeze(createPitch(step, alter, octave)); const before = JSON.stringify(pitch);
  expect(formatNoteLabel(pitch, "letter")).toBe(letter); expect(formatNoteLabel(pitch, "fixed-do")).toBe(fixed);
  expect(formatNoteLabel(pitch, "none")).toBeNull(); expect(JSON.stringify(pitch)).toBe(before);
});
it.each([
  [createPitch("E", 1, 4), createPitch("F", 0, 4)],
  [createPitch("B", 1, 3), createPitch("C", 0, 4)],
  [createPitch("C", -1, 4), createPitch("B", 0, 3)],
])("distinguishes enharmonic spellings with identical MIDI", (first, second) => {
  expect(first.midi).toBe(second.midi);
  expect(formatNoteLabel(first, "letter")).not.toBe(formatNoteLabel(second, "letter"));
  expect(formatNoteLabel(first, "fixed-do")).not.toBe(formatNoteLabel(second, "fixed-do"));
});
it("does not apply the key twice, and C remains fixed-do 도 in every key", () => {
  const source = fourNoteScore(); const keySignature = KEY_SIGNATURE_OPTIONS.find((key) => key.id === "major:2")!.key;
  const result = applyEditCommand(source, { type: "SetKeySignature", partId: source.parts[0].id, keySignature, updatedAt: "test" });
  if (!result.ok) throw new Error(result.error.message);
  const note = result.score.parts[0].measures[0].events[0]; if (note.kind !== "note") throw new Error("fixture");
  expect(formatNoteLabel(note.pitch, "fixed-do")).toBe("도"); expect(formatNoteLabel(note.pitch, "letter")).toBe("C4");
  expect(formatNoteLabel(createPitch("F", 1, 4), "letter")).toBe("F♯4");
});
it("offers exactly the three controlled modes without dispatching an edit", () => {
  let mode: NoteLabelMode = "none"; const source = fourNoteScore(); const before = JSON.stringify(source);
  function control() { return NoteLabelsControl({ mode, onChange: (value) => { mode = value; } }).props.children[1]; }
  expect(control().props.value).toBe("none");
  expect(control().props.children.map((option: { props: { value: string } }) => option.props.value)).toEqual(["none", "letter", "fixed-do"]);
  for (const value of ["letter", "fixed-do", "none"] as const) { control().props.onChange({ target: { value } }); expect(control().props.value).toBe(value); }
  control().props.onChange({ target: { value: "unknown" } }); expect(mode).toBe("none"); expect(JSON.stringify(source)).toBe(before);
});
