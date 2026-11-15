import { INSTRUMENT_IDS, SUPPORTED_CLEFS, type InstrumentId } from "@/domain/score/constants";
import type { Clef, Part } from "@/domain/score/types";

/* Instrument profiles (Phase 7 decision 6). Pure data: no browser, audio or UI. */

/** One open-string tuning of a zither: the sounding MIDI pitch of each string, lowest first. */
export interface InstrumentTuning {
  id: string;
  name: string;
  stringMidis: readonly number[];
  /** Key signature (fifths) this tuning is the scale of, major or its relative minor; null when it follows no key. */
  keyFifths: number | null;
}

export interface InstrumentProfile {
  id: InstrumentId;
  name: string;
  /**
   * False until the values are confirmed by a textbook or a player (B-1, `docs/INSTRUMENTS.md`). Unverified
   * profiles carry no range or tunings: researched-but-unconfirmed numbers are deliberately not shipped (decision 5).
   */
  verified: boolean;
  /** Sounding range, inclusive. `label` spells the ends as the instrument's own scores do (Eb2, not D#2). */
  range: { lowMidi: number; highMidi: number; label: string } | null;
  clefs: readonly Clef[];
  tunings: readonly InstrumentTuning[];
  /** Written on a grand staff (treble and bass together). Display and export only; the Score stays one melody. */
  grandStaff: boolean;
  /** Shown in instrument lists. False for a retired instrument that stored scores may still name (향피리). */
  listed: boolean;
}

/**
 * 25현 가야금 Eb조 (B-1, confirmed by a player on 2026-11-15, `docs/INSTRUMENTS.md`): strings 1–25 lowest first,
 * the E-flat major scale from Eb2 to Ab5, written at sounding pitch. Ab조 lowers the three D strings to D-flat.
 */
const GAYAGEUM_25_EB: readonly number[] = [39, 41, 43, 44, 46, 48, 50, 51, 53, 55, 56, 58, 60, 62, 63, 65, 67, 68, 70, 72, 74, 75, 77, 79, 80];
const GAYAGEUM_25_AB: readonly number[] = GAYAGEUM_25_EB.map((midi) => (midi % 12 === 2 ? midi - 1 : midi));

/**
 * 12현 산조가야금 (국립국악원 국악사전 "가야금", read 2026-11-15, `docs/INSTRUMENTS.md`): open strings 1–12 lowest
 * first, sounding pitch G2 C3 D3 G3 A3 C4 D4 E4 G4 A4 C5 D5. The dictionary notes that 산조 is often written a fifth
 * above the sound and that tunings differ by player; the app writes sounding pitch (decision 9, B-5 revisits it).
 */
const GAYAGEUM_12_SANJO: readonly number[] = [43, 48, 50, 55, 57, 60, 62, 64, 67, 69, 72, 74];

const PROFILES: Record<InstrumentId, InstrumentProfile> = {
  piano: { id: "piano", name: "피아노", verified: true, range: { lowMidi: 21, highMidi: 108, label: "A0–C8" }, clefs: SUPPORTED_CLEFS, tunings: [], grandStaff: false, listed: true },
  // Retired 2026-11-15 (user: 향피리 대신 산조대금). Kept so a stored part that names it still opens.
  "hyang-piri": { id: "hyang-piri", name: "향피리", verified: false, range: null, clefs: SUPPORTED_CLEFS, tunings: [], grandStaff: false, listed: false },
  "gayageum-25": {
    id: "gayageum-25", name: "25현 가야금", verified: true, range: { lowMidi: 39, highMidi: 80, label: "Eb2–Ab5" }, clefs: SUPPORTED_CLEFS,
    tunings: [{ id: "eb", name: "Eb조", stringMidis: GAYAGEUM_25_EB, keyFifths: -3 }, { id: "ab", name: "Ab조", stringMidis: GAYAGEUM_25_AB, keyFifths: -4 }],
    // B-1 second answer: 25현 scores use the grand staff.
    grandStaff: true,
    listed: true,
  },
  "gayageum-12-sanjo": {
    id: "gayageum-12-sanjo", name: "12현 산조가야금", verified: true, range: { lowMidi: 43, highMidi: 74, label: "G2–D5" }, clefs: SUPPORTED_CLEFS,
    tunings: [{ id: "sanjo", name: "산조 조율", stringMidis: GAYAGEUM_12_SANJO, keyFifths: null }],
    grandStaff: false,
    listed: true,
  },
  /*
   * 산조대금 (user decision 2026-11-15: replaces 향피리). Waiting for a player's confirmation (user decision
   * 2026-11-16), so it is listed as "준비 중" and carries no range (decision 5). The researched candidate — 6관 본청,
   * C4–F6 (MIDI 60–89), sounding pitch, one treble staff — is recorded in `docs/INSTRUMENTS.md` §2-2 only.
   */
  "daegeum-sanjo": { id: "daegeum-sanjo", name: "산조대금", verified: false, range: null,
    clefs: SUPPORTED_CLEFS, tunings: [], grandStaff: false, listed: true },
};

export const DEFAULT_INSTRUMENT: InstrumentId = "piano";
/** The name every new part gets. Exports replace it with the instrument's name (B-5). */
export const DEFAULT_PART_NAME = "Melody";

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === "string" && (INSTRUMENT_IDS as readonly string[]).includes(value);
}

export function getInstrumentProfile(id: InstrumentId): InstrumentProfile {
  return PROFILES[id];
}

/** Instruments shown in lists, choosable or "준비 중": confirmed ones first, each group in `INSTRUMENT_IDS` order. */
export function listedInstruments(): readonly InstrumentProfile[] {
  return INSTRUMENT_IDS.map(getInstrumentProfile).filter((profile) => profile.listed)
    .sort((a, b) => Number(b.verified) - Number(a.verified));
}

/** A part without the field (v3 written by hand, or a fixture) is for the piano. */
export function instrumentOf(part: Part): InstrumentId {
  return part.instrument ?? DEFAULT_INSTRUMENT;
}

/**
 * The part's name in exports (B-5, decision 9): the instrument's name for an unnamed part, otherwise the part's own
 * name with the instrument after it, so a name given by hand is never dropped.
 */
export function exportPartName(part: Part): string {
  const instrument = getInstrumentProfile(instrumentOf(part)).name;
  const own = part.name.trim();
  return !own || own === DEFAULT_PART_NAME ? instrument : `${own} (${instrument})`;
}

/** Whether this part is drawn and exported on a grand staff (its instrument's convention). */
export function usesGrandStaff(part: Part): boolean {
  return getInstrumentProfile(instrumentOf(part)).grandStaff;
}
