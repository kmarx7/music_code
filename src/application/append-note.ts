import type { Pitch, Score } from "@/domain/score/types";
import { createNoteEvent, measureStartTick, measureTicks } from "@/domain/score/create";
import type { EditCommand } from "@/domain/commands/types";

export type AppendNotePlan =
  | { ok: true; command: EditCommand }
  | { ok: false; message: string };

/**
 * 파트 끝에 note를 추가하는 AddNote command를 계획한다.
 * 순수 함수이며 ID/시각은 호출 경계에서 주입한다.
 */
export function planAppendNote(
  score: Score,
  input: { pitch: Pitch; durationTicks: number; id: string; partId?: string },
): AppendNotePlan {
  const part = input.partId
    ? score.parts.find((candidate) => candidate.id === input.partId)
    : score.parts[0];

  if (!part) return { ok: false, message: "파트가 없습니다." };
  if (!Number.isInteger(input.durationTicks) || input.durationTicks <= 0) {
    return { ok: false, message: "음표 길이가 올바르지 않습니다." };
  }
  if (!input.id.trim()) return { ok: false, message: "note ID가 필요합니다." };

  let endTick = 0;
  for (const measure of part.measures) {
    for (const event of measure.events) {
      endTick = Math.max(endTick, event.startTick + event.durationTicks);
    }
  }
  const startTick = endTick;

  // note가 시작하는 마디만 찾으면 된다. 길이가 마디를 넘으면 Command가 분할+타이로 처리한다(ADR-009).
  const target = part.measures.find((measure) => {
    const start = measureStartTick(measure.index, part.timeSignature);
    const end = start + measureTicks(part.timeSignature);
    return startTick >= start && startTick < end;
  });

  if (!target) {
    return {
      ok: false,
      message: "악보가 가득 찼습니다. 마디 추가는 후속 단계에서 지원합니다.",
    };
  }

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
