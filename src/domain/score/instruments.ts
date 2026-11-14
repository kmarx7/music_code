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

const PROFILES: Record<InstrumentId, InstrumentProfile> = {
  piano: { id: "piano", name: "피아노", verified: true, range: { lowMidi: 21, highMidi: 108 }, clefs: SUPPORTED_CLEFS, tunings: [] },
  "hyang-piri": { id: "hyang-piri", name: "향피리", verified: false, range: null, clefs: SUPPORTED_CLEFS, tunings: [] },
  "gayageum-25": { id: "gayageum-25", name: "25현 가야금", verified: false, range: null, clefs: SUPPORTED_CLEFS, tunings: [] },
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
