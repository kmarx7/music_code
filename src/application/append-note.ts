import type { Measure, Part, Pitch, Score } from "@/domain/score/types";
import { createNoteEvent, createRestEvent, measureStartTick, measureTicks } from "@/domain/score/create";
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
  input: { durationTicks: number; id: string; partId?: string },
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
  const startTick = endTick;

  // 음표/쉼표 공통: 시작 위치를 찾고 종류별 길이 정책은 명령에서 검증한다.
  const target = part.measures.find((measure) => {
    const start = measureStartTick(measure.index, part.timeSignature);
    const end = start + measureTicks(part.timeSignature);
    return startTick >= start && startTick < end;
  });

  if (!target) {
    return {
      ok: false,
      message: "악보가 가득 찼습니다. 마디를 추가해 주세요.",
    };
  }

  return { ok: true, part, target, startTick };
}

export function planAppendNote(
  score: Score,
  input: { pitch: Pitch; durationTicks: number; id: string; partId?: string },
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

/** 기존 입력 위치 계획을 재사용해 끝에 쉼표를 추가한다. 경계 초과를 자동 건너뛰지 않는다. */
export function planAppendRest(
  score: Score,
  input: { durationTicks: number; id: string; partId?: string },
): AppendNotePlan {
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
