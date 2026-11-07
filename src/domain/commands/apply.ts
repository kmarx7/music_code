import type {
  Measure,
  NoteEvent,
  Part,
  Score,
  ScoreEvent,
} from "@/domain/score/types";
import { validateScore } from "@/domain/score/validate";
import { measureStartTick, measureTicks } from "@/domain/score/create";
import type {
  CommandErrorCode,
  CommandResult,
  EditCommand,
} from "@/domain/commands/types";

function fail(code: CommandErrorCode, message: string): CommandResult {
  return { ok: false, error: { code, message } };
}

function finalize(score: Score): CommandResult {
  const issues = validateScore(score);
  if (issues.length > 0) {
    return fail(
      "INVALID_SCORE",
      issues.map((issue) => `${issue.code}: ${issue.message}`).join(" "),
    );
  }
  return { ok: true, score };
}

function hasEventId(score: Score, id: string): boolean {
  return score.parts.some((part) =>
    part.measures.some((measure) =>
      measure.events.some((event) => event.id === id),
    ),
  );
}

function sortEvents(events: ScoreEvent[]): ScoreEvent[] {
  return [...events].sort(
    (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
  );
}

function replacePart(
  score: Score,
  partId: string,
  update: (part: Part) => Part,
): Score {
  return {
    ...score,
    parts: score.parts.map((part) => (part.id === partId ? update(part) : part)),
  };
}

function replaceMeasureEvents(
  part: Part,
  measureId: string,
  update: (events: ScoreEvent[]) => ScoreEvent[],
): Part {
  return {
    ...part,
    measures: part.measures.map((measure) =>
      measure.id === measureId
        ? { ...measure, events: sortEvents(update(measure.events)) }
        : measure,
    ),
  };
}

function findEvent(
  part: Part,
  eventId: string,
): { measure: Measure; event: ScoreEvent } | null {
  for (const measure of part.measures) {
    const event = measure.events.find((candidate) => candidate.id === eventId);
    if (event) return { measure, event };
  }
  return null;
}

function addEvent(
  score: Score,
  partId: string,
  measureId: string,
  event: ScoreEvent,
): CommandResult {
  const part = score.parts.find((candidate) => candidate.id === partId);
  if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${partId}`);
  if (!part.measures.some((measure) => measure.id === measureId)) {
    return fail("MEASURE_NOT_FOUND", `마디를 찾을 수 없습니다: ${measureId}`);
  }
  if (hasEventId(score, event.id)) {
    return fail("DUPLICATE_ID", `이미 존재하는 이벤트 ID입니다: ${event.id}`);
  }

  return finalize(
    replacePart(score, partId, (target) =>
      replaceMeasureEvents(target, measureId, (events) => [...events, event]),
    ),
  );
}

interface Placed {
  measureId: string;
  event: ScoreEvent;
}

type ReflowResult =
  | { ok: true; placements: Placed[] }
  | { ok: false; code: CommandErrorCode };

/**
 * 길이 변경 시 편집된 음표 뒤의 이벤트를 순서대로 다시 배치한다.
 * 마디를 넘는 음표(타이)는 지원하지 않으므로, 다음 마디의 빈 공간으로 이동시킨다.
 * 마지막 마디까지 자리가 없으면 실패한다(마디 추가는 AddMeasure로 수행).
 */
function reflowFromResizedNote(
  part: Part,
  targetIndex: number,
  resized: NoteEvent,
  ordered: { measureId: string; measureIndex: number; event: ScoreEvent }[],
): ReflowResult {
  const ticksPerMeasure = measureTicks(part.timeSignature);
  const placements: Placed[] = [];

  for (let index = 0; index < targetIndex; index += 1) {
    placements.push({
      measureId: ordered[index].measureId,
      event: ordered[index].event,
    });
  }

  const targetMeasureStart = measureStartTick(
    ordered[targetIndex].measureIndex,
    part.timeSignature,
  );
  if (
    resized.startTick + resized.durationTicks >
    targetMeasureStart + ticksPerMeasure
  ) {
    return { ok: false, code: "MEASURE_CAPACITY_EXCEEDED" };
  }
  placements.push({ measureId: ordered[targetIndex].measureId, event: resized });

  let cursor = resized.startTick + resized.durationTicks;

  for (let index = targetIndex + 1; index < ordered.length; index += 1) {
    const item = ordered[index];
    let placed = false;

    for (
      let measureIndex = Math.floor(cursor / ticksPerMeasure);
      measureIndex < part.measures.length;
      measureIndex += 1
    ) {
      const measureStart = measureIndex * ticksPerMeasure;
      const measureEnd = measureStart + ticksPerMeasure;
      const position = Math.max(cursor, measureStart);

      if (position + item.event.durationTicks <= measureEnd) {
        placements.push({
          measureId: part.measures[measureIndex].id,
          event: { ...item.event, startTick: position },
        });
        cursor = position + item.event.durationTicks;
        placed = true;
        break;
      }
    }

    if (!placed) return { ok: false, code: "MEASURE_CAPACITY_EXCEEDED" };
  }

  return { ok: true, placements };
}

function resizeNote(
  score: Score,
  partId: string,
  noteId: string,
  durationTicks: number,
): CommandResult {
  const part = score.parts.find((candidate) => candidate.id === partId);
  if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${partId}`);
  if (!Number.isInteger(durationTicks) || durationTicks <= 0) {
    return fail("INVALID_DURATION", `길이는 1 이상의 정수 tick이어야 합니다 (${durationTicks}).`);
  }

  const found = findEvent(part, noteId);
  if (!found) return fail("NOTE_NOT_FOUND", `note를 찾을 수 없습니다: ${noteId}`);
  if (found.event.kind !== "note") {
    return fail("NOTE_NOT_FOUND", `해당 ID는 note가 아닙니다: ${noteId}`);
  }

  const ordered = part.measures
    .flatMap((measure) =>
      measure.events.map((event) => ({
        measureId: measure.id,
        measureIndex: measure.index,
        event,
      })),
    )
    .sort(
      (a, b) =>
        a.event.startTick - b.event.startTick ||
        a.event.id.localeCompare(b.event.id),
    );

  const targetIndex = ordered.findIndex((item) => item.event.id === noteId);
  if (targetIndex < 0) return fail("NOTE_NOT_FOUND", `note를 찾을 수 없습니다: ${noteId}`);

  const resized: NoteEvent = { ...found.event, durationTicks };
  const reflow = reflowFromResizedNote(part, targetIndex, resized, ordered);

  if (!reflow.ok) {
    return fail(
      reflow.code,
      "마디 공간이 부족합니다. 마디를 추가하거나 길이를 줄여 주세요.",
    );
  }

  const { placements } = reflow;

  const nextPart: Part = {
    ...part,
    measures: part.measures.map((measure) => ({
      ...measure,
      events: sortEvents(
        placements
          .filter((placed) => placed.measureId === measure.id)
          .map((placed) => placed.event),
      ),
    })),
  };

  return finalize(replacePart(score, partId, () => nextPart));
}

export function applyEditCommand(
  score: Score,
  command: EditCommand,
): CommandResult {
  switch (command.type) {
    case "AddNote":
      return addEvent(score, command.partId, command.measureId, command.note);

    case "InsertRest":
      return addEvent(score, command.partId, command.measureId, command.rest);

    case "AddMeasure": {
      const part = score.parts.find((candidate) => candidate.id === command.partId);
      if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${command.partId}`);
      if (part.measures.some((measure) => measure.id === command.measureId)) {
        return fail("DUPLICATE_ID", `이미 존재하는 마디 ID입니다: ${command.measureId}`);
      }

      const nextPart: Part = {
        ...part,
        measures: [
          ...part.measures,
          { id: command.measureId, index: part.measures.length, events: [] },
        ],
      };
      return finalize(replacePart(score, command.partId, () => nextPart));
    }

    case "ResizeNote":
      return resizeNote(score, command.partId, command.noteId, command.durationTicks);

    case "UpdateNote": {
      const part = score.parts.find((candidate) => candidate.id === command.partId);
      if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${command.partId}`);

      const found = findEvent(part, command.noteId);
      if (!found) return fail("NOTE_NOT_FOUND", `note를 찾을 수 없습니다: ${command.noteId}`);
      if (found.event.kind !== "note") {
        return fail("NOTE_NOT_FOUND", `해당 ID는 note가 아닙니다: ${command.noteId}`);
      }

      const updated: NoteEvent = { ...found.event, ...command.patch };

      return finalize(
        replacePart(score, command.partId, (target) =>
          replaceMeasureEvents(target, found.measure.id, (events) =>
            events.map((event) => (event.id === updated.id ? updated : event)),
          ),
        ),
      );
    }

    case "DeleteEvent": {
      const part = score.parts.find((candidate) => candidate.id === command.partId);
      if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${command.partId}`);

      const found = findEvent(part, command.eventId);
      if (!found) return fail("EVENT_NOT_FOUND", `이벤트를 찾을 수 없습니다: ${command.eventId}`);

      return finalize(
        replacePart(score, command.partId, (target) =>
          replaceMeasureEvents(target, found.measure.id, (events) =>
            events.filter((event) => event.id !== command.eventId),
          ),
        ),
      );
    }

    default:
      return fail("INVALID_SCORE", "지원하지 않는 command 입니다.");
  }
}
