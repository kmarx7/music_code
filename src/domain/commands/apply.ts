import type {
  Measure,
  Part,
  Score,
  ScoreEvent,
} from "@/domain/score/types";
import { validateScore } from "@/domain/score/validate";
import { measureStartTick, measureTicks } from "@/domain/score/create";
import {
  chainIdsOf,
  noteById,
  splitNoteIntoMeasures,
  withoutTiesTouching,
} from "@/domain/score/tie";
import type { NoteSegment, SplitFailureCode } from "@/domain/score/tie";
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

function partOf(score: Score, partId: string): Part | undefined {
  return score.parts.find((part) => part.id === partId);
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

interface Placement {
  measureId: string;
  event: ScoreEvent;
}

/** 배치 목록을 마디별로 모아 Part를 재구성한다(기존 이벤트는 대체된다). */
function buildPart(part: Part, placements: Placement[]): Part {
  return {
    ...part,
    measures: part.measures.map((measure) => ({
      ...measure,
      events: sortEvents(
        placements
          .filter((placement) => placement.measureId === measure.id)
          .map((placement) => placement.event),
      ),
    })),
  };
}

/** 새 이벤트를 기존 마디 내용에 추가한다(기존 이벤트 보존). */
function mergePlacements(part: Part, placements: Placement[]): Part {
  return {
    ...part,
    measures: part.measures.map((measure) => {
      const added = placements
        .filter((placement) => placement.measureId === measure.id)
        .map((placement) => placement.event);
      if (added.length === 0) return measure;
      return { ...measure, events: sortEvents([...measure.events, ...added]) };
    }),
  };
}

function flatten(part: Part): { measureId: string; event: ScoreEvent }[] {
  return part.measures
    .flatMap((measure) =>
      measure.events.map((event) => ({ measureId: measure.id, event })),
    )
    .sort(
      (a, b) =>
        a.event.startTick - b.event.startTick ||
        a.event.id.localeCompare(b.event.id),
    );
}

function mapSplitFailure(code: SplitFailureCode): {
  code: CommandErrorCode;
  message: string;
} {
  switch (code) {
    case "INVALID_DURATION":
      return { code: "INVALID_DURATION", message: "음표 길이가 올바르지 않습니다." };
    case "NOT_NOTATABLE":
      return {
        code: "NOT_NOTATABLE",
        message: "음가(점 포함)로 표기할 수 없는 길이입니다.",
      };
    case "TOO_MANY_SEGMENTS":
      return {
        code: "MEASURE_CAPACITY_EXCEEDED",
        message: "분할 세그먼트가 너무 많습니다.",
      };
    case "OUT_OF_MEASURES":
    default:
      return {
        code: "MEASURE_CAPACITY_EXCEEDED",
        message: "마디 공간이 부족합니다. 마디를 추가하거나 길이를 줄여 주세요.",
      };
  }
}

/**
 * 분할된 논리 음표 뒤의 이벤트를 순서대로 재배치한다.
 * 마디를 넘는 단일 이벤트는 만들지 않으므로, 자리가 없으면 다음 마디로 넘긴다.
 */
function arrangeFollowing(
  part: Part,
  before: Placement[],
  segments: NoteSegment[],
  after: ScoreEvent[],
): { ok: true; placements: Placement[] } | { ok: false; code: CommandErrorCode } {
  const ticksPerMeasure = measureTicks(part.timeSignature);
  const placements: Placement[] = [
    ...before,
    ...segments.map((segment) => ({
      measureId: segment.measureId,
      event: segment.event as ScoreEvent,
    })),
  ];

  const last = segments[segments.length - 1];
  let cursor = last.event.startTick + last.event.durationTicks;

  for (const event of after) {
    let placed = false;

    for (
      let measureIndex = Math.floor(cursor / ticksPerMeasure);
      measureIndex < part.measures.length;
      measureIndex += 1
    ) {
      const measureStart = measureIndex * ticksPerMeasure;
      const measureEnd = measureStart + ticksPerMeasure;
      const position = Math.max(cursor, measureStart);

      if (position + event.durationTicks <= measureEnd) {
        placements.push({
          measureId: part.measures[measureIndex].id,
          event: { ...event, startTick: position },
        });
        cursor = position + event.durationTicks;
        placed = true;
        break;
      }
    }

    if (!placed) return { ok: false, code: "MEASURE_CAPACITY_EXCEEDED" };
  }

  return { ok: true, placements };
}

function addNote(
  score: Score,
  command: Extract<EditCommand, { type: "AddNote" }>,
): CommandResult {
  const part = partOf(score, command.partId);
  if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${command.partId}`);

  const measure = part.measures.find((candidate) => candidate.id === command.measureId);
  if (!measure) {
    return fail("MEASURE_NOT_FOUND", `마디를 찾을 수 없습니다: ${command.measureId}`);
  }
  if (hasEventId(score, command.note.id)) {
    return fail("DUPLICATE_ID", `이미 존재하는 이벤트 ID입니다: ${command.note.id}`);
  }

  const measureStart = measureStartTick(measure.index, part.timeSignature);
  const measureEnd = measureStart + measureTicks(part.timeSignature);
  const { startTick } = command.note;
  if (startTick < measureStart || startTick >= measureEnd) {
    return fail(
      "MEASURE_NOT_FOUND",
      `시작 위치 ${startTick}가 마디 범위(${measureStart}..${measureEnd}) 밖입니다.`,
    );
  }

  const split = splitNoteIntoMeasures(part, {
    id: command.note.id,
    pitch: command.note.pitch,
    startTick,
    durationTicks: command.note.durationTicks,
    velocity: command.note.velocity,
    provenance: command.note.provenance,
  });
  if (!split.ok) {
    const mapped = mapSplitFailure(split.code);
    return fail(mapped.code, mapped.message);
  }

  for (const segment of split.segments) {
    if (segment.event.id !== command.note.id && hasEventId(score, segment.event.id)) {
      return fail("DUPLICATE_ID", `이미 존재하는 이벤트 ID입니다: ${segment.event.id}`);
    }
  }

  const placed = mergePlacements(part, split.segments);
  const nextPart: Part = { ...placed, ties: [...part.ties, ...split.ties] };

  return finalize(replacePart(score, command.partId, () => nextPart));
}

function addEvent(
  score: Score,
  partId: string,
  measureId: string,
  event: ScoreEvent,
): CommandResult {
  const part = partOf(score, partId);
  if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${partId}`);
  if (!part.measures.some((measure) => measure.id === measureId)) {
    return fail("MEASURE_NOT_FOUND", `마디를 찾을 수 없습니다: ${measureId}`);
  }
  if (hasEventId(score, event.id)) {
    return fail("DUPLICATE_ID", `이미 존재하는 이벤트 ID입니다: ${event.id}`);
  }

  const nextPart: Part = mergePlacements(part, [{ measureId, event }]);
  return finalize(replacePart(score, partId, () => nextPart));
}

function updateNote(
  score: Score,
  command: Extract<EditCommand, { type: "UpdateNote" }>,
): CommandResult {
  const part = partOf(score, command.partId);
  if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${command.partId}`);

  const found = findEvent(part, command.noteId);
  if (!found) return fail("NOTE_NOT_FOUND", `note를 찾을 수 없습니다: ${command.noteId}`);
  if (found.event.kind !== "note") {
    return fail("NOTE_NOT_FOUND", `해당 ID는 note가 아닙니다: ${command.noteId}`);
  }

  const chain = chainIdsOf(part, command.noteId);
  const chainSet = new Set(chain);
  const { patch } = command;

  if (
    chain.length > 1 &&
    (patch.startTick !== undefined || patch.durationTicks !== undefined)
  ) {
    return fail(
      "TIE_EDIT_UNSUPPORTED",
      "타이로 연결된 음표의 위치·길이는 ResizeNote로 변경해야 합니다.",
    );
  }

  const nextPart: Part = {
    ...part,
    measures: part.measures.map((measure) => ({
      ...measure,
      events: measure.events.map((event) =>
        chainSet.has(event.id) && event.kind === "note"
          ? { ...event, ...patch }
          : event,
      ),
    })),
  };

  return finalize(replacePart(score, command.partId, () => nextPart));
}

function deleteEvent(
  score: Score,
  command: Extract<EditCommand, { type: "DeleteEvent" }>,
): CommandResult {
  const part = partOf(score, command.partId);
  if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${command.partId}`);
  if (!findEvent(part, command.eventId)) {
    return fail("EVENT_NOT_FOUND", `이벤트를 찾을 수 없습니다: ${command.eventId}`);
  }

  const removed = new Set([command.eventId]);
  const nextPart: Part = {
    ...part,
    ties: withoutTiesTouching(part.ties, removed),
    measures: part.measures.map((measure) => ({
      ...measure,
      events: measure.events.filter((event) => event.id !== command.eventId),
    })),
  };

  return finalize(replacePart(score, command.partId, () => nextPart));
}

function resizeNote(
  score: Score,
  partId: string,
  noteId: string,
  durationTicks: number,
): CommandResult {
  const part = partOf(score, partId);
  if (!part) return fail("PART_NOT_FOUND", `part를 찾을 수 없습니다: ${partId}`);
  if (!Number.isInteger(durationTicks) || durationTicks <= 0) {
    return fail("INVALID_DURATION", `길이는 1 이상의 정수 tick이어야 합니다 (${durationTicks}).`);
  }

  const chain = chainIdsOf(part, noteId);
  const head = chain.length > 0 ? noteById(part, chain[0]) : undefined;
  if (!head) return fail("NOTE_NOT_FOUND", `note를 찾을 수 없습니다: ${noteId}`);

  const chainSet = new Set(chain);
  const before: Placement[] = [];
  const after: ScoreEvent[] = [];

  for (const item of flatten(part)) {
    if (chainSet.has(item.event.id)) continue;
    if (item.event.startTick < head.startTick) {
      before.push({ measureId: item.measureId, event: item.event });
    } else {
      after.push(item.event);
    }
  }

  const split = splitNoteIntoMeasures(part, {
    id: head.id,
    pitch: head.pitch,
    startTick: head.startTick,
    durationTicks,
    velocity: head.velocity,
    provenance: head.provenance,
  });
  if (!split.ok) {
    const mapped = mapSplitFailure(split.code);
    return fail(mapped.code, mapped.message);
  }

  const arranged = arrangeFollowing(part, before, split.segments, after);
  if (!arranged.ok) {
    return fail(
      arranged.code,
      "마디 공간이 부족합니다. 마디를 추가하거나 길이를 줄여 주세요.",
    );
  }

  const placed = buildPart(part, arranged.placements);
  const nextPart: Part = {
    ...placed,
    ties: [...withoutTiesTouching(part.ties, chainSet), ...split.ties],
  };

  return finalize(replacePart(score, partId, () => nextPart));
}

export function applyEditCommand(
  score: Score,
  command: EditCommand,
): CommandResult {
  switch (command.type) {
    case "AddNote":
      return addNote(score, command);

    case "InsertRest":
      return addEvent(score, command.partId, command.measureId, command.rest);

    case "AddMeasure": {
      const part = partOf(score, command.partId);
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

    case "UpdateNote":
      return updateNote(score, command);

    case "DeleteEvent":
      return deleteEvent(score, command);

    default:
      return fail("INVALID_SCORE", "지원하지 않는 command 입니다.");
  }
}
