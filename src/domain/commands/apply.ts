import type {
  Measure,
  NoteEvent,
  Part,
  Score,
  ScoreEvent,
} from "@/domain/score/types";
import { validateScore } from "@/domain/score/validate";
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

export function applyEditCommand(
  score: Score,
  command: EditCommand,
): CommandResult {
  switch (command.type) {
    case "AddNote":
      return addEvent(score, command.partId, command.measureId, command.note);

    case "InsertRest":
      return addEvent(score, command.partId, command.measureId, command.rest);

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
