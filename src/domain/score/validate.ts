import type {
  Part,
  Pitch,
  Score,
  ScoreEvent,
  TimeSignature,
} from "@/domain/score/types";
import {
  MIDI_MAX,
  MIDI_MIN,
  SCORE_SCHEMA_VERSION,
  INSTRUMENT_IDS,
  SUPPORTED_CLEFS,
  SUPPORTED_DENOMINATORS,
  SUPPORTED_MODES,
} from "@/domain/score/constants";
import { measureStartTick, measureTicks } from "@/domain/score/create";
import { findTieIssues } from "@/domain/score/tie";
import { isInstrumentId } from "@/domain/score/instruments";
import {
  isAlterInRange,
  isDiatonicStep,
  isPitchInMidiRange,
  midiFromSpelling,
} from "@/domain/music-theory/pitch";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

const isInteger = (value: number): boolean => Number.isInteger(value);

function validateTimeSignature(
  timeSignature: TimeSignature,
  path: string,
  issues: ValidationIssue[],
): void {
  const { numerator, denominator } = timeSignature;
  if (!isInteger(numerator) || numerator < 1) {
    issues.push({
      path: `${path}.numerator`,
      code: "INVALID_TIME_SIGNATURE",
      message: `박자 분자는 1 이상의 정수여야 합니다 (현재 ${numerator}).`,
    });
  }
  if (
    !(SUPPORTED_DENOMINATORS as readonly number[]).includes(denominator)
  ) {
    issues.push({
      path: `${path}.denominator`,
      code: "INVALID_TIME_SIGNATURE",
      message: `박자 분모는 ${SUPPORTED_DENOMINATORS.join("/")} 중 하나여야 합니다 (현재 ${denominator}).`,
    });
  }
}

function validateKeySignature(
  part: Part,
  path: string,
  issues: ValidationIssue[],
): void {
  const key = part.keySignature;
  if (!isDiatonicStep(key.tonic)) {
    issues.push({
      path: `${path}.tonic`,
      code: "INVALID_KEY_SIGNATURE",
      message: `조표 으뜸음이 올바른 음이름이 아닙니다 (${key.tonic}).`,
    });
  }
  if (!(SUPPORTED_MODES as readonly string[]).includes(key.mode)) {
    issues.push({
      path: `${path}.mode`,
      code: "INVALID_KEY_SIGNATURE",
      message: `조표 모드는 major/minor 여야 합니다 (${key.mode}).`,
    });
  }
  if (!isInteger(key.fifths) || key.fifths < -7 || key.fifths > 7) {
    issues.push({
      path: `${path}.fifths`,
      code: "INVALID_KEY_SIGNATURE",
      message: `조표 fifths는 -7..7 정수여야 합니다 (${key.fifths}).`,
    });
  }
}

function validatePitch(
  pitch: Pitch,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isDiatonicStep(pitch.step)) {
    issues.push({
      path: `${path}.step`,
      code: "INVALID_PITCH",
      message: `음이름(step)이 올바르지 않습니다 (${pitch.step}).`,
    });
    return;
  }
  if (!isInteger(pitch.octave) || pitch.octave < 0 || pitch.octave > 9) {
    issues.push({
      path: `${path}.octave`,
      code: "INVALID_PITCH",
      message: `옥타브는 0..9 정수여야 합니다 (${pitch.octave}).`,
    });
  }
  if (!isAlterInRange(pitch.alter)) {
    issues.push({
      path: `${path}.alter`,
      code: "INVALID_PITCH",
      message: `임시표 alter는 -2..2 정수여야 합니다 (${pitch.alter}).`,
    });
  }
  if (!isPitchInMidiRange(pitch.midi)) {
    issues.push({
      path: `${path}.midi`,
      code: "INVALID_PITCH",
      message: `MIDI 음높이는 ${MIDI_MIN}..${MIDI_MAX} 정수여야 합니다 (${pitch.midi}).`,
    });
    return;
  }
  if (
    isDiatonicStep(pitch.step) &&
    isInteger(pitch.octave) &&
    isAlterInRange(pitch.alter)
  ) {
    const expected = midiFromSpelling(pitch.step, pitch.alter, pitch.octave);
    if (expected !== pitch.midi) {
      issues.push({
        path: `${path}.midi`,
        code: "PITCH_SPELLING_MISMATCH",
        message: `표기(${pitch.step}${pitch.alter}/${pitch.octave})와 MIDI ${pitch.midi}가 일치하지 않습니다 (기대값 ${expected}).`,
      });
    }
  }
}

function validateEvents(
  part: Part,
  measureIndex: number,
  issues: ValidationIssue[],
): void {
  const measure = part.measures[measureIndex];
  const path = `parts[${part.id}].measures[${measure.id}]`;
  const start = measureStartTick(measure.index, part.timeSignature);
  const end = start + measureTicks(part.timeSignature);

  for (const event of measure.events) {
    const eventPath = `${path}.events[${event.id}]`;
    if (!isInteger(event.startTick) || event.startTick < 0) {
      issues.push({
        path: `${eventPath}.startTick`,
        code: "INVALID_POSITION",
        message: `시작 tick은 0 이상의 정수여야 합니다 (${event.startTick}).`,
      });
    }
    if (!isInteger(event.durationTicks) || event.durationTicks <= 0) {
      issues.push({
        path: `${eventPath}.durationTicks`,
        code: "INVALID_DURATION",
        message: `길이는 1 이상의 정수 tick이어야 합니다 (${event.durationTicks}).`,
      });
    }
    if (event.kind === "note") {
      validatePitch(event.pitch, `${eventPath}.pitch`, issues);
      if (!isInteger(event.velocity) || event.velocity < 0 || event.velocity > 127) {
        issues.push({
          path: `${eventPath}.velocity`,
          code: "INVALID_VELOCITY",
          message: `velocity는 0..127 정수여야 합니다 (${event.velocity}).`,
        });
      }
    }
    if (
      isInteger(event.startTick) &&
      isInteger(event.durationTicks) &&
      event.durationTicks > 0
    ) {
      if (event.startTick < start || event.startTick + event.durationTicks > end) {
        issues.push({
          path: eventPath,
          code: "EVENT_OUT_OF_MEASURE",
          message: `이벤트가 마디 범위(${start}..${end})를 벗어납니다. 마디를 넘는 음은 마디 경계에서 분할해 타이로 연결해야 합니다.`,
        });
      }
    }
  }

  const ordered = [...measure.events].sort(
    (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
  );
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous.startTick + previous.durationTicks > current.startTick) {
      issues.push({
        path: `${path}.events`,
        code: "OVERLAPPING_EVENTS",
        message: `단선율 voice에서 이벤트가 겹칩니다 (${previous.id} → ${current.id}).`,
      });
    }
  }
}

export function validateScore(score: Score): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (score.schemaVersion !== SCORE_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      code: "UNSUPPORTED_SCHEMA",
      message: `지원하지 않는 schemaVersion 입니다 (${score.schemaVersion}, 지원 ${SCORE_SCHEMA_VERSION}).`,
    });
  }
  if (!score.id.trim()) {
    issues.push({
      path: "id",
      code: "INVALID_ID",
      message: "Score id는 비어 있을 수 없습니다.",
    });
  }
  if (!isInteger(score.tempoBpm) || score.tempoBpm < 20 || score.tempoBpm > 400) {
    issues.push({
      path: "tempoBpm",
      code: "INVALID_TEMPO",
      message: `tempoBpm은 20..400 정수여야 합니다 (${score.tempoBpm}).`,
    });
  }
  if (score.parts.length === 0) {
    issues.push({
      path: "parts",
      code: "EMPTY_PARTS",
      message: "Score에는 최소 1개의 part가 있어야 합니다.",
    });
  }

  const seenIds = new Set<string>();
  const registerId = (id: string, path: string) => {
    if (!id.trim()) {
      issues.push({
        path,
        code: "INVALID_ID",
        message: "ID는 비어 있을 수 없습니다.",
      });
      return;
    }
    if (seenIds.has(id)) {
      issues.push({
        path,
        code: "DUPLICATE_ID",
        message: `중복된 ID가 있습니다: ${id}.`,
      });
      return;
    }
    seenIds.add(id);
  };

  for (const part of score.parts) {
    const partPath = `parts[${part.id}]`;
    registerId(part.id, partPath);
    if (!(SUPPORTED_CLEFS as readonly string[]).includes(part.clef)) {
      issues.push({
        path: `${partPath}.clef`,
        code: "INVALID_CLEF",
        message: `음자리표는 ${SUPPORTED_CLEFS.join("/")} 여야 합니다 (${part.clef}).`,
      });
    }
    if (part.instrument !== undefined && !isInstrumentId(part.instrument)) {
      issues.push({
        path: `${partPath}.instrument`,
        code: "INVALID_INSTRUMENT",
        message: `악기는 ${INSTRUMENT_IDS.join("/")} 중 하나여야 합니다 (${String(part.instrument)}).`,
      });
    }
    validateTimeSignature(part.timeSignature, `${partPath}.timeSignature`, issues);
    validateKeySignature(part, `${partPath}.keySignature`, issues);

    if (part.measures.length === 0) {
      issues.push({
        path: `${partPath}.measures`,
        code: "EMPTY_MEASURES",
        message: "Part에는 최소 1개의 마디가 있어야 합니다.",
      });
    }

    part.measures.forEach((measure, position) => {
      registerId(measure.id, `${partPath}.measures[${position}]`);
      if (measure.index !== position) {
        issues.push({
          path: `${partPath}.measures[${position}].index`,
          code: "MEASURE_INDEX_MISMATCH",
          message: `마디 index(${measure.index})가 배열 위치(${position})와 다릅니다.`,
        });
      }
    });

    part.measures.forEach((measure, position) => {
      for (const event of measure.events) {
        registerId(event.id, `${partPath}.measures[${measure.id}].events[${event.id}]`);
      }
      validateEvents(part, position, issues);
    });

    for (const issue of findTieIssues(part, { pathPrefix: partPath })) {
      issues.push(issue);
    }
  }

  return issues;
}

export function isScoreEvent(score: Score, eventId: string): ScoreEvent | null {
  for (const part of score.parts) {
    for (const measure of part.measures) {
      const found = measure.events.find((event) => event.id === eventId);
      if (found) return found;
    }
  }
  return null;
}
