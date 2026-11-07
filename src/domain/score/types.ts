export type DiatonicStep = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export type Clef = "treble" | "bass";

export type Mode = "major" | "minor";

export interface Pitch {
  midi: number;
  step: DiatonicStep;
  alter: number;
  octave: number;
}

export interface KeySignature {
  tonic: DiatonicStep;
  alter: number;
  mode: Mode;
  fifths: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export type EventSource = "piano" | "transcription" | "import" | "system";

export interface EventProvenance {
  source: EventSource;
  confidence?: number;
}

export interface NoteEvent {
  kind: "note";
  id: string;
  pitch: Pitch;
  startTick: number;
  durationTicks: number;
  velocity: number;
  provenance?: EventProvenance;
}

export interface RestEvent {
  kind: "rest";
  id: string;
  startTick: number;
  durationTicks: number;
}

export type ScoreEvent = NoteEvent | RestEvent;

export interface Measure {
  id: string;
  index: number;
  events: ScoreEvent[];
}

export interface Part {
  id: string;
  name: string;
  clef: Clef;
  keySignature: KeySignature;
  timeSignature: TimeSignature;
  measures: Measure[];
}

export interface Score {
  id: string;
  schemaVersion: number;
  title: string;
  tempoBpm: number;
  parts: Part[];
  createdAt: string;
  updatedAt: string;
}
