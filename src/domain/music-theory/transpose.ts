import type { KeySignature, Pitch } from "@/domain/score/types";
import { KEY_SIGNATURE_OPTIONS, isSupportedKeySignature } from "./key-signatures";
import { DIATONIC_STEPS, createPitch, isAlterInRange, isDiatonicStep, isPitchInMidiRange, midiFromSpelling } from "./pitch";

/** Letter displacement is zero-based: a major second is {2, 1}, an octave {12, 7}. */
export interface TransposeInterval {
  readonly deltaSemitones: number;
  readonly diatonicSteps: number;
}
export type TransposeDirection = "nearest" | "up" | "down";
export type TransposeErrorCode = "INVALID_TRANSPOSE" | "INVALID_PITCH" | "INVALID_SCORE"
  | "UNSUPPORTED_KEY_SIGNATURE" | "MODE_CHANGE_NOT_SUPPORTED" | "MIDI_OUT_OF_RANGE" | "PITCH_NOT_REPRESENTABLE";
export interface TransposeError {
  code: TransposeErrorCode;
  message: string;
  partId?: string;
  eventId?: string;
}
export type TransposeResult<T> = { ok: true; value: T } | { ok: false; error: TransposeError };

function fail(code: TransposeErrorCode, message: string): { ok: false; error: TransposeError } {
  return { ok: false, error: { code, message } };
}
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const validInterval = (interval: TransposeInterval) => Number.isSafeInteger(interval.deltaSemitones) && Number.isSafeInteger(interval.diatonicSteps);

/** Derive the written interval as well as its sounding distance. Same pitch class means zero, not an octave. */
export function intervalBetweenKeys(
  source: KeySignature, target: KeySignature, direction: TransposeDirection = "nearest",
): TransposeResult<TransposeInterval> {
  if (!isSupportedKeySignature(source) || !isSupportedKeySignature(target)) {
    return fail("UNSUPPORTED_KEY_SIGNATURE", "지원되는 원본·목표 조표가 필요합니다.");
  }
  if (source.mode !== target.mode) return fail("MODE_CHANGE_NOT_SUPPORTED", "장조와 단조 간 변환은 지원하지 않습니다.");
  if (!["nearest", "up", "down"].includes(direction)) return fail("INVALID_TRANSPOSE", "조옮김 방향이 올바르지 않습니다.");
  const raw = midiFromSpelling(target.tonic, target.alter, 4) - midiFromSpelling(source.tonic, source.alter, 4);
  const up = modulo(raw, 12);
  const down = up === 0 ? 0 : up - 12;
  const deltaSemitones = direction === "up" ? up : direction === "down" ? down : up <= 6 ? up : down;
  const octaveShift = (deltaSemitones - raw) / 12;
  const diatonicSteps = DIATONIC_STEPS.indexOf(target.tonic) - DIATONIC_STEPS.indexOf(source.tonic) + octaveShift * 7;
  return { ok: true, value: { deltaSemitones, diatonicSteps } };
}

/** This calculation deliberately does not pick an enharmonic independently for each note. */
function moveSpelling(step: Pitch["step"], alter: number, octave: number, interval: TransposeInterval) {
  const coordinate = octave * 7 + DIATONIC_STEPS.indexOf(step) + interval.diatonicSteps;
  const nextOctave = Math.floor(coordinate / 7);
  const nextStep = DIATONIC_STEPS[modulo(coordinate, 7)];
  const midi = midiFromSpelling(step, alter, octave) + interval.deltaSemitones;
  const nextAlter = midi - midiFromSpelling(nextStep, 0, nextOctave);
  return { midi, step: nextStep, alter: nextAlter, octave: nextOctave, coordinate };
}

export function transposePitch(pitch: Pitch, interval: TransposeInterval): TransposeResult<Pitch> {
  if (!validInterval(interval)) return fail("INVALID_TRANSPOSE", "반음·음이름 이동량은 안전한 정수여야 합니다.");
  if (!isDiatonicStep(pitch.step) || !Number.isInteger(pitch.octave) || pitch.octave < 0 || pitch.octave > 9 ||
      !isAlterInRange(pitch.alter) || !isPitchInMidiRange(pitch.midi) ||
      midiFromSpelling(pitch.step, pitch.alter, pitch.octave) !== pitch.midi) {
    return fail("INVALID_PITCH", "원본 Pitch의 MIDI와 표기가 유효하고 일치해야 합니다.");
  }
  const midi = pitch.midi + interval.deltaSemitones;
  if (!isPitchInMidiRange(midi)) return fail("MIDI_OUT_OF_RANGE", "조옮김 결과가 MIDI 0~127 범위를 벗어납니다.");
  const next = moveSpelling(pitch.step, pitch.alter, pitch.octave, interval);
  if (!Number.isSafeInteger(next.coordinate) || next.octave < 0 || next.octave > 9 || !isAlterInRange(next.alter)) {
    return fail("PITCH_NOT_REPRESENTABLE", "필요한 음이름은 octave 0~9, alter -2~2 범위에서 표현할 수 없습니다.");
  }
  const result = createPitch(next.step, next.alter, next.octave);
  if (result.midi !== midi) return fail("PITCH_NOT_REPRESENTABLE", "MIDI와 표기가 일치하지 않습니다.");
  return { ok: true, value: result };
}

/** Keys have no register: do not apply the Pitch octave/MIDI limits to a key's reference tonic. */
export function transposeKeySignature(key: KeySignature, interval: TransposeInterval): TransposeResult<KeySignature> {
  if (!isSupportedKeySignature(key)) return fail("UNSUPPORTED_KEY_SIGNATURE", "지원되지 않는 원본 조표입니다.");
  if (!validInterval(interval)) return fail("INVALID_TRANSPOSE", "반음·음이름 이동량은 안전한 정수여야 합니다.");
  const next = moveSpelling(key.tonic, key.alter, 4, interval);
  if (!Number.isSafeInteger(next.coordinate) || !Number.isSafeInteger(next.midi)) {
    return fail("INVALID_TRANSPOSE", "조옮김 계산 범위를 벗어납니다.");
  }
  const option = KEY_SIGNATURE_OPTIONS.find(({ key: candidate }) => candidate.tonic === next.step &&
    candidate.alter === next.alter && candidate.mode === key.mode);
  return option ? { ok: true, value: { ...option.key } }
    : fail("UNSUPPORTED_KEY_SIGNATURE", "조옮김 후 필요한 조표를 지원하지 않습니다.");
}
