/** Test-only SMF bytes: each track is raw `delta, event…` bytes; an end-of-track meta is appended. */
export function vlq(value: number): number[] {
  const out = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) out.unshift((rest & 0x7f) | 0x80);
  return out;
}
/** A text meta event at delta 0. */
export function text(type: number, value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)];
  return [0, 0xff, type, ...vlq(bytes.length), ...bytes]; // delta 0 + meta
}
export function makeSmf({ format = 1, division = 480, tracks, endOfTrack = true }: { format?: number; division?: number; tracks: number[][]; endOfTrack?: boolean }): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, format, 0, tracks.length, (division >> 8) & 0xff, division & 0xff];
  const chunks = tracks.flatMap((track) => {
    const body = endOfTrack ? [...track, 0, 0xff, 0x2f, 0] : track;
    return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
  });
  return Uint8Array.from([...header, ...chunks]);
}
