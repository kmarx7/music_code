import { DEFAULT_PART_NAME } from "./instruments";
import type { InstrumentId } from "./constants";
import type { NoteEvent, RestEvent, Score } from "@/domain/score/types";
import { SCORE_SCHEMA_VERSION, TICKS_PER_QUARTER } from "@/domain/score/constants";
import { createPitch } from "@/domain/music-theory/pitch";
import type { DiatonicStep } from "@/domain/score/types";

export interface CreateScoreInput {
  id: string;
  title?: string;
  tempoBpm?: number;
  measureCount?: number;
  timeSignature?: { numerator: number; denominator: number };
  keySignature?: {
    tonic: DiatonicStep;
    alter: number;
    mode: "major" | "minor";
    fifths: number;
  };
  createdAt: string;
  /** The part's instrument (v3); the piano when not given. */
  instrument?: InstrumentId;
}

export function measureTicks(timeSignature: {
  numerator: number;
  denominator: number;
}): number {
  return (timeSignature.numerator * TICKS_PER_QUARTER * 4) /
    timeSignature.denominator;
}

export function measureStartTick(
  index: number,
  timeSignature: { numerator: number; denominator: number },
): number {
  return index * measureTicks(timeSignature);
}

export function createEmptyScore(input: CreateScoreInput): Score {
  const timeSignature = input.timeSignature ?? { numerator: 4, denominator: 4 };
  const measureCount = input.measureCount ?? 4;

  return {
    id: input.id,
    schemaVersion: SCORE_SCHEMA_VERSION,
    title: input.title ?? "Untitled Score",
    tempoBpm: input.tempoBpm ?? 120,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    parts: [
      {
        id: `${input.id}:part:1`,
        name: DEFAULT_PART_NAME,
        instrument: input.instrument ?? "piano",
        clef: "treble",
        keySignature: input.keySignature ?? {
          tonic: "C",
          alter: 0,
          mode: "major",
          fifths: 0,
        },
        timeSignature,
        measures: Array.from({ length: measureCount }, (_, index) => ({
          id: `${input.id}:m:${index}`,
          index,
          events: [],
        })),
        ties: [],
      },
    ],
  };
}

export interface CreateNoteInput {
  id: string;
  step: DiatonicStep;
  alter?: number;
  octave: number;
  startTick: number;
  durationTicks: number;
  velocity?: number;
  provenance?: NoteEvent["provenance"];
}

export function createNoteEvent(input: CreateNoteInput): NoteEvent {
  return {
    kind: "note",
    id: input.id,
    pitch: createPitch(input.step, input.alter ?? 0, input.octave),
    startTick: input.startTick,
    durationTicks: input.durationTicks,
    velocity: input.velocity ?? 96,
    provenance: input.provenance ?? { source: "system" },
  };
}

export function createRestEvent(input: {
  id: string;
  startTick: number;
  durationTicks: number;
}): RestEvent {
  return {
    kind: "rest",
    id: input.id,
    startTick: input.startTick,
    durationTicks: input.durationTicks,
  };
}
