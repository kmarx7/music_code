import { estimatePitchTrack } from "./pitch-track";

/** Length of recent audio used for the live display: enough for a few frames at the lowest searched pitch. */
export const LIVE_PITCH_WINDOW_SECONDS = 0.12;

export interface LivePitch {
  /** Nearest MIDI semitone. */
  midi: number;
  /** Offset from that semitone, −50..50 cents. */
  cents: number;
}

/**
 * Display-only pitch of the latest audio (PRD MVP-002 "live estimated pitch"). Uses the same detector as
 * transcription on a short window and reports the median of the voiced frames, or null when nothing is voiced.
 * It never decides candidate notes; transcription still analyses the whole take afterwards.
 */
export function estimateLivePitch(samples: Float32Array, sampleRate: number): LivePitch | null {
  const voiced = estimatePitchTrack(samples, sampleRate)
    .flatMap((frame) => (frame.midi === null ? [] : [frame.midi]))
    .sort((a, b) => a - b);
  if (!voiced.length) return null;
  const median = voiced[Math.floor(voiced.length / 2)];
  const midi = Math.round(median);
  if (midi < 0 || midi > 127) return null;
  return { midi, cents: Math.round((median - midi) * 100) };
}
