import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import type { KeySignature, TimeSignature } from "@/domain/score";

/** Meters a new score can start in; the same list the editor's settings offer. */
export const SETUP_METERS = ["2/4", "3/4", "4/4", "6/8"] as const;
/** Phase 7 decision 2: 4/4 · 90 BPM · C major · piano. */
export const SETUP_DEFAULTS = { title: "새 악보", meter: "4/4", tempoBpm: 90, keyId: "major:0", instrument: "piano" } as const;

/** Target instruments. Only the piano is selectable until Track B confirms the Korean instrument values (B-1). */
export const SETUP_INSTRUMENTS: readonly { id: string; label: string; available: boolean }[] = [
  { id: "piano", label: "피아노", available: true },
  { id: "gayageum-25", label: "25현 가야금 (준비 중)", available: false },
  { id: "gayageum-12-sanjo", label: "12현 산조가야금 (준비 중)", available: false },
  { id: "hyang-piri", label: "향피리 (준비 중)", available: false },
];

export interface ScoreSetup {
  title: string;
  tempoBpm: number;
  timeSignature: TimeSignature;
  keySignature: KeySignature;
}

export type ScoreSetupResult = { ok: true; setup: ScoreSetup } | { ok: false; message: string };

/** Reads the setup form. Anything missing falls back to the defaults; anything invalid is refused with a message. */
export function parseScoreSetup(values: { title?: unknown; meter?: unknown; tempo?: unknown; key?: unknown }): ScoreSetupResult {
  const title = typeof values.title === "string" ? values.title.trim() : SETUP_DEFAULTS.title;
  if (!title) return { ok: false, message: "제목을 입력해 주세요." };
  const meter = typeof values.meter === "string" ? values.meter : SETUP_DEFAULTS.meter;
  if (!(SETUP_METERS as readonly string[]).includes(meter)) return { ok: false, message: "지원하지 않는 박자입니다." };
  const tempoBpm = values.tempo === undefined || values.tempo === "" ? SETUP_DEFAULTS.tempoBpm : Number(values.tempo);
  if (!Number.isInteger(tempoBpm) || tempoBpm < 20 || tempoBpm > 400) return { ok: false, message: "템포는 20–400 사이의 정수로 입력해 주세요." };
  const keyId = typeof values.key === "string" ? values.key : SETUP_DEFAULTS.keyId;
  const key = KEY_SIGNATURE_OPTIONS.find((option) => option.id === keyId);
  if (!key) return { ok: false, message: "지원하지 않는 조성입니다." };
  const [numerator, denominator] = meter.split("/").map(Number);
  return { ok: true, setup: { title, tempoBpm, timeSignature: { numerator, denominator }, keySignature: key.key } };
}
