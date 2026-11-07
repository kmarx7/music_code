import type { NoteEvent, Part, Pitch, ScoreEvent, TieLink } from "@/domain/score/types";
import { createNoteEvent, measureTicks } from "@/domain/score/create";

/**
 * 마디 안에서 **하나의 음표(점 0~2개)** 로 표기 가능한 길이.
 * ticks = (3840 / base) * (2 - 2^-dots)
 */
export interface NotatableDuration {
  ticks: number;
  base: 1 | 2 | 4 | 8 | 16 | 32;
  dots: 0 | 1 | 2;
}

function notatable(base: NotatableDuration["base"], dots: NotatableDuration["dots"]): NotatableDuration {
  return { ticks: Math.round((3840 / base) * (2 - 2 ** -dots)), base, dots };
}

/** 큰 음가 우선(그리디 분해용). */
export const NOTATABLE_DURATIONS: readonly NotatableDuration[] = [
  notatable(1, 2),
  notatable(1, 1),
  notatable(1, 0),
  notatable(2, 2),
  notatable(2, 1),
  notatable(2, 0),
  notatable(4, 2),
  notatable(4, 1),
  notatable(4, 0),
  notatable(8, 2),
  notatable(8, 1),
  notatable(8, 0),
  notatable(16, 2),
  notatable(16, 1),
  notatable(16, 0),
  notatable(32, 2),
  notatable(32, 1),
  notatable(32, 0),
];

export const MAX_TIE_SEGMENTS = 64;

export function notatableDurationFor(ticks: number): NotatableDuration | undefined {
  return NOTATABLE_DURATIONS.find((duration) => duration.ticks === ticks);
}

export function eventById(part: Part, eventId: string): ScoreEvent | undefined {
  for (const measure of part.measures) {
    const found = measure.events.find((event) => event.id === eventId);
    if (found) return found;
  }
  return undefined;
}

export function noteById(part: Part, eventId: string): NoteEvent | undefined {
  const event = eventById(part, eventId);
  return event && event.kind === "note" ? event : undefined;
}

export function notesSorted(part: Part): NoteEvent[] {
  return part.measures
    .flatMap((measure) => measure.events)
    .filter((event): event is NoteEvent => event.kind === "note")
    .sort(
      (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
    );
}

function linkMaps(part: Part): {
  incoming: Map<string, string>;
  outgoing: Map<string, string>;
} {
  const incoming = new Map<string, string>();
  const outgoing = new Map<string, string>();
  for (const tie of part.ties) {
    if (!incoming.has(tie.to)) incoming.set(tie.to, tie.from);
    if (!outgoing.has(tie.from)) outgoing.set(tie.from, tie.to);
  }
  return { incoming, outgoing };
}

/** eventId가 속한 타이 체인의 순서 있는 ID 목록. 타이가 없으면 `[eventId]`(없는 ID면 `[]`). */
export function chainIdsOf(part: Part, eventId: string): string[] {
  if (!eventById(part, eventId)) return [];
  const { incoming, outgoing } = linkMaps(part);
  const chain = [eventId];

  let head = eventId;
  for (let hop = 0; hop < MAX_TIE_SEGMENTS; hop += 1) {
    const previous = incoming.get(head);
    if (!previous) break;
    chain.unshift(previous);
    head = previous;
  }

  let tail = eventId;
  for (let hop = 0; hop < MAX_TIE_SEGMENTS; hop += 1) {
    const next = outgoing.get(tail);
    if (!next) break;
    chain.push(next);
    tail = next;
  }

  return chain;
}

export interface MergedNote {
  id: string;
  pitch: Pitch;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

/**
 * 타이 체인을 하나의 지속음으로 병합한다(재생용 계산).
 * Score를 변경하지 않으며, 체인의 첫 세그먼트만 결과에 포함된다(중복 어택 방지).
 */
export function mergeTiedNotes(part: Part): MergedNote[] {
  const { incoming, outgoing } = linkMaps(part);

  const merged: MergedNote[] = [];
  for (const note of notesSorted(part)) {
    if (incoming.has(note.id)) continue;

    let endTick = note.startTick + note.durationTicks;
    let cursor: string | undefined = note.id;

    for (let hop = 0; hop < MAX_TIE_SEGMENTS; hop += 1) {
      if (cursor === undefined) break;
      const next: string | undefined = outgoing.get(cursor);
      if (!next) break;
      const target = noteById(part, next);
      if (!target) break;
      endTick = target.startTick + target.durationTicks;
      cursor = next;
    }

    merged.push({
      id: note.id,
      pitch: note.pitch,
      startTick: note.startTick,
      durationTicks: endTick - note.startTick,
      velocity: note.velocity,
    });
  }

  return merged;
}

/** 주어진 ID 집합과 연결된 링크를 제거한 목록을 돌려준다. */
export function withoutTiesTouching(
  ties: readonly TieLink[],
  eventIds: ReadonlySet<string>,
): TieLink[] {
  return ties.filter((tie) => !eventIds.has(tie.from) && !eventIds.has(tie.to));
}

export type SplitFailureCode =
  | "INVALID_DURATION"
  | "NOT_NOTATABLE"
  | "OUT_OF_MEASURES"
  | "TOO_MANY_SEGMENTS";

export interface NoteSegment {
  measureId: string;
  event: NoteEvent;
}

export type SplitNoteResult =
  | { ok: true; segments: NoteSegment[]; ties: TieLink[] }
  | { ok: false; code: SplitFailureCode };

export interface SplitNoteSpec {
  id: string;
  pitch: Pitch;
  startTick: number;
  durationTicks: number;
  velocity?: number;
  provenance?: NoteEvent["provenance"];
}

/**
 * 마디 경계에서 음표를 분할한다.
 * - 각 세그먼트는 표기가능한 길이만 가진다(아니면 더 작은 음가로 분해).
 * - 세그먼트 사이는 `ties`로 연결한다(체인).
 * - 마디를 넘어설 공간이 없으면 `OUT_OF_MEASURES`로 실패한다.
 */
export function splitNoteIntoMeasures(
  part: Part,
  spec: SplitNoteSpec,
): SplitNoteResult {
  if (!Number.isInteger(spec.durationTicks) || spec.durationTicks <= 0) {
    return { ok: false, code: "INVALID_DURATION" };
  }
  if (!Number.isInteger(spec.startTick) || spec.startTick < 0) {
    return { ok: false, code: "INVALID_DURATION" };
  }
  if (!spec.id.trim()) return { ok: false, code: "INVALID_DURATION" };

  const ticksPerMeasure = measureTicks(part.timeSignature);
  const segments: NoteSegment[] = [];
  const ties: TieLink[] = [];

  let cursor = spec.startTick;
  let remaining = spec.durationTicks;
  let previousId: string | null = null;
  let index = 0;

  while (remaining > 0) {
    if (index >= MAX_TIE_SEGMENTS) return { ok: false, code: "TOO_MANY_SEGMENTS" };

    const measureIndex = Math.floor(cursor / ticksPerMeasure);
    const measure = part.measures[measureIndex];
    if (!measure) return { ok: false, code: "OUT_OF_MEASURES" };

    const available = (measureIndex + 1) * ticksPerMeasure - cursor;
    const chunk = NOTATABLE_DURATIONS.find(
      (duration) => duration.ticks <= Math.min(remaining, available),
    );
    if (!chunk) return { ok: false, code: "NOT_NOTATABLE" };

    const id = index === 0 ? spec.id : `${spec.id}:tie${index}`;
    segments.push({
      measureId: measure.id,
      event: createNoteEvent({
        id,
        step: spec.pitch.step,
        alter: spec.pitch.alter,
        octave: spec.pitch.octave,
        startTick: cursor,
        durationTicks: chunk.ticks,
        velocity: spec.velocity,
        provenance: spec.provenance,
      }),
    });

    if (previousId !== null) ties.push({ from: previousId, to: id });
    previousId = id;
    cursor += chunk.ticks;
    remaining -= chunk.ticks;
    index += 1;
  }

  return { ok: true, segments, ties };
}

export interface TieChainValidationOptions {
  pathPrefix: string;
}

/**
 * Part의 타이 링크 불변식을 검사한다(DATA_MODEL §4).
 * 검증 코드를 문자열로 돌려주어 호출 측(validate.ts)이 ValidationIssue로 감싼다.
 */
export function findTieIssues(
  part: Part,
  options: TieChainValidationOptions,
): { path: string; code: string; message: string }[] {
  const issues: { path: string; code: string; message: string }[] = [];

  if (!Array.isArray(part.ties)) {
    issues.push({
      path: `${options.pathPrefix}.ties`,
      code: "TIE_INVALID_SHAPE",
      message: "ties는 배열이어야 합니다.",
    });
    return issues;
  }

  const seen = new Set<string>();
  const outgoing = new Map<string, string>();
  const incoming = new Map<string, string>();

  for (const tie of part.ties) {
    if (typeof tie?.from !== "string" || typeof tie?.to !== "string") {
      issues.push({
        path: `${options.pathPrefix}.ties`,
        code: "TIE_INVALID_SHAPE",
        message: "tie는 { from, to } 문자열 ID를 가져야 합니다.",
      });
      continue;
    }

    const path = `${options.pathPrefix}.ties[${tie.from}->${tie.to}]`;
    const from = noteById(part, tie.from);
    const to = noteById(part, tie.to);

    if (!from || !to) {
      issues.push({
        path,
        code: "TIE_UNKNOWN_REF",
        message: `연결 대상 note를 찾을 수 없습니다 (${tie.from} → ${tie.to}).`,
      });
      continue;
    }
    if (tie.from === tie.to) {
      issues.push({
        path,
        code: "TIE_SELF_REF",
        message: `음표가 자기 자신과 연결될 수 없습니다 (${tie.from}).`,
      });
      continue;
    }

    const key = `${tie.from}->${tie.to}`;
    if (seen.has(key)) {
      issues.push({
        path,
        code: "TIE_DUPLICATE",
        message: `동일한 타이 링크가 중복되었습니다 (${key}).`,
      });
      continue;
    }
    seen.add(key);

    if (from.startTick + from.durationTicks !== to.startTick) {
      issues.push({
        path,
        code: "TIE_NOT_CONTIGUOUS",
        message: `타이는 시간적으로 연속해야 합니다 (${tie.from} 끝 ${from.startTick + from.durationTicks} ≠ ${tie.to} 시작 ${to.startTick}).`,
      });
    }

    if (
      from.pitch.midi !== to.pitch.midi ||
      from.pitch.step !== to.pitch.step ||
      from.pitch.alter !== to.pitch.alter ||
      from.pitch.octave !== to.pitch.octave
    ) {
      issues.push({
        path,
        code: "TIE_PITCH_MISMATCH",
        message: `타이로 연결된 음표의 음높이가 다릅니다 (${tie.from} → ${tie.to}).`,
      });
    }

    if (outgoing.has(tie.from)) {
      issues.push({
        path,
        code: "TIE_BRANCHING",
        message: `하나의 음표에서 두 개 이상의 타이가 나갈 수 없습니다 (${tie.from}).`,
      });
    } else {
      outgoing.set(tie.from, tie.to);
    }

    if (incoming.has(tie.to)) {
      issues.push({
        path,
        code: "TIE_BRANCHING",
        message: `하나의 음표로 두 개 이상의 타이가 들어올 수 없습니다 (${tie.to}).`,
      });
    } else {
      incoming.set(tie.to, tie.from);
    }

    let cursor: string | undefined = tie.to;
    for (let hop = 0; hop < MAX_TIE_SEGMENTS; hop += 1) {
      cursor = cursor === undefined ? undefined : outgoing.get(cursor);
      if (!cursor) break;
      if (cursor === tie.from) {
        issues.push({
          path,
          code: "TIE_CYCLE",
          message: `타이 체인이 순환합니다 (${tie.from} → ${tie.to}).`,
        });
        break;
      }
    }
  }

  return issues;
}
