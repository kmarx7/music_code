import type { NoteEvent, RestEvent } from "@/domain/score/types";

export type NotePatch = Partial<
  Pick<NoteEvent, "pitch" | "startTick" | "durationTicks" | "velocity">
>;

export type EditCommand =
  | { type: "RenameScore"; title: string; updatedAt: string }
  /**
   * `measureId`는 note가 **시작하는** 마디다.
   * 길이가 마디 끝을 넘으면 마디 경계에서 분할하고 타이로 연결한다(ADR-009).
   */
  | { type: "AddNote"; partId: string; measureId: string; note: NoteEvent }
  /**
   * pitch/velocity 패치는 타이 체인 전체에 적용된다.
   * startTick/durationTicks 패치는 체인 편집이므로 거부된다(`TIE_EDIT_UNSUPPORTED`) — 길이는 `ResizeNote`를 쓴다.
   */
  | { type: "UpdateNote"; partId: string; noteId: string; patch: NotePatch }
  /** 이벤트를 삭제하고, 그 이벤트와 연결된 타이 링크를 함께 제거한다. */
  | { type: "DeleteEvent"; partId: string; eventId: string }
  | { type: "InsertRest"; partId: string; measureId: string; rest: RestEvent }
  | { type: "AddMeasure"; partId: string; measureId: string }
  /**
   * 논리 음표(타이 체인) 전체의 길이를 바꾼다.
   * 필요하면 마디 경계에서 다시 분할하고, 뒤 이벤트를 순서대로 재배치한다.
   */
  | { type: "ResizeNote"; partId: string; noteId: string; durationTicks: number };

export type CommandErrorCode =
  | "INVALID_TITLE"
  | "PART_NOT_FOUND"
  | "MEASURE_NOT_FOUND"
  | "NOTE_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "DUPLICATE_ID"
  | "INVALID_DURATION"
  | "MEASURE_CAPACITY_EXCEEDED"
  | "NOT_NOTATABLE"
  | "TIE_EDIT_UNSUPPORTED"
  | "INVALID_SCORE";

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export type CommandResult =
  | { ok: true; score: import("@/domain/score/types").Score }
  | { ok: false; error: CommandError };
