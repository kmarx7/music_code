import type { Score, ScoreEvent } from "@/domain/score/types";
import { createEmptyScore, createNoteEvent } from "@/domain/score";

export const FIXTURE_CREATED_AT = "2026-11-07T00:00:00.000Z";

export function baseScore(): Score {
  return createEmptyScore({
    id: "score-1",
    title: "Test Score",
    tempoBpm: 120,
    measureCount: 2,
    createdAt: FIXTURE_CREATED_AT,
  });
}

export function withMeasureEvents(score: Score, events: ScoreEvent[]): Score {
  return {
    ...score,
    parts: score.parts.map((part, partIndex) =>
      partIndex !== 0
        ? part
        : {
            ...part,
            measures: part.measures.map((measure, measureIndex) =>
              measureIndex !== 0 ? measure : { ...measure, events },
            ),
          },
    ),
  };
}

export function fourNoteScore(): Score {
  return withMeasureEvents(baseScore(), [
    createNoteEvent({
      id: "n1",
      step: "C",
      octave: 4,
      startTick: 0,
      durationTicks: 960,
    }),
    createNoteEvent({
      id: "n2",
      step: "D",
      octave: 4,
      startTick: 960,
      durationTicks: 960,
    }),
    createNoteEvent({
      id: "n3",
      step: "E",
      octave: 4,
      startTick: 1920,
      durationTicks: 960,
    }),
    createNoteEvent({
      id: "n4",
      step: "G",
      octave: 4,
      startTick: 2880,
      durationTicks: 960,
    }),
  ]);
}

export function scoreWithDuplicateEventId(): Score {
  return withMeasureEvents(baseScore(), [
    createNoteEvent({ id: "dup", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
    createNoteEvent({ id: "dup", step: "D", octave: 4, startTick: 960, durationTicks: 960 }),
  ]);
}

export function scoreWithOverlap(): Score {
  return withMeasureEvents(baseScore(), [
    createNoteEvent({ id: "a", step: "C", octave: 4, startTick: 0, durationTicks: 1920 }),
    createNoteEvent({ id: "b", step: "E", octave: 4, startTick: 960, durationTicks: 960 }),
  ]);
}

export function scoreWithZeroDuration(): Score {
  return withMeasureEvents(baseScore(), [
    createNoteEvent({ id: "z", step: "C", octave: 4, startTick: 0, durationTicks: 0 }),
  ]);
}

export function scoreWithCrossingEvent(): Score {
  return withMeasureEvents(baseScore(), [
    createNoteEvent({
      id: "cross",
      step: "C",
      octave: 4,
      startTick: 3360,
      durationTicks: 960,
    }),
  ]);
}

export function scoreWithBadPitch(): Score {
  const score = withMeasureEvents(baseScore(), [
    createNoteEvent({ id: "bad", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
  ]);
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      measures: part.measures.map((measure) => ({
        ...measure,
        events: measure.events.map((event) =>
          event.kind === "note"
            ? { ...event, pitch: { ...event.pitch, midi: 200 } }
            : event,
        ),
      })),
    })),
  };
}

export function scoreWithSpellingMismatch(): Score {
  const score = withMeasureEvents(baseScore(), [
    createNoteEvent({ id: "mismatch", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
  ]);
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      measures: part.measures.map((measure) => ({
        ...measure,
        events: measure.events.map((event) =>
          event.kind === "note"
            ? { ...event, pitch: { ...event.pitch, midi: 61 } }
            : event,
        ),
      })),
    })),
  };
}

export function countNotes(score: Score): number {
  return score.parts.reduce(
    (acc, part) =>
      acc +
      part.measures.reduce(
        (measureAcc, measure) =>
          measureAcc + measure.events.filter((event) => event.kind === "note").length,
        0,
      ),
    0,
  );
}
