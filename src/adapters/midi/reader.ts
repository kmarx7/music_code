import type {
  ImportedKey, ImportedMeasure, ImportedNote, ImportedPart, ImportedScore, ImportedTempo, ImportedTimeSignature, KeySignature,
} from "@/domain/score";
import { MAX_NOTATION_MEASURES, TICKS_PER_QUARTER } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS, spellMidiInKey } from "@/domain/music-theory";

/*
 * Standard MIDI File reader for "악보 올리기" (Phase 8 step 3, spec 2026-11-16-midi-import-design §3). Formats 0
 * and 1 with PPQ timing become the same neutral ImportedScore as MusicXML: one part per (track, channel), the GM
 * drum channel left out and counted, notes paired first in first out, pitches spelled with the key meta in effect.
 * Lenient about a missing end-of-track meta; strict about lengths that run past the file.
 */

export type ReadMidiImportResult =
  | { ok: true; score: ImportedScore }
  | { ok: false; code: "NOT_MIDI" | "FORMAT_2" | "SMPTE" | "CORRUPT"; message: string };

const DRUM_CHANNEL = 9;
/** SMF default when a file has no tempo meta (MIDI spec §3.4). */
const DEFAULT_MIDI_BPM = 120;
const BROKEN = "MIDI 파일로 읽을 수 없습니다.";
const C_MAJOR = KEY_SIGNATURE_OPTIONS.find((option) => option.id === "major:0")!.key;

class Corrupt extends Error {}

interface RawNote { channel: number; midi: number; start: number; end: number }
interface RawTrack { name: string | null; instrument: string | null; notes: RawNote[] }
interface RawMeta { tick: number; type: number; data: Uint8Array }

function decodeText(data: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(data).trim(); }
  catch { return Array.from(data, (byte) => String.fromCharCode(byte)).join("").trim(); }
}

function readTrack(bytes: Uint8Array, start: number, end: number, metas: RawMeta[]): RawTrack {
  let at = start;
  const u8 = () => { if (at >= end) throw new Corrupt(); return bytes[at++]!; };
  const vlq = () => {
    let value = 0;
    for (let i = 0; i < 4; i += 1) { const byte = u8(); value = (value << 7) | (byte & 0x7f); if (!(byte & 0x80)) return value; }
    throw new Corrupt();
  };
  const track: RawTrack = { name: null, instrument: null, notes: [] };
  const open = new Map<string, number[]>();
  let tick = 0;
  let running = 0;
  while (at < end) {
    tick += vlq();
    let status = bytes[at]!;
    if (status & 0x80) at += 1; else if (running) status = running; else throw new Corrupt();
    if (status === 0xff) {
      const type = u8();
      const length = vlq();
      if (at + length > end) throw new Corrupt();
      const data = bytes.subarray(at, at + length);
      at += length;
      running = 0;
      if (type === 0x2f) break;
      if (type === 0x03 && track.name === null) track.name = decodeText(data) || null;
      else if (type === 0x04 && track.instrument === null) track.instrument = decodeText(data) || null;
      else metas.push({ tick, type, data });
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      const length = vlq();
      if (at + length > end) throw new Corrupt();
      at += length; running = 0;
      continue;
    }
    if (status >= 0xf0) throw new Corrupt();
    running = status;
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const data1 = u8();
    const data2 = kind === 0xc0 || kind === 0xd0 ? 0 : u8();
    if (data1 > 0x7f || data2 > 0x7f) throw new Corrupt();
    const key = `${channel}:${data1}`;
    if (kind === 0x90 && data2 > 0) {
      open.set(key, [...(open.get(key) ?? []), tick]);
    } else if (kind === 0x80 || kind === 0x90) {
      const begun = open.get(key)?.shift();
      if (begun !== undefined) track.notes.push({ channel, midi: data1, start: begun, end: tick });
    }
  }
  for (const [key, starts] of open) {
    const [channel, midi] = key.split(":").map(Number) as [number, number];
    for (const begun of starts) track.notes.push({ channel, midi, start: begun, end: tick });
  }
  return track;
}

function keyFromMeta(data: Uint8Array): KeySignature | null {
  if (data.length < 2) return null;
  const fifths = (data[0]! << 24) >> 24;
  const mode = data[1] === 1 ? "minor" : "major";
  return KEY_SIGNATURE_OPTIONS.find((option) => option.key.fifths === fifths && option.key.mode === mode)?.key ?? null;
}

const barTicks = (time: { numerator: number; denominator: number }) => (time.numerator * 4 * TICKS_PER_QUARTER) / time.denominator;

/** Bars from the signatures; stops one past the notation limit so a corrupt delta cannot build millions. */
function buildMeasures(timeSignatures: readonly ImportedTimeSignature[], endTick: number, pickupTicks: number): ImportedMeasure[] {
  const measures: ImportedMeasure[] = [];
  let tick = 0;
  let index = 0;
  if (pickupTicks > 0) {
    measures.push({ number: "1", startTick: 0, lengthTicks: pickupTicks, implicit: true });
    tick = pickupTicks;
  }
  while ((tick < endTick || measures.length === 0) && measures.length <= MAX_NOTATION_MEASURES) {
    while (index + 1 < timeSignatures.length && timeSignatures[index + 1]!.tick <= tick) index += 1;
    const time = timeSignatures[index] ?? { numerator: 4, denominator: 4 };
    const length = barTicks(time);
    measures.push({ number: String(measures.length + 1), startTick: tick, lengthTicks: length, implicit: false });
    tick += length;
  }
  return measures;
}

export function readMidiImport(bytes: Uint8Array): ReadMidiImportResult {
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const u16 = (at: number) => (bytes[at]! << 8) | bytes[at + 1]!;
  const u32 = (at: number) => ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!;
  if (bytes.length < 14 || tag(0) !== "MThd" || u32(4) < 6) return { ok: false, code: "NOT_MIDI", message: BROKEN };
  const format = u16(8);
  const trackCount = u16(10);
  const division = u16(12);
  if (format === 2) return { ok: false, code: "FORMAT_2", message: "지원하지 않는 MIDI 형식(형식 2)입니다." };
  if (format > 2) return { ok: false, code: "NOT_MIDI", message: BROKEN };
  if (division & 0x8000) return { ok: false, code: "SMPTE", message: "지원하지 않는 MIDI 시간 형식(SMPTE)입니다." };
  if (division === 0) return { ok: false, code: "CORRUPT", message: BROKEN };

  const metas: RawMeta[] = [];
  const tracks: RawTrack[] = [];
  try {
    let at = 8 + u32(4);
    for (let index = 0; index < trackCount; index += 1) {
      if (at + 8 > bytes.length) throw new Corrupt();
      const length = u32(at + 4);
      const start = at + 8;
      if (start + length > bytes.length) throw new Corrupt();
      if (tag(at) === "MTrk") tracks.push(readTrack(bytes, start, start + length, metas));
      at = start + length;
    }
  } catch {
    return { ok: false, code: "CORRUPT", message: BROKEN };
  }

  const toTicks = (tick: number) => (tick * TICKS_PER_QUARTER) / division;
  metas.sort((a, b) => a.tick - b.tick);
  const tempos: ImportedTempo[] = [];
  const timeSignatures: ImportedTimeSignature[] = [];
  const keyMarks: { tick: number; key: KeySignature }[] = [];
  let lyrics = 0;
  for (const { tick, type, data } of metas) {
    const at = toTicks(tick);
    if (type === 0x51 && data.length === 3) {
      const micro = (data[0]! << 16) | (data[1]! << 8) | data[2]!;
      if (micro > 0) tempos.push({ tick: at, bpm: Math.round((60_000_000 / micro) * 100) / 100 });
    } else if (type === 0x58 && data.length >= 2 && data[0]! > 0 && data[1]! <= 6) {
      timeSignatures.push({ tick: at, numerator: data[0]!, denominator: 2 ** data[1]! });
    } else if (type === 0x59) {
      const key = keyFromMeta(data);
      if (key) keyMarks.push({ tick: at, key });
    } else if (type === 0x05) {
      lyrics += 1;
    }
  }
  if (tempos.length === 0) tempos.push({ tick: 0, bpm: DEFAULT_MIDI_BPM });
  // A pickup exported as its own one-bar signature (e.g. 1/4 then 4/4): the piece is in the second meter.
  let pickupTicks = 0;
  const [firstTime, secondTime] = timeSignatures;
  if (firstTime && secondTime && firstTime.tick === 0 && secondTime.tick === barTicks(firstTime) && barTicks(firstTime) < barTicks(secondTime)) {
    pickupTicks = barTicks(firstTime);
    timeSignatures.splice(0, 2, { tick: 0, numerator: secondTime.numerator, denominator: secondTime.denominator });
  }
  const keys: ImportedKey[] = keyMarks.map(({ tick, key }) => ({ tick, fifths: key.fifths, mode: key.mode, nonStandard: false }));
  const keyAt = (tick: number) => {
    let key = keyMarks[0]?.key ?? C_MAJOR;
    for (const mark of keyMarks) if (mark.tick <= tick) key = mark.key;
    return key;
  };

  let drums = 0;
  const groups: { name: string; notes: RawNote[] }[] = [];
  tracks.forEach((track, trackIndex) => {
    const channels = [...new Set(track.notes.map((note) => note.channel))].sort((a, b) => a - b);
    const melodic = channels.filter((channel) => channel !== DRUM_CHANNEL);
    drums += track.notes.filter((note) => note.channel === DRUM_CHANNEL).length;
    const base = track.name ?? track.instrument ?? `트랙 ${trackIndex + 1}`;
    for (const channel of melodic) {
      groups.push({ name: melodic.length > 1 ? `${base} · 채널 ${channel + 1}` : base, notes: track.notes.filter((note) => note.channel === channel) });
    }
  });

  let endTick = 0;
  for (const group of groups) for (const note of group.notes) endTick = Math.max(endTick, toTicks(note.end));
  const measures = buildMeasures(timeSignatures, endTick, pickupTicks);
  const measureAt = (tick: number) => {
    let number = "1";
    for (const measure of measures) if (measure.startTick <= tick) number = measure.number;
    return number;
  };
  const parts: ImportedPart[] = groups.map((group, index) => {
    const notes: ImportedNote[] = [...group.notes].sort((a, b) => a.start - b.start || b.midi - a.midi).map((note) => {
      const startTick = toTicks(note.start);
      const pitch = spellMidiInKey(note.midi, keyAt(startTick));
      return {
        measureNumber: measureAt(startTick), startTick, durationTicks: toTicks(note.end) - startTick,
        pitch: { step: pitch.step, alter: pitch.alter, octave: pitch.octave },
        staff: 1, voice: "1", chord: false, grace: false, cue: false, tieStart: false, tieStop: false,
      };
    });
    return { id: `M${index + 1}`, name: group.name, staves: 1, notes, measures, timeSignatures, keys };
  });

  const titleTrack = tracks[0];
  const title = format === 1 && titleTrack?.name ? titleTrack.name : null;
  return { ok: true, score: { title, tempos, parts, ignored: { repeats: 0, lyrics, directions: 0, drums } } };
}
