/**
 * Pitch frames → note segments in seconds (Phase 4, P4-03). Pure and deterministic.
 * Rests are the gaps between segments; converting seconds to ticks is the grid step (P4-04).
 */
import type { PitchFrame } from "./pitch-track";

export interface NoteSegmentOptions {
  /** Shortest note kept, seconds. Shorter pitch groups merge into a neighbour; shorter isolated segments are dropped. Default 0.06. */
  minNoteSeconds?: number;
  /** A voiced frame quieter than this fraction of the louder side's quieter peak (±100 ms) splits a note. Default 0.5. */
  levelDipRatio?: number;
}

export interface NoteSegment {
  startSeconds: number;
  endSeconds: number;
  /** Nearest MIDI number of `pitchMidi`. */
  midi: number;
  /** Median fractional MIDI of the segment's frames. */
  pitchMidi: number;
  /** Mean frame confidence, 0–1. */
  confidence: number;
  frameCount: number;
}

const DEFAULTS = { minNoteSeconds: 0.06, levelDipRatio: 0.5 };
/** How far each side of a frame is searched for the surrounding level, seconds. */
const LEVEL_WINDOW_SECONDS = 0.1;
/** Longest pitch movement treated as a glide rather than a note, seconds. */
const MAX_GLIDE_SECONDS = 0.15;
/** A frame further than this from the current group's mean pitch starts a new group. */
const NEW_NOTE_SEMITONES = 0.75;
/** Adjacent groups closer than this in median pitch are the same note (detune and vibrato straddling a semitone boundary). */
const SAME_NOTE_SEMITONES = 0.5;

interface Group { from: number; to: number; median: number }

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Voiced frames that sit in a level dip between two louder stretches of the same run. */
function levelDips(frames: readonly PitchFrame[], from: number, to: number, radius: number, ratio: number): boolean[] {
  const dips: boolean[] = [];
  for (let index = from; index < to; index += 1) {
    let before = 0, after = 0;
    for (let k = Math.max(from, index - radius); k < index; k += 1) before = Math.max(before, frames[k].rms);
    for (let k = index + 1; k <= Math.min(to - 1, index + radius); k += 1) after = Math.max(after, frames[k].rms);
    dips.push(before > 0 && after > 0 && frames[index].rms < ratio * Math.min(before, after));
  }
  return dips;
}

/** At least this much steady pitch movement (semitones) makes a short group a glide. */
const GLIDE_MIN_SEMITONES = 0.3;
/** Frame-to-frame movement against the glide direction tolerated as estimator jitter, semitones. */
const GLIDE_JITTER_SEMITONES = 0.05;

/** Whether the group's pitch moves monotonically (within jitter) by a clear amount in the direction of `target`. */
function isGlide(frames: readonly PitchFrame[], group: Group, target: number): boolean {
  if (group.to - group.from < 3) return false;
  const first = frames[group.from].midi!, last = frames[group.to - 1].midi!;
  const direction = Math.sign(last - first);
  if (Math.abs(last - first) < GLIDE_MIN_SEMITONES || direction !== Math.sign(target - first)) return false;
  for (let index = group.from + 1; index < group.to; index += 1) {
    if ((frames[index].midi! - frames[index - 1].midi!) * direction < -GLIDE_JITTER_SEMITONES) return false;
  }
  return true;
}

/** Groups one stretch of voiced frames by pitch, folding glides and groups shorter than `minFrames` into a neighbour. */
function groupByPitch(frames: readonly PitchFrame[], from: number, to: number, minFrames: number, maxGlideFrames: number): Group[] {
  const median = (a: number, b: number) => medianOf(frames.slice(a, b).map((frame) => frame.midi!));
  let groups: Group[] = [];
  // Hysteresis against the running mean of the current group, not rounding: vibrato and a constant detune that
  // straddle a semitone boundary stay one note, while a real step (≥ 1 semitone) starts a new one.
  for (let index = from; index < to;) {
    let sum = frames[index].midi!, end = index + 1;
    while (end < to && Math.abs(frames[end].midi! - sum / (end - index)) <= NEW_NOTE_SEMITONES) { sum += frames[end].midi!; end += 1; }
    groups.push({ from: index, to: end, median: median(index, end) });
    index = end;
  }
  const join = (left: number) => {
    const merged = { from: groups[left].from, to: groups[left + 1].to, median: median(groups[left].from, groups[left + 1].to) };
    groups = [...groups.slice(0, left), merged, ...groups.slice(left + 2)];
  };
  // A short group whose pitch moves steadily toward the next note is a glide into it (a scoop); one that moves
  // steadily away from the previous note at the end of a stretch is a fall-off. Neither is a note of its own.
  for (let index = 0; index < groups.length && groups.length > 1;) {
    const group = groups[index];
    if (group.to - group.from <= maxGlideFrames) {
      const next = groups[index + 1], previous = groups[index - 1];
      if (next && isGlide(frames, group, next.median)) { join(index); continue; }
      if (!next && previous && isGlide(frames, group, 2 * group.median - previous.median)) { join(index - 1); continue; }
    }
    index += 1;
  }
  for (;;) {
    let shortest = -1;
    groups.forEach((group, index) => {
      if (group.to - group.from < minFrames && (shortest < 0 || group.to - group.from < groups[shortest].to - groups[shortest].from)) shortest = index;
    });
    if (shortest < 0 || groups.length === 1) break;
    const left = groups[shortest - 1], right = groups[shortest + 1], self = groups[shortest];
    const intoLeft = !right || (left && Math.abs(left.median - self.median) <= Math.abs(right.median - self.median));
    join(intoLeft ? shortest - 1 : shortest);
  }
  for (let index = 0; index + 1 < groups.length;) {
    if (Math.abs(groups[index].median - groups[index + 1].median) < SAME_NOTE_SEMITONES) join(index);
    else index += 1;
  }
  return groups;
}

export function segmentNotes(frames: readonly PitchFrame[], options: NoteSegmentOptions = {}): NoteSegment[] {
  const minNoteSeconds = options.minNoteSeconds ?? DEFAULTS.minNoteSeconds;
  const levelDipRatio = options.levelDipRatio ?? DEFAULTS.levelDipRatio;
  if (!Number.isFinite(minNoteSeconds) || minNoteSeconds < 0) throw new RangeError(`minNoteSeconds must be a non-negative number: ${minNoteSeconds}`);
  if (!Number.isFinite(levelDipRatio) || levelDipRatio <= 0 || levelDipRatio >= 1) throw new RangeError(`levelDipRatio must be within (0, 1): ${levelDipRatio}`);
  for (let index = 1; index < frames.length; index += 1) {
    if (!(frames[index].timeSeconds > frames[index - 1].timeSeconds)) throw new RangeError(`Frame ${index} is not after frame ${index - 1}`);
  }
  if (frames.length === 0) return [];
  const hop = frames.length > 1 ? medianOf(frames.slice(1).map((frame, index) => frame.timeSeconds - frames[index].timeSeconds)) : 0.01;
  const minFrames = Math.max(1, Math.round(minNoteSeconds / hop));
  const radius = Math.max(1, Math.round(LEVEL_WINDOW_SECONDS / hop));
  const maxGlideFrames = Math.max(1, Math.round(MAX_GLIDE_SECONDS / hop));

  const segments: NoteSegment[] = [];
  const emit = (from: number, to: number) => {
    if (to - from < minFrames) return;
    const slice = frames.slice(from, to);
    const pitchMidi = medianOf(slice.map((frame) => frame.midi!));
    segments.push({
      startSeconds: frames[from].timeSeconds - hop / 2, endSeconds: frames[to - 1].timeSeconds + hop / 2,
      midi: Math.round(pitchMidi), pitchMidi,
      confidence: slice.reduce((total, frame) => total + frame.confidence, 0) / slice.length, frameCount: slice.length,
    });
  };
  for (let runFrom = 0; runFrom < frames.length;) {
    if (!frames[runFrom].voiced || frames[runFrom].midi === null) { runFrom += 1; continue; }
    let runTo = runFrom;
    while (runTo < frames.length && frames[runTo].voiced && frames[runTo].midi !== null) runTo += 1;
    // Level dips separate repeated notes; each stretch between dips is then split by pitch.
    const dips = levelDips(frames, runFrom, runTo, radius, levelDipRatio);
    for (let from = runFrom; from < runTo;) {
      if (dips[from - runFrom]) { from += 1; continue; }
      let to = from;
      while (to < runTo && !dips[to - runFrom]) to += 1;
      for (const group of groupByPitch(frames, from, to, minFrames, maxGlideFrames)) emit(group.from, group.to);
      from = to;
    }
    runFrom = runTo;
  }
  return segments;
}
