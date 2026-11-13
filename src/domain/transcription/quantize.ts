/**
 * Note segments in seconds → grid-aligned candidate notes in ticks, and the candidate payload (Phase 4, P4-04).
 * Quantising is the explicit, reported snapping of performed timing to the grid; it never touches a stored Score.
 * The payload is a ClipboardPayload, so confirming a transcription reuses the PasteEvents rules (decision 5).
 */
import { spellMidiInKey } from "@/domain/music-theory/spell";
import type { ClipboardPayload } from "@/domain/score/clipboard";
import { SUPPORTED_DENOMINATORS, TICKS_PER_QUARTER } from "@/domain/score/constants";
import { createRestEvent, measureTicks } from "@/domain/score/create";
import type { KeySignature, NoteEvent, ScoreEvent, TimeSignature } from "@/domain/score/types";
import type { NoteSegment } from "./segment";

export interface QuantizeOptions {
  tempoBpm: number;
  timeSignature: TimeSignature;
  /** Clip time of tick 0, seconds (the end of the count-in). Default 0. */
  downbeatSeconds?: number;
  /** Grid step in ticks. Must divide a quarter note and the measure. Default 240 (a 16th note). */
  gridTicks?: number;
}

export interface QuantizedNote {
  midi: number;
  startTick: number;
  durationTicks: number;
  confidence: number;
  /** Seconds the onset moved to reach the grid (grid − performed). */
  onsetShiftSeconds: number;
  /** Seconds the end moved to reach the grid, including any trimming for the next note. */
  endShiftSeconds: number;
}

export type QuantizeDropReason = "BEFORE_DOWNBEAT" | "COLLISION";

export interface QuantizeResult {
  /** Monophonic, ordered, non-overlapping. */
  notes: QuantizedNote[];
  /** End of the last note (0 when there is none). */
  lengthTicks: number;
  /** Input segments that produced no note, by index into the input. */
  dropped: { index: number; reason: QuantizeDropReason }[];
}

export const DEFAULT_GRID_TICKS = TICKS_PER_QUARTER / 4;

export function quantizeSegments(segments: readonly NoteSegment[], options: QuantizeOptions): QuantizeResult {
  const { tempoBpm, timeSignature } = options;
  const downbeat = options.downbeatSeconds ?? 0;
  const grid = options.gridTicks ?? DEFAULT_GRID_TICKS;
  if (!Number.isFinite(tempoBpm) || tempoBpm <= 0) throw new RangeError(`Invalid tempo: ${tempoBpm}`);
  if (!Number.isInteger(timeSignature.numerator) || timeSignature.numerator < 1 ||
    !(SUPPORTED_DENOMINATORS as readonly number[]).includes(timeSignature.denominator)) {
    throw new RangeError(`Unsupported time signature: ${timeSignature.numerator}/${timeSignature.denominator}`);
  }
  if (!Number.isFinite(downbeat) || downbeat < 0) throw new RangeError(`Invalid downbeat: ${downbeat}`);
  const bar = measureTicks(timeSignature);
  if (!Number.isInteger(grid) || grid <= 0 || TICKS_PER_QUARTER % grid !== 0 || bar % grid !== 0) {
    throw new RangeError(`Grid must divide a quarter note and the measure: ${grid}`);
  }
  const secondsPerTick = 60 / tempoBpm / TICKS_PER_QUARTER;
  const toGrid = (seconds: number) => Math.round((seconds - downbeat) / secondsPerTick / grid) * grid;
  const toSeconds = (tick: number) => downbeat + tick * secondsPerTick;

  const dropped: QuantizeResult["dropped"] = [];
  const placed: (QuantizedNote & { index: number; performedSeconds: number; performedEnd: number })[] = [];
  segments.forEach((segment, index) => {
    // Judge on performed time: a short note right on the downbeat may round its end to tick 0 without being early.
    if (segment.endSeconds <= downbeat) { dropped.push({ index, reason: "BEFORE_DOWNBEAT" }); return; }
    const start = Math.max(0, toGrid(segment.startSeconds));
    let end = toGrid(segment.endSeconds);
    if (end <= start) end = start + grid;
    placed.push({ index, midi: segment.midi, startTick: start, durationTicks: end - start, confidence: segment.confidence,
      onsetShiftSeconds: toSeconds(start) - segment.startSeconds, endShiftSeconds: toSeconds(end) - segment.endSeconds,
      performedSeconds: segment.endSeconds - segment.startSeconds, performedEnd: segment.endSeconds });
  });
  placed.sort((a, b) => a.startTick - b.startTick || a.index - b.index);

  const notes: typeof placed = [];
  for (const note of placed) {
    const previous = notes.at(-1);
    if (previous && note.startTick === previous.startTick) {
      // Two segments on one grid point: keep the one that was performed longer.
      const [kept, lost] = note.performedSeconds > previous.performedSeconds ? [note, previous] : [previous, note];
      dropped.push({ index: lost.index, reason: "COLLISION" });
      notes[notes.length - 1] = kept;
      continue;
    }
    if (previous && previous.startTick + previous.durationTicks > note.startTick) {
      previous.durationTicks = note.startTick - previous.startTick;
      previous.endShiftSeconds = toSeconds(note.startTick) - previous.performedEnd;
    }
    notes.push(note);
  }
  dropped.sort((a, b) => a.index - b.index);
  const last = notes.at(-1);
  return {
    notes: notes.map(({ midi, startTick, durationTicks, confidence, onsetShiftSeconds, endShiftSeconds }) =>
      ({ midi, startTick, durationTicks, confidence, onsetShiftSeconds, endShiftSeconds })),
    lengthTicks: last ? last.startTick + last.durationTicks : 0,
    dropped,
  };
}

export interface CandidatePayloadOptions {
  /** Key used to spell pitches (the target Part's key signature). */
  key: KeySignature;
  /** Meter used to split rests at barlines (the target Part's meter). */
  timeSignature: TimeSignature;
  /** Fresh event IDs, injected by the caller so the domain creates no randomness. */
  nextId: () => string;
}

/**
 * Candidate payload: notes plus rests for every gap, relative to tick 0 of the take. Rests are split at barlines of a
 * measure-aligned paste; notes are not split here because PasteEvents re-splits a note that crosses a barline.
 */
export function transcriptionToClipboard(result: QuantizeResult, options: CandidatePayloadOptions): ClipboardPayload {
  const bar = measureTicks(options.timeSignature);
  const events: ScoreEvent[] = [];
  const rest = (from: number, to: number) => {
    for (let start = from; start < to;) {
      const end = Math.min(to, (Math.floor(start / bar) + 1) * bar);
      events.push(createRestEvent({ id: options.nextId(), startTick: start, durationTicks: end - start }));
      start = end;
    }
  };
  let cursor = 0;
  for (const note of result.notes) {
    rest(cursor, note.startTick);
    const event: NoteEvent = {
      kind: "note", id: options.nextId(), pitch: spellMidiInKey(note.midi, options.key),
      startTick: note.startTick, durationTicks: note.durationTicks, velocity: 96,
      provenance: { source: "transcription", confidence: note.confidence },
    };
    events.push(event);
    cursor = note.startTick + note.durationTicks;
  }
  return { lengthTicks: result.lengthTicks, events, ties: [] };
}
