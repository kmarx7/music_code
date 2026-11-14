/** v2: Part.ties(붙임줄 연결) 추가 — ADR-009. v3: Part.instrument 추가 — Phase 7 결정 6 */
export const SCORE_SCHEMA_VERSION = 3;

/** 읽을 때 현재 버전으로 옮기는 이전 버전(v1, v2). */
export const MIGRATABLE_SCHEMA_VERSIONS = [1, 2] as const;

export const TICKS_PER_QUARTER = 960;

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

export const MAX_ALTER = 2;

export const SUPPORTED_CLEFS = ["treble", "bass"] as const;

/** Instruments a part can be written for (v3, Phase 7 decision 6). Profiles live in `instruments.ts`. */
export const INSTRUMENT_IDS = ["piano", "hyang-piri", "gayageum-25"] as const;
export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export const SUPPORTED_MODES = ["major", "minor"] as const;

export const SUPPORTED_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const;
