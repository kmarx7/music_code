import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { listedInstruments, selectableInstruments } from "@/domain/score";
import type { InstrumentId, KeySignature, TimeSignature } from "@/domain/score";

/** Meters a new score can start in; the same list the editor's settings offer. */
export const SETUP_METERS = ["2/4", "3/4", "4/4", "6/8"] as const;
/** Phase 7 decision 2: 4/4 · 90 BPM · C major · piano. */
export const SETUP_DEFAULTS = { title: "새 악보", meter: "4/4", tempoBpm: 90, keyId: "major:0", instrument: "piano" } as const;

const SELECTABLE = new Set<InstrumentId>(selectableInstruments().map((profile) => profile.id));
/**
 * Target instruments (B-6): the listed profiles, confirmed ones choosable and any unconfirmed one shown as "준비 중".
 * A retired instrument (향피리) is not listed at all.
 */
export const SETUP_INSTRUMENTS: readonly { id: InstrumentId; label: string; available: boolean }[] = listedInstruments().map((profile) => ({
  id: profile.id, available: SELECTABLE.has(profile.id), label: SELECTABLE.has(profile.id) ? profile.name : `${profile.name} (준비 중)`,
}));

export interface ScoreSetup {
  title: string;
  tempoBpm: number;
  timeSignature: TimeSignature;
  keySignature: KeySignature;
  instrument: InstrumentId;
}

export type ScoreSetupResult = { ok: true; setup: ScoreSetup } | { ok: false; message: string };

/** Reads the setup form. Anything missing falls back to the defaults; anything invalid is refused with a message. */
export function parseScoreSetup(values: { title?: unknown; meter?: unknown; tempo?: unknown; key?: unknown; instrument?: unknown }): ScoreSetupResult {
  const title = typeof values.title === "string" ? values.title.trim() : SETUP_DEFAULTS.title;
  if (!title) return { ok: false, message: "제목을 입력해 주세요." };
  const meter = typeof values.meter === "string" ? values.meter : SETUP_DEFAULTS.meter;
  if (!(SETUP_METERS as readonly string[]).includes(meter)) return { ok: false, message: "지원하지 않는 박자입니다." };
  const tempoBpm = values.tempo === undefined || values.tempo === "" ? SETUP_DEFAULTS.tempoBpm : Number(values.tempo);
  if (!Number.isInteger(tempoBpm) || tempoBpm < 20 || tempoBpm > 400) return { ok: false, message: "템포는 20–400 사이의 정수로 입력해 주세요." };
  const keyId = typeof values.key === "string" ? values.key : SETUP_DEFAULTS.keyId;
  const key = KEY_SIGNATURE_OPTIONS.find((option) => option.id === keyId);
  if (!key) return { ok: false, message: "지원하지 않는 조성입니다." };
  const instrument = values.instrument === undefined || values.instrument === null ? SETUP_DEFAULTS.instrument : values.instrument;
  const chosen = SETUP_INSTRUMENTS.find((candidate) => candidate.id === instrument && candidate.available);
  if (!chosen) return { ok: false, message: `고를 수 없는 악기입니다. ${SETUP_INSTRUMENTS.filter((candidate) => candidate.available).map((candidate) => candidate.label).join(", ")} 중에서 골라 주세요.` };
  const [numerator, denominator] = meter.split("/").map(Number);
  return { ok: true, setup: { title, tempoBpm, timeSignature: { numerator, denominator }, keySignature: key.key, instrument: chosen.id } };
}
