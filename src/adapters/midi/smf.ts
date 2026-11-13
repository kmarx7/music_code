import type { ExportPort } from "@/application/ports";
import { measureTicks, mergeTiedNotes, TICKS_PER_QUARTER } from "@/domain/score";
import type { Part, Score } from "@/domain/score";

/*
 * Standard MIDI File writer (D-03 #4): type 1, 960 ticks per quarter (the Score PPQ, so ticks are copied as-is),
 * track 0 = conductor (title, tempo, meter, key), then one track per Part. Notes keep their full Score length,
 * tie chains are one note, and the tempo is always the score tempo (practice rate is not part of Score).
 * Implementation defaults: note-off 0x80 velocity 64, note-offs before note-ons at the same tick,
 * no running status, channels in Part order skipping channel 10 (GM drums), velocity 0 written as 1.
 */

const DRUM_CHANNEL = 9;
const encoder = new TextEncoder();

function vlq(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff) throw new RangeError(`MIDI delta out of range: ${value}`);
  const bytes = [value & 0x7f];
  for (let rest = value >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}
const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const meta = (type: number, data: readonly number[]) => [0xff, type, ...vlq(data.length), ...data];
const textMeta = (type: number, value: string) => meta(type, [...encoder.encode(value)]);

interface TimedEvent { tick: number; order: number; bytes: number[] }

function chunk(events: TimedEvent[], endTick: number): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let tick = 0;
  for (const event of sorted) { body.push(...vlq(event.tick - tick), ...event.bytes); tick = event.tick; }
  body.push(...vlq(Math.max(endTick, tick) - tick), ...meta(0x2f, []));
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
}

function partLength(part: Part): number {
  return part.measures.length * measureTicks(part.timeSignature);
}

export function midiChannel(partIndex: number): number {
  const channel = partIndex % 15;
  return channel >= DRUM_CHANNEL ? channel + 1 : channel;
}

export function writeMidi(score: Readonly<Score>): Uint8Array {
  const endTick = Math.max(0, ...score.parts.map(partLength));
  const first = score.parts[0];
  const conductor: TimedEvent[] = [{ tick: 0, order: 0, bytes: textMeta(0x03, score.title) },
    { tick: 0, order: 1, bytes: meta(0x51, u32(Math.round(60_000_000 / score.tempoBpm)).slice(1)) }];
  if (first) {
    const { numerator, denominator } = first.timeSignature;
    conductor.push({ tick: 0, order: 2, bytes: meta(0x58, [numerator, Math.log2(denominator), 96 / denominator, 8]) });
    const { fifths, mode } = first.keySignature;
    conductor.push({ tick: 0, order: 3, bytes: meta(0x59, [fifths & 0xff, mode === "minor" ? 1 : 0]) });
  }
  const tracks = [chunk(conductor, endTick)];
  score.parts.forEach((part, index) => {
    const channel = midiChannel(index);
    const events: TimedEvent[] = [{ tick: 0, order: 0, bytes: textMeta(0x03, part.name) },
      { tick: 0, order: 1, bytes: [0xc0 | channel, 0] }];
    for (const note of mergeTiedNotes(part)) {
      events.push({ tick: note.startTick, order: 3, bytes: [0x90 | channel, note.pitch.midi, Math.max(1, note.velocity)] });
      events.push({ tick: note.startTick + note.durationTicks, order: 2, bytes: [0x80 | channel, note.pitch.midi, 64] });
    }
    tracks.push(chunk(events, endTick));
  });
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 1, (tracks.length >> 8) & 0xff, tracks.length & 0xff,
    (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff];
  return Uint8Array.from([...header, ...tracks.flat()]);
}

export const midiExport: ExportPort = {
  format: "midi",
  mimeType: "audio/midi",
  write: (score) => ({ ok: true, data: writeMidi(score) }),
};
