import type { NotationFragment } from "./notation";

/** 1 = treble (upper) staff, 2 = bass (lower) staff of a grand staff. */
export type GrandStaffNumber = 1 | 2;

/** Middle C (MIDI 60) and above go on the treble staff. */
export const GRAND_STAFF_SPLIT_MIDI = 60;

/**
 * Which staff of a grand staff each glyph goes on, for a single melody (25현 가야금, B-1). A note goes by its pitch;
 * a rest follows the note before it (across bar lines too), and a rest before any note goes on the treble staff.
 * Glyphs of one tied note share a pitch, so they always share a staff. Pure: display and export only.
 */
export function assignGrandStaves(measures: readonly (readonly NotationFragment[])[]): GrandStaffNumber[][] {
  let previous: GrandStaffNumber = 1;
  return measures.map((fragments) => fragments.map((fragment) => {
    if (fragment.event.kind === "note") previous = fragment.event.pitch.midi >= GRAND_STAFF_SPLIT_MIDI ? 1 : 2;
    return previous;
  }));
}
