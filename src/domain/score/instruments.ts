import { INSTRUMENT_IDS, SUPPORTED_CLEFS, type InstrumentId } from "@/domain/score/constants";
import type { Clef, Part } from "@/domain/score/types";

/* Instrument profiles (Phase 7 decision 6). Pure data: no browser, audio or UI. */

/** One open-string tuning of a zither: the sounding MIDI pitch of each string, lowest first. */
export interface InstrumentTuning {
  id: string;
  name: string;
  stringMidis: readonly number[];
}

export interface InstrumentProfile {
  id: InstrumentId;
  name: string;
  /**
   * False until the values are confirmed by a textbook or a player (B-1, `docs/INSTRUMENTS.md`). Unverified
   * profiles carry no range or tunings: researched-but-unconfirmed numbers are deliberately not shipped (decision 5).
   */
  verified: boolean;
  /** Sounding range, inclusive. */
  range: { lowMidi: number; highMidi: number } | null;
  clefs: readonly Clef[];
  tunings: readonly InstrumentTuning[];
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
  piano: { id: "piano", name: "피아노", verified: true, range: { lowMidi: 21, highMidi: 108 }, clefs: SUPPORTED_CLEFS, tunings: [] },
  "hyang-piri": { id: "hyang-piri", name: "향피리", verified: false, range: null, clefs: SUPPORTED_CLEFS, tunings: [] },
  "gayageum-25": {
    id: "gayageum-25", name: "25현 가야금", verified: true, range: { lowMidi: 39, highMidi: 80 }, clefs: SUPPORTED_CLEFS,
    tunings: [{ id: "eb", name: "Eb조", stringMidis: GAYAGEUM_25_EB }, { id: "ab", name: "Ab조", stringMidis: GAYAGEUM_25_AB }],
  },
  "gayageum-12-sanjo": {
    id: "gayageum-12-sanjo", name: "12현 산조가야금", verified: true, range: { lowMidi: 43, highMidi: 74 }, clefs: SUPPORTED_CLEFS,
    tunings: [{ id: "sanjo", name: "산조 조율", stringMidis: GAYAGEUM_12_SANJO }],
  },
};

export const DEFAULT_INSTRUMENT: InstrumentId = "piano";

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === "string" && (INSTRUMENT_IDS as readonly string[]).includes(value);
}

export function getInstrumentProfile(id: InstrumentId): InstrumentProfile {
  return PROFILES[id];
}

/** A part without the field (v3 written by hand, or a fixture) is for the piano. */
export function instrumentOf(part: Part): InstrumentId {
  return part.instrument ?? DEFAULT_INSTRUMENT;
}
