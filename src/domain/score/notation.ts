import { NOTATABLE_DURATIONS } from "./tie";
import type { NotatableDuration } from "./tie";
import { measureStartTick, measureTicks } from "./create";
import type { Part, ScoreEvent } from "./types";

/** Rendering budgets, never limits on reading or persisting canonical Score data. */
export const MAX_NOTATION_FRAGMENTS = 64;
export const MAX_NOTATION_TICKABLES = 4096;
export const MAX_NOTATION_MEASURES = 1024;
const UNIT = 30; // gcd of the existing 18 notatable durations
/** Every notatable start and length is a multiple of this. */
export const NOTATION_UNIT_TICKS = UNIT;
const MAX_TICKS = MAX_NOTATION_FRAGMENTS * NOTATABLE_DURATIONS[0].ticks;
export interface NotationIssue {
  readonly code: "INVALID_NOTATION_DURATION" | "NOT_NOTATABLE" | "NOTATION_LIMIT" | "INVALID_NOTATION_POSITION";
  readonly message: string;
  readonly partId?: string;
  readonly measureId?: string;
  readonly measureNumber?: number;
  readonly eventId?: string;
  readonly startTick?: number;
  readonly durationTicks?: number;
}
export type DurationNotationResult =
  | { readonly ok: true; readonly durations: readonly Readonly<NotatableDuration>[] }
  | { readonly ok: false; readonly issue: NotationIssue };

/** Minimum glyph count, then longer first at every tie. Integer units; no rounding or greedy fallback. */
export function decomposeNotationDuration(ticks: number): DurationNotationResult {
  if (!Number.isSafeInteger(ticks) || ticks <= 0) return { ok: false, issue: {
    code: "INVALID_NOTATION_DURATION", message: "기보 길이는 안전한 양의 정수 tick이어야 합니다.",
  } };
  if (ticks > MAX_TICKS) return { ok: false, issue: {
    code: "NOTATION_LIMIT", message: "한 이벤트의 안전한 기보 분해 한도를 초과했습니다.",
  } };
  if (ticks % UNIT !== 0) return { ok: false, issue: {
    code: "NOT_NOTATABLE", message: "현재 지원 음가의 합으로 정확히 기보할 수 없는 길이입니다.",
  } };
  const direct = NOTATABLE_DURATIONS.find((duration) => duration.ticks === ticks);
  if (direct) return { ok: true, durations: [{ ...direct }] };
  const target = ticks / UNIT;
  const counts = new Uint16Array(target + 1).fill(65535);
  const choices = new Int8Array(target + 1).fill(-1);
  counts[0] = 0;
  for (let total = 1; total <= target; total++) {
    NOTATABLE_DURATIONS.forEach((duration, index) => {
      const previous = total - duration.ticks / UNIT;
      if (previous >= 0 && counts[previous] + 1 < counts[total]) {
        counts[total] = counts[previous] + 1; choices[total] = index;
      }
    });
  }
  if (counts[target] === 65535) return { ok: false, issue: {
    code: "NOT_NOTATABLE", message: "현재 지원 음가의 합으로 정확히 기보할 수 없는 길이입니다.",
  } };
  if (counts[target] > MAX_NOTATION_FRAGMENTS) return { ok: false, issue: {
    code: "NOTATION_LIMIT", message: "한 이벤트의 안전한 기보 요소 수를 초과했습니다.",
  } };
  const durations: NotatableDuration[] = [];
  for (let remaining = target; remaining > 0;) {
    const duration = NOTATABLE_DURATIONS[choices[remaining]];
    durations.push({ ...duration }); remaining -= duration.ticks / UNIT;
  }
  return { ok: true, durations };
}

/** Read-only projection. References canonical events without creating or editing Score events/ties. */
export interface NotationFragment {
  readonly event: ScoreEvent;
  readonly startTick: number;
  readonly duration: Readonly<NotatableDuration>;
  readonly index: number;
  readonly count: number;
}
export type PartNotationResult =
  | { readonly ok: true; readonly measures: readonly (readonly NotationFragment[])[] }
  | { readonly ok: false; readonly issue: NotationIssue };

export function planPartNotation(part: Part): PartNotationResult {
  const length = measureTicks(part.timeSignature);
  if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_TICKS || part.measures.length > MAX_NOTATION_MEASURES) {
    return { ok: false, issue: { code: "NOTATION_LIMIT", partId: part.id, message: "악보가 안전한 기보 범위를 초과했습니다. 원본 데이터는 유지됩니다." } };
  }
  const measures: NotationFragment[][] = [];
  const cache = new Map<number, DurationNotationResult>();
  let elements = 0;
  for (const measure of part.measures) {
    const start = measureStartTick(measure.index, part.timeSignature); const end = start + length;
    let cursor = start;
    const fragments: NotationFragment[] = [];
    for (const event of [...measure.events].sort((a, b) => a.startTick - b.startTick)) {
      const context = { partId: part.id, measureId: measure.id, measureNumber: measure.index + 1,
        eventId: event.id, startTick: event.startTick, durationTicks: event.durationTicks };
      const reject = (issue: NotationIssue): PartNotationResult => ({ ok: false, issue: { ...issue, ...context,
        message: `${measure.index + 1}마디 · 이벤트 ${event.id} · 시작 ${event.startTick} ticks · 길이 ${event.durationTicks} ticks: ${issue.message} 원본 악보·재생·저장·JSON 백업은 유지됩니다.`,
      } });
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(event.startTick) ||
          !Number.isSafeInteger(event.startTick + event.durationTicks) || event.startTick < cursor || event.startTick + event.durationTicks > end) {
        return reject({ code: "INVALID_NOTATION_POSITION", message: "기보 위치가 마디 범위를 벗어나거나 다른 이벤트와 겹칩니다." });
      }
      let result = cache.get(event.durationTicks);
      if (!result) { result = decomposeNotationDuration(event.durationTicks); cache.set(event.durationTicks, result); }
      if (!result.ok) return reject(result.issue);
      if (event.startTick > cursor) elements++;
      let tick = event.startTick;
      result.durations.forEach((duration, index) => {
        fragments.push({ event, startTick: tick, duration, index, count: result.durations.length }); tick += duration.ticks;
      });
      elements += result.durations.length; cursor = tick;
      if (elements > MAX_NOTATION_TICKABLES) return reject({ code: "NOTATION_LIMIT", message: "악보의 안전한 기보 요소 수를 초과했습니다." });
    }
    if (fragments.length && cursor < end) elements++;
    if (elements > MAX_NOTATION_TICKABLES) return { ok: false, issue: { code: "NOTATION_LIMIT", partId: part.id, message: "악보의 안전한 기보 요소 수를 초과했습니다. 원본 데이터는 유지됩니다." } };
    measures.push(fragments);
  }
  return { ok: true, measures };
}
