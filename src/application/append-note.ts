import type { Measure, Part, Pitch, Score, ScoreEvent } from "@/domain/score/types";
import { createNoteEvent, createRestEvent, measureStartTick, measureTicks } from "@/domain/score/create";
import { TICKS_PER_QUARTER } from "@/domain/score/constants";
import type { EditCommand } from "@/domain/commands/types";

export type AppendNotePlan =
  | { ok: true; command: EditCommand }
  | { ok: false; message: string };

/**
 * 음표·쉼표 입력에 공통인 파트 끝 위치를 계산한다.
 * 순수 함수이며 ID/시각은 호출 경계에서 주입한다.
 */
function planAppendPosition(
  score: Score,
  input: { durationTicks: number; id: string; partId?: string; startTick?: number },
): { ok: true; part: Part; target: Measure; startTick: number } | { ok: false; message: string } {
  const part = input.partId
    ? score.parts.find((candidate) => candidate.id === input.partId)
    : score.parts[0];

  if (!part) return { ok: false, message: "파트가 없습니다." };
  if (!Number.isInteger(input.durationTicks) || input.durationTicks <= 0) {
    return { ok: false, message: "길이가 올바르지 않습니다." };
  }
  if (!input.id.trim()) return { ok: false, message: "이벤트 ID가 필요합니다." };

  let endTick = 0;
  for (const measure of part.measures) {
    for (const event of measure.events) {
      endTick = Math.max(endTick, event.startTick + event.durationTicks);
    }
  }
  const startTick = input.startTick ?? endTick;
  if (!Number.isSafeInteger(startTick) || startTick < 0) {
    return { ok: false, message: "입력 위치는 0 이상의 정수 tick이어야 합니다." };
  }

  // 음표/쉼표 공통: 시작 위치를 찾고 종류별 길이 정책은 명령에서 검증한다.
  const target = part.measures.find((measure) => {
    const start = measureStartTick(measure.index, part.timeSignature);
    const end = start + measureTicks(part.timeSignature);
    return startTick >= start && startTick < end;
  });

  if (!target) {
    return {
      ok: false,
      message: input.startTick === undefined ? "악보가 가득 찼습니다. 마디를 추가해 주세요."
        : "입력 위치가 악보 범위를 벗어났습니다. 마디를 추가하거나 위치를 바꿔 주세요.",
    };
  }

  return { ok: true, part, target, startTick };
}

/**
 * 악보 끝 입력이 마지막 마디를 넘으면(가득 참 포함) `nextMeasureId`가 주어졌을 때만 필요한 수의 빈 마디를 뒤에 붙이고
 * 같은 명령 하나(`PasteEvents` + `newMeasureIds`)로 넣는다 → Undo 한 번에 마디와 음이 함께 되돌아간다(UAT 결함 수정, 안 A).
 * 커서 위치 입력·붙여넣기는 지금처럼 마디를 늘리지 않는다.
 */
function planEndExtension(
  score: Score,
  input: { durationTicks: number; partId?: string; nextMeasureId?: () => string },
  event: (startTick: number) => ScoreEvent,
): AppendNotePlan | null {
  if (!input.nextMeasureId || !Number.isInteger(input.durationTicks) || input.durationTicks <= 0) return null;
  const part = input.partId ? score.parts.find((candidate) => candidate.id === input.partId) : score.parts[0];
  if (!part) return null;
  const bar = measureTicks(part.timeSignature);
  const capacity = part.measures.length * bar;
  const startTick = part.measures.flatMap((measure) => measure.events)
    .reduce((end, item) => Math.max(end, item.startTick + item.durationTicks), 0);
  if (startTick + input.durationTicks <= capacity) return null;
  const needed = Math.ceil((startTick + input.durationTicks - capacity) / bar);
  const created = event(0);
  return {
    ok: true,
    command: {
      type: "PasteEvents", partId: part.id, startTick,
      clipboard: { lengthTicks: input.durationTicks, events: [created], ties: [] },
      newMeasureIds: Array.from({ length: needed }, () => input.nextMeasureId!()),
    },
  };
}

export function planAppendNote(
  score: Score,
  input: { pitch: Pitch; durationTicks: number; id: string; partId?: string; nextMeasureId?: () => string },
): AppendNotePlan {
  if (input.id.trim()) {
    const extended = planEndExtension(score, input, (startTick) => createNoteEvent({
      id: input.id, step: input.pitch.step, alter: input.pitch.alter, octave: input.pitch.octave,
      startTick, durationTicks: input.durationTicks, provenance: { source: "piano" },
    }));
    if (extended) return extended;
  }
  return planNoteInput(score, input);
}

/** 기존 AddNote 경로로 빈 위치에 삽입한다. 충돌·음가·타이는 Command가 검증한다. */
export function planNoteAt(
  score: Score,
  input: { pitch: Pitch; durationTicks: number; id: string; startTick: number; partId?: string },
): AppendNotePlan {
  return planNoteInput(score, input);
}

function planNoteInput(
  score: Score,
  input: { pitch: Pitch; durationTicks: number; id: string; startTick?: number; partId?: string },
): AppendNotePlan {
  const position = planAppendPosition(score, input);
  if (!position.ok) return position;
  const { part, target, startTick } = position;

  return {
    ok: true,
    command: {
      type: "AddNote",
      partId: part.id,
      measureId: target.id,
      note: createNoteEvent({
        id: input.id,
        step: input.pitch.step,
        alter: input.pitch.alter,
        octave: input.pitch.octave,
        startTick,
        durationTicks: input.durationTicks,
        provenance: { source: "piano" },
      }),
    },
  };
}

/** 1부터 세는 마디/분모 음가 박을 canonical 절대 tick으로 변환한다. */
export function noteInputTick(part: Part, measure: number, beat: number): number | null {
  if (!Number.isInteger(measure) || measure < 1 || measure > part.measures.length ||
      !Number.isFinite(beat) || beat < 1 || beat >= part.timeSignature.numerator + 1) return null;
  const tick = (measure - 1) * measureTicks(part.timeSignature) +
    (beat - 1) * TICKS_PER_QUARTER * 4 / part.timeSignature.denominator;
  return Number.isSafeInteger(tick) ? tick : null;
}

/** 기존 입력 위치 계획을 재사용해 끝에 쉼표를 추가한다. 경계 초과를 자동 건너뛰지 않는다. */
export function planAppendRest(
  score: Score,
  input: { durationTicks: number; id: string; partId?: string; nextMeasureId?: () => string },
): AppendNotePlan {
  if (input.id.trim()) {
    const extended = planEndExtension(score, input, (startTick) => createRestEvent({ id: input.id, startTick, durationTicks: input.durationTicks }));
    if (extended) return extended;
  }
  const position = planAppendPosition(score, input);
  if (!position.ok) return position;
  const { part, target, startTick } = position;
  return {
    ok: true,
    command: {
      type: "InsertRest", partId: part.id, measureId: target.id,
      rest: createRestEvent({ id: input.id, startTick, durationTicks: input.durationTicks }),
    },
  };
}
