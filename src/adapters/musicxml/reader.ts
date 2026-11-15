import type {
  DiatonicStep, ImportedKey, ImportedMeasure, ImportedNote, ImportedPart, ImportedScore, ImportedTempo, ImportedTimeSignature,
} from "@/domain/score";

/*
 * MusicXML partwise reader (Phase 8 step 1). Walks each part with a tick cursor: <note> advances it (except
 * <chord/> and grace notes), <backup>/<forward> move it. Ticks are duration * 960 / divisions, so tuplets stay
 * exact when divisions allow and may be fractional otherwise. Grace notes are kept with length 0; cue notes are
 * flagged. Repeats, lyrics and directions are only counted. Works on any DOM-like tree (XmlElementLike).
 */

export interface XmlElementLike {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  readonly children: ArrayLike<XmlElementLike>;
  readonly textContent: string | null;
}

export type ReadMusicXmlResult =
  | { ok: true; score: ImportedScore }
  | { ok: false; code: "NOT_MUSICXML" | "TIMEWISE" | "NO_PARTS"; message: string };

const TICKS_PER_QUARTER = 960;
const STEPS = new Set<string>(["C", "D", "E", "F", "G", "A", "B"]);
/** <notations> children that the import uses or that carry no meaning for a melody. */
const NOTATIONS_KEPT = new Set(["tied", "tuplet", "slur"]);

const localName = (element: XmlElementLike) => element.tagName.replace(/^.*:/, "");
function childrenOf(element: XmlElementLike): XmlElementLike[] {
  return Array.from(element.children);
}
function child(element: XmlElementLike, name: string): XmlElementLike | undefined {
  return childrenOf(element).find((item) => localName(item) === name);
}
function text(element: XmlElementLike | undefined): string | null {
  const value = element?.textContent?.trim();
  return value ? value : null;
}
function number(element: XmlElementLike | undefined): number | null {
  const value = text(element);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface Ignored { repeats: number; lyrics: number; directions: number }

function readTempo(direction: XmlElementLike): number | null {
  const sound = localName(direction) === "sound" ? direction : child(direction, "sound");
  const soundTempo = Number(sound?.getAttribute("tempo") ?? NaN);
  if (Number.isFinite(soundTempo) && soundTempo > 0) return soundTempo;
  for (const type of childrenOf(direction).filter((item) => localName(item) === "direction-type")) {
    const metronome = child(type, "metronome");
    if (!metronome || child(metronome, "beat-unit-dot")) continue;
    const perMinute = number(child(metronome, "per-minute"));
    if (text(child(metronome, "beat-unit")) === "quarter" && perMinute !== null && perMinute > 0) return perMinute;
  }
  return null;
}

function countDirections(direction: XmlElementLike): number {
  let count = 0;
  for (const type of childrenOf(direction).filter((item) => localName(item) === "direction-type")) {
    count += childrenOf(type).filter((item) => localName(item) !== "metronome").length;
  }
  return count;
}

function readKey(key: XmlElementLike, tick: number): ImportedKey {
  const fifths = number(child(key, "fifths"));
  if (fifths === null) return { tick, fifths: 0, mode: text(child(key, "mode")), nonStandard: true };
  return { tick, fifths, mode: text(child(key, "mode")), nonStandard: false };
}

function readPart(part: XmlElementLike, name: string, tempos: ImportedTempo[], ignored: Ignored): ImportedPart {
  const notes: ImportedNote[] = [];
  const measures: ImportedMeasure[] = [];
  const timeSignatures: ImportedTimeSignature[] = [];
  const keys: ImportedKey[] = [];
  let divisions = 1;
  let staves = 1;
  let measureStart = 0;
  let measureTicks = 4 * TICKS_PER_QUARTER;
  let lastNoteStart = 0;

  for (const measure of childrenOf(part).filter((item) => localName(item) === "measure")) {
    const measureNumber = measure.getAttribute("number") ?? String(measures.length + 1);
    let cursor = measureStart;
    let reached = measureStart;
    const toTicks = (element: XmlElementLike | undefined) => ((number(element) ?? 0) * TICKS_PER_QUARTER) / divisions;

    for (const item of childrenOf(measure)) {
      switch (localName(item)) {
        case "attributes": {
          const nextDivisions = number(child(item, "divisions"));
          if (nextDivisions !== null && nextDivisions > 0) divisions = nextDivisions;
          const nextStaves = number(child(item, "staves"));
          if (nextStaves !== null && nextStaves > 0) staves = nextStaves;
          const key = child(item, "key");
          if (key) keys.push(readKey(key, cursor));
          const time = child(item, "time");
          const beats = number(time && child(time, "beats"));
          const beatType = number(time && child(time, "beat-type"));
          if (beats !== null && beatType !== null && beats > 0 && beatType > 0) {
            timeSignatures.push({ tick: cursor, numerator: beats, denominator: beatType });
            measureTicks = (beats * 4 * TICKS_PER_QUARTER) / beatType;
          }
          break;
        }
        case "note": {
          const chord = Boolean(child(item, "chord"));
          const grace = Boolean(child(item, "grace"));
          const start = chord ? lastNoteStart : cursor;
          const durationTicks = grace ? 0 : toTicks(child(item, "duration"));
          const pitchElement = child(item, "pitch");
          const step = text(pitchElement && child(pitchElement, "step"));
          const octave = number(pitchElement && child(pitchElement, "octave"));
          const pitch = pitchElement && step && STEPS.has(step) && octave !== null
            ? { step: step as DiatonicStep, alter: number(child(pitchElement, "alter")) ?? 0, octave }
            : null;
          const ties = childrenOf(item).filter((entry) => localName(entry) === "tie").map((entry) => entry.getAttribute("type"));
          const notations = childrenOf(item).filter((entry) => localName(entry) === "notations");
          for (const group of notations) {
            for (const mark of childrenOf(group)) {
              if (localName(mark) === "tied") ties.push(mark.getAttribute("type"));
              else if (!NOTATIONS_KEPT.has(localName(mark))) ignored.directions += 1;
            }
          }
          ignored.lyrics += childrenOf(item).filter((entry) => localName(entry) === "lyric").length;
          notes.push({
            measureNumber, startTick: start, durationTicks, pitch,
            staff: number(child(item, "staff")) ?? 1,
            voice: text(child(item, "voice")) ?? "1",
            chord, grace, cue: Boolean(child(item, "cue")),
            tieStart: ties.includes("start"), tieStop: ties.includes("stop"),
          });
          if (!chord && !grace) { lastNoteStart = start; cursor = start + durationTicks; }
          reached = Math.max(reached, start + durationTicks);
          break;
        }
        case "backup":
          cursor = Math.max(measureStart, cursor - toTicks(child(item, "duration")));
          break;
        case "forward":
          cursor += toTicks(child(item, "duration"));
          reached = Math.max(reached, cursor);
          break;
        case "direction": {
          const bpm = readTempo(item);
          if (bpm !== null) tempos.push({ tick: cursor, bpm });
          ignored.directions += countDirections(item);
          break;
        }
        case "sound": {
          const bpm = readTempo(item);
          if (bpm !== null) tempos.push({ tick: cursor, bpm });
          break;
        }
        case "harmony":
          ignored.directions += 1;
          break;
        case "barline":
          ignored.repeats += childrenOf(item).filter((entry) => ["repeat", "ending"].includes(localName(entry))).length;
          break;
        default:
          break;
      }
    }

    const implicit = measure.getAttribute("implicit") === "yes";
    // A short first measure keeps its length (a pickup even without implicit="yes"); later ones are at least a bar.
    const used = reached - measureStart;
    const lengthTicks = used <= 0 ? measureTicks : implicit || measures.length === 0 ? used : Math.max(used, measureTicks);
    measures.push({ number: measureNumber, startTick: measureStart, lengthTicks, implicit });
    measureStart += lengthTicks;
  }

  return { id: part.getAttribute("id") ?? `P${tempos.length}`, name, staves, notes, measures, timeSignatures, keys };
}

/** Same tick: the later mark wins; consecutive equal tempos collapse. */
function normalizeTempos(tempos: ImportedTempo[]): ImportedTempo[] {
  const byTick = new Map<number, number>();
  for (const tempo of tempos) byTick.set(tempo.tick, tempo.bpm);
  const sorted = [...byTick].sort(([a], [b]) => a - b).map(([tick, bpm]) => ({ tick, bpm }));
  return sorted.filter((tempo, index) => index === 0 || tempo.bpm !== sorted[index - 1]!.bpm);
}

export function readMusicXml(root: XmlElementLike): ReadMusicXmlResult {
  const rootName = localName(root);
  if (rootName === "score-timewise") {
    return { ok: false, code: "TIMEWISE", message: "시간 단위(timewise) MusicXML은 아직 읽을 수 없습니다. 악보 프로그램에서 일반(partwise) MusicXML로 다시 내보내 주세요." };
  }
  if (rootName !== "score-partwise") {
    return { ok: false, code: "NOT_MUSICXML", message: "MusicXML 악보 파일이 아닙니다." };
  }
  const partNames = new Map<string, string>();
  const partList = child(root, "part-list");
  for (const scorePart of partList ? childrenOf(partList).filter((item) => localName(item) === "score-part") : []) {
    const id = scorePart.getAttribute("id");
    if (id) partNames.set(id, text(child(scorePart, "part-name")) ?? id);
  }
  const tempos: ImportedTempo[] = [];
  const ignored: Ignored = { repeats: 0, lyrics: 0, directions: 0 };
  const parts = childrenOf(root).filter((item) => localName(item) === "part").map((part, index) => {
    const id = part.getAttribute("id") ?? `P${index + 1}`;
    return { ...readPart(part, partNames.get(id) ?? id, tempos, ignored), id };
  });
  if (parts.length === 0) return { ok: false, code: "NO_PARTS", message: "악보에 파트가 없습니다." };
  const work = child(root, "work");
  const title = text(work && child(work, "work-title")) ?? text(child(root, "movement-title"));
  return { ok: true, score: { title, tempos: normalizeTempos(tempos), parts, ignored } };
}
