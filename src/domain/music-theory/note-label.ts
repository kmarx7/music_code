import type { Pitch } from "../score/types";
import { koreanFixedDo, letterName } from "./pitch";

export type NoteLabelMode = "none" | "letter" | "fixed-do";

/** Display only: keep the canonical spelling; never re-apply a key or respell MIDI. */
export function formatNoteLabel(pitch: Pitch, mode: NoteLabelMode): string | null {
  if (mode === "none") return null;
  const label = mode === "letter" ? letterName(pitch) : koreanFixedDo(pitch);
  const glyphs: Record<string, string> = { "##": "𝄪", bb: "𝄫", "#": "♯", b: "♭" };
  return label.replace(/##|bb|#|b/g, (symbol) => glyphs[symbol]);
}
