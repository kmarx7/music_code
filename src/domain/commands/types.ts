import type { KeySignature, NoteEvent, RestEvent, TimeSignature } from "@/domain/score/types";
import type { ClipboardPayload } from "@/domain/score/clipboard";
import type { TransposeSpec } from "@/domain/score/transpose";
import type { TransposeErrorCode } from "@/domain/music-theory/transpose";

export type NotePatch = Partial<
  Pick<NoteEvent, "pitch" | "startTick" | "durationTicks" | "velocity">
>;

export type EditCommand =
  | { type: "TransposeScore"; spec: TransposeSpec; updatedAt: string }
  | { type: "RenameScore"; title: string; updatedAt: string }
  | { type: "SetTempo"; tempoBpm: number; updatedAt: string }
  | { type: "SetKeySignature"; partId: string; keySignature: KeySignature; updatedAt: string }
  | { type: "SetTimeSignature"; partId: string; timeSignature: TimeSignature; updatedAt: string }
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
  /** 쉼표만 이동/길이 변경한다. 다른 이벤트는 이동하지 않으며 마디 초과·충돌은 거부한다. */
  | { type: "UpdateRest"; partId: string; restId: string; patch: Partial<Pick<RestEvent, "startTick" | "durationTicks">> }
  | { type: "AddMeasure"; partId: string; measureId: string }
  /**
   * 클립보드 payload를 `startTick`부터 한 번에 붙여넣는다(C-08). payload의 이벤트 ID는 호출 측이 새로 발급한 값이어야 한다.
   * 대상 `[startTick, startTick + lengthTicks)`는 비어 있어야 하며 덮어쓰기·뒤 이벤트 밀기·마디 추가·타이 절단은 없다.
   * 마디 경계를 넘게 된 음표만 기존 분할 규칙으로 나눠 타이로 잇는다. 실패는 부분 적용 없이 거부한다.
   */
  | { type: "PasteEvents"; partId: string; startTick: number; clipboard: ClipboardPayload }
  /**
   * 첫 Part의 `[startTick, endTick)` 구간에 든 이벤트와 그 내부 타이를 한 번에 삭제한다(C-08 Cut).
   * 이벤트 중간이나 타이 체인을 자르는 구간, 이벤트가 없는 구간은 거부한다. 빈 자리는 gap으로 남고
   * 뒤 이벤트를 당기지 않으며 타이를 자동으로 끊지 않는다. clipboard 교체는 호출 측이 성공 후에만 한다.
   */
  | { type: "CutEvents"; partId: string; startTick: number; endTick: number }
  /**
   * 논리 음표(타이 체인) 전체의 길이를 바꾼다.
   * 필요하면 마디 경계에서 다시 분할하고, 뒤 이벤트를 순서대로 재배치한다.
   */
  | { type: "ResizeNote"; partId: string; noteId: string; durationTicks: number };

export type CommandErrorCode =
  | TransposeErrorCode
  | "INVALID_TITLE"
  | "INVALID_KEY_SIGNATURE"
  | "TIME_SIGNATURE_REQUIRES_EMPTY_SCORE"
  | "PART_NOT_FOUND"
  | "MEASURE_NOT_FOUND"
  | "NOTE_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "DUPLICATE_ID"
  | "INVALID_DURATION"
  | "MEASURE_CAPACITY_EXCEEDED"
  | "NOT_NOTATABLE"
  | "TIE_EDIT_UNSUPPORTED"
  | "NOTHING_TO_PASTE"
  | "PASTE_TARGET_OCCUPIED"
  | "INVALID_SELECTION"
  | "NOTHING_TO_CUT"
  | "INVALID_SCORE";

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export type CommandResult =
  | { ok: true; score: import("@/domain/score/types").Score }
  | { ok: false; error: CommandError };
