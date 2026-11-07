/** v2: Part.ties(붙임줄 연결) 추가 — ADR-009 */
export const SCORE_SCHEMA_VERSION = 2;

/** v0/v1 문서를 읽을 수 있도록 유지하는 마이그레이션 대상 버전. */
export const MIGRATABLE_SCHEMA_VERSIONS = [1] as const;

export const TICKS_PER_QUARTER = 960;

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

export const MAX_ALTER = 2;

export const SUPPORTED_CLEFS = ["treble", "bass"] as const;

export const SUPPORTED_MODES = ["major", "minor"] as const;

export const SUPPORTED_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const;
