import type { NoteEvent, RestEvent } from "@/domain/score/types";

export type NotePatch = Partial<
  Pick<NoteEvent, "pitch" | "startTick" | "durationTicks" | "velocity">
>;

export type EditCommand =
  | { type: "AddNote"; partId: string; measureId: string; note: NoteEvent }
  | { type: "UpdateNote"; partId: string; noteId: string; patch: NotePatch }
  | { type: "DeleteEvent"; partId: string; eventId: string }
  | { type: "InsertRest"; partId: string; measureId: string; rest: RestEvent }
  | { type: "AddMeasure"; partId: string; measureId: string }
  | { type: "ResizeNote"; partId: string; noteId: string; durationTicks: number };

export type CommandErrorCode =
  | "PART_NOT_FOUND"
  | "MEASURE_NOT_FOUND"
  | "NOTE_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "DUPLICATE_ID"
  | "INVALID_DURATION"
  | "MEASURE_CAPACITY_EXCEEDED"
  | "INVALID_SCORE";

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export type CommandResult =
  | { ok: true; score: import("@/domain/score/types").Score }
  | { ok: false; error: CommandError };
