import { createNoteEvent } from "./create";
import { MAX_NOTATION_MEASURES, NOTATION_UNIT_TICKS } from "./notation";
import { MIDI_MAX, MIDI_MIN, SUPPORTED_DENOMINATORS, TICKS_PER_QUARTER } from "./constants";
import type { ClipboardPayload } from "./clipboard";
import type { ImportedMeasure, ImportedNote, ImportedPart, ImportedScore } from "./import-model";
import type { KeySignature, NoteEvent, TimeSignature } from "./types";
import { KEY_SIGNATURE_OPTIONS } from "../music-theory/key-signatures";
import { isAlterInRange, midiFromSpelling } from "../music-theory/pitch";

/*
 * One melody line from an imported score (Phase 8 step 1, spec §5.2–5.4). Picks one part, keeps staff 1 unless
 * the staves never overlap, drops grace/cue notes, joins ties, rounds to a sixteenth grid, then keeps the
 * highest sounding note at every moment (skyline). Everything changed or left out is reported as a notice
 * so the person sees what the import did. The result is a ClipboardPayload pasted through the normal command.
 */

export const IMPORT_GRID_TICKS = 240;
const DEFAULT_TEMPO = 90;
const MIN_TEMPO = 20;
const MAX_TEMPO = 400;
const MAX_TITLE_LENGTH = 120;
const DEFAULT_TITLE = "가져온 악보";

export const IMPORT_NOTICE_CODES = [
  "LOWER_STAFF_DROPPED", "CHORD_NOTES_DROPPED", "OVERLAP_TRUNCATED", "ROUNDED_TO_GRID", "DROPPED_ZERO_LENGTH",
  "GRACE_DROPPED", "CUE_DROPPED", "PITCH_UNSUPPORTED", "TIME_SIGNATURE_CHANGED", "KEY_CHANGED", "MODE_AS_MAJOR",
  "TEMPO_CLAMPED", "TEMPO_CHANGED", "PICKUP_PADDED", "REPEATS_IGNORED", "LYRICS_IGNORED", "DIRECTIONS_IGNORED",
] as const;
export type ImportNoticeCode = (typeof IMPORT_NOTICE_CODES)[number];

export interface ImportNotice { code: ImportNoticeCode; count: number; measures: string[]; detail?: string }

export interface MelodySettings { title: string; tempoBpm: number; timeSignature: TimeSignature; keySignature: KeySignature }

export type MelodyExtraction =
  | { ok: true; settings: MelodySettings; clipboard: ClipboardPayload; notices: ImportNotice[]; noteCount: number;
      parts: { index: number; name: string; noteCount: number }[]; partIndex: number }
  | { ok: false; code: "NO_NOTES" | "UNSUPPORTED_KEY" | "UNSUPPORTED_TIME" | "TOO_LONG"; message: string };

interface Working { start: number; end: number; midi: number; source: ImportedNote }

const playable = (note: ImportedNote) => note.pitch !== null && !note.grace && !note.cue;

class NoticeLog {
  private readonly entries = new Map<ImportNoticeCode, ImportNotice>();
  add(code: ImportNoticeCode, measure?: string, detail?: string): void {
    const entry = this.entries.get(code) ?? { code, count: 0, measures: [] };
    entry.count += 1;
    if (measure !== undefined && !entry.measures.includes(measure)) entry.measures.push(measure);
    if (detail !== undefined) entry.detail = detail;
    this.entries.set(code, entry);
  }
  set(code: ImportNoticeCode, count: number): void {
    if (count > 0) this.entries.set(code, { code, count, measures: [] });
  }
  list(): ImportNotice[] {
    return IMPORT_NOTICE_CODES.flatMap((code) => this.entries.get(code) ?? []);
  }
}

function measureAt(measures: readonly ImportedMeasure[], tick: number): string | undefined {
  let found: ImportedMeasure | undefined;
  for (const measure of measures) if (measure.startTick <= tick) found = measure;
  return found?.number;
}

function validMidi(note: ImportedNote): number | null {
  const pitch = note.pitch!;
  if (!isAlterInRange(pitch.alter) || !Number.isInteger(pitch.octave)) return null;
  const midi = midiFromSpelling(pitch.step, pitch.alter, pitch.octave);
  return midi >= MIDI_MIN && midi <= MIDI_MAX ? midi : null;
}

/** tieStart → tieStop of the same pitch become one note spanning both. */
function joinTies(notes: readonly ImportedNote[]): { note: ImportedNote; end: number }[] {
  const out: { note: ImportedNote; end: number }[] = [];
  const open = new Map<string, { note: ImportedNote; end: number }>();
  const key = (note: ImportedNote) => `${note.pitch!.step}${note.pitch!.alter}/${note.pitch!.octave}`;
  for (const note of [...notes].sort((a, b) => a.startTick - b.startTick)) {
    const pending = note.tieStop ? open.get(key(note)) : undefined;
    if (pending && Math.abs(pending.end - note.startTick) < 1e-6) {
      pending.end = note.startTick + note.durationTicks;
      if (!note.tieStart) open.delete(key(note));
      continue;
    }
    const entry = { note, end: note.startTick + note.durationTicks };
    out.push(entry);
    if (note.tieStart) open.set(key(note), entry);
  }
  return out;
}

function hasOverlap(notes: readonly ImportedNote[]): boolean {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  let end = -Infinity;
  for (const note of sorted) {
    if (note.startTick < end) return true;
    end = Math.max(end, note.startTick + note.durationTicks);
  }
  return false;
}

function findKey(fifths: number, mode: "major" | "minor"): KeySignature {
  return KEY_SIGNATURE_OPTIONS.find((option) => option.key.fifths === fifths && option.key.mode === mode)!.key;
}

export function extractMelody(score: ImportedScore, options: { partIndex?: number; fallbackTitle?: string } = {}): MelodyExtraction {
  const parts = score.parts.map((part, index) => ({ index, name: part.name, noteCount: part.notes.filter(playable).length }));
  const partIndex = options.partIndex ?? Math.max(0, parts.findIndex((part) => part.noteCount > 0));
  const part: ImportedPart | undefined = score.parts[partIndex];
  if (!part) return { ok: false, code: "NO_NOTES", message: "선택한 파트가 없습니다." };
  const log = new NoticeLog();

  // Time signature: the first one; later changes are re-barred to it.
  const firstTime = part.timeSignatures[0] ?? { tick: 0, numerator: 4, denominator: 4 };
  if (!Number.isInteger(firstTime.numerator) || firstTime.numerator < 1
    || !(SUPPORTED_DENOMINATORS as readonly number[]).includes(firstTime.denominator)) {
    return { ok: false, code: "UNSUPPORTED_TIME", message: `${firstTime.numerator}/${firstTime.denominator} 박자는 아직 지원하지 않습니다.` };
  }
  const timeSignature = { numerator: firstTime.numerator, denominator: firstTime.denominator };
  const barTicks = (timeSignature.numerator * 4 * TICKS_PER_QUARTER) / timeSignature.denominator;
  part.timeSignatures.slice(1).forEach((time, index) => {
    const previous = part.timeSignatures[index]!;
    if (time.numerator !== previous.numerator || time.denominator !== previous.denominator) {
      log.add("TIME_SIGNATURE_CHANGED", measureAt(part.measures, time.tick));
    }
  });

  // Key: the first one; modes other than major/minor are read as major with the same fifths.
  const firstKey = part.keys[0] ?? { tick: 0, fifths: 0, mode: null, nonStandard: false };
  if (firstKey.nonStandard || !Number.isInteger(firstKey.fifths) || firstKey.fifths < -7 || firstKey.fifths > 7) {
    return { ok: false, code: "UNSUPPORTED_KEY", message: "이 악보의 조표는 아직 지원하지 않습니다." };
  }
  const mode = firstKey.mode?.toLowerCase() ?? null;
  if (mode !== null && mode !== "major" && mode !== "minor") log.add("MODE_AS_MAJOR", undefined, firstKey.mode!);
  const keySignature = findKey(firstKey.fifths, mode === "minor" ? "minor" : "major");
  part.keys.slice(1).forEach((key, index) => {
    const previous = part.keys[index]!;
    if (key.fifths !== previous.fifths || key.mode !== previous.mode || key.nonStandard !== previous.nonStandard) {
      log.add("KEY_CHANGED", measureAt(part.measures, key.tick));
    }
  });

  // Tempo: the first mark, else 90; clamped to the Score range.
  const rawTempo = score.tempos[0]?.bpm ?? DEFAULT_TEMPO;
  const tempoBpm = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(rawTempo)));
  if (tempoBpm !== rawTempo) log.add("TEMPO_CLAMPED", undefined, String(rawTempo));
  for (const tempo of score.tempos.slice(1)) log.add("TEMPO_CHANGED", measureAt(part.measures, tempo.tick));

  // Pickup: shift everything so the first (short) bar ends where a full bar would.
  const first = part.measures[0];
  const pad = first && first.lengthTicks < barTicks ? barTicks - first.lengthTicks : 0;
  if (pad > 0) log.add("PICKUP_PADDED", first!.number);

  // Notes: grace and cue out, rests silently out.
  for (const note of part.notes) {
    if (note.pitch === null) continue;
    if (note.grace) log.add("GRACE_DROPPED", note.measureNumber);
    else if (note.cue) log.add("CUE_DROPPED", note.measureNumber);
  }
  let candidates = part.notes.filter(playable);
  if (part.staves > 1 || candidates.some((note) => note.staff !== 1)) {
    if (hasOverlap(candidates)) {
      for (const note of candidates) if (note.staff !== 1) log.add("LOWER_STAFF_DROPPED", note.measureNumber);
      candidates = candidates.filter((note) => note.staff === 1);
    }
  }

  const working: Working[] = [];
  for (const { note, end } of joinTies(candidates)) {
    const midi = validMidi(note);
    if (midi === null) { log.add("PITCH_UNSUPPORTED", note.measureNumber); continue; }
    const rawStart = note.startTick + pad;
    const rawEnd = end + pad;
    // Spec §5.2: only times the notation cannot write exactly (fractional, tuplets…) move to the 16th grid.
    const exact = (tick: number) => Number.isInteger(tick) && tick % NOTATION_UNIT_TICKS === 0;
    const toGrid = (tick: number) => (exact(tick) ? tick : Math.round(tick / IMPORT_GRID_TICKS) * IMPORT_GRID_TICKS);
    const start = toGrid(rawStart);
    const roundedEnd = toGrid(rawEnd);
    if (roundedEnd <= start) { log.add("DROPPED_ZERO_LENGTH", note.measureNumber); continue; }
    if (start !== rawStart || roundedEnd !== rawEnd) log.add("ROUNDED_TO_GRID", note.measureNumber);
    working.push({ start, end: roundedEnd, midi, source: note });
  }

  // Skyline: one note per start (the highest); overlaps resolved in favour of the higher note.
  working.sort((a, b) => a.start - b.start || b.midi - a.midi);
  const line: Working[] = [];
  // Same-start notes are judged by their original start: a lower note pushed later must not hide the next one.
  let lastInputStart: number | null = null;
  for (const next of working) {
    if (lastInputStart === next.start) { log.add("CHORD_NOTES_DROPPED", next.source.measureNumber); continue; }
    lastInputStart = next.start;
    let current: Working | null = { ...next };
    while (current && line.length > 0 && line.at(-1)!.end > current.start) {
      const previous = line.at(-1)!;
      log.add("OVERLAP_TRUNCATED", current.source.measureNumber);
      if (current.midi >= previous.midi) {
        previous.end = current.start;
        if (previous.end <= previous.start) line.pop();
        else break;
      } else {
        current.start = previous.end;
        if (current.end <= current.start) current = null;
      }
    }
    if (current) line.push(current);
  }

  log.set("REPEATS_IGNORED", score.ignored.repeats);
  log.set("LYRICS_IGNORED", score.ignored.lyrics);
  log.set("DIRECTIONS_IGNORED", score.ignored.directions);

  if (line.length === 0) return { ok: false, code: "NO_NOTES", message: "가져올 음이 없습니다." };
  const lastEnd = line.at(-1)!.end;
  const measureCount = Math.ceil(lastEnd / barTicks);
  if (measureCount > MAX_NOTATION_MEASURES) {
    return { ok: false, code: "TOO_LONG", message: `악보가 너무 깁니다 (${measureCount}마디, 최대 ${MAX_NOTATION_MEASURES}마디).` };
  }
  const events: NoteEvent[] = line.map((item, index) => createNoteEvent({
    id: `import-${index + 1}`, step: item.source.pitch!.step, alter: item.source.pitch!.alter, octave: item.source.pitch!.octave,
    startTick: item.start, durationTicks: item.end - item.start, provenance: { source: "import" },
  }));
  const title = (score.title?.trim() || options.fallbackTitle?.trim() || DEFAULT_TITLE).slice(0, MAX_TITLE_LENGTH);
  return {
    ok: true,
    settings: { title, tempoBpm, timeSignature, keySignature },
    clipboard: { lengthTicks: measureCount * barTicks, events, ties: [] },
    notices: log.list(),
    noteCount: events.length,
    parts,
    partIndex,
  };
}
