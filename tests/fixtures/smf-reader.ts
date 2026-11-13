/**
 * Test-only Standard MIDI File reader, written from the SMF 1.0 spec and independent of the writer (D-03 #7).
 * It is strict: wrong chunk lengths, missing end-of-track or trailing bytes throw.
 */
export interface SmfNote { track: number; channel: number; midi: number; startTick: number; durationTicks: number; velocity: number }
export interface SmfMeta { track: number; tick: number; type: number; data: Uint8Array }
export interface SmfChannelEvent { track: number; tick: number; status: number; data: number[] }
export interface SmfFile {
  format: number; trackCount: number; division: number;
  tracks: { endTick: number }[];
  metas: SmfMeta[]; channelEvents: SmfChannelEvent[]; notes: SmfNote[];
}

export function readSmf(bytes: Uint8Array): SmfFile {
  let at = 0;
  const u8 = () => { if (at >= bytes.length) throw new Error(`unexpected end at ${at}`); return bytes[at++]; };
  const u16 = () => (u8() << 8) | u8();
  const u32 = () => ((u8() << 24) >>> 0) + (u8() << 16) + (u8() << 8) + u8();
  const tag = () => String.fromCharCode(u8(), u8(), u8(), u8());
  const vlq = () => { let value = 0; for (let i = 0; i < 4; i++) { const b = u8(); value = (value << 7) | (b & 0x7f); if (!(b & 0x80)) return value; } throw new Error("VLQ longer than 4 bytes"); };

  if (tag() !== "MThd" || u32() !== 6) throw new Error("bad header chunk");
  const format = u16(); const trackCount = u16(); const division = u16();
  if (division & 0x8000) throw new Error("SMPTE division not expected");
  const file: SmfFile = { format, trackCount, division, tracks: [], metas: [], channelEvents: [], notes: [] };

  for (let track = 0; track < trackCount; track++) {
    if (tag() !== "MTrk") throw new Error(`track ${track}: bad chunk tag`);
    const length = u32(); const end = at + length;
    let tick = 0; let running = 0; let ended = false;
    const open = new Map<string, { startTick: number; velocity: number }[]>();
    while (at < end) {
      if (ended) throw new Error(`track ${track}: data after end of track`);
      tick += vlq();
      let status = bytes[at];
      if (status & 0x80) at++; else if (running) status = running; else throw new Error("running status without status");
      if (status === 0xff) {
        const type = u8(); const length = vlq();
        const data = bytes.slice(at, at + length); at += length;
        file.metas.push({ track, tick, type, data });
        if (type === 0x2f) { if (length !== 0) throw new Error("bad end of track"); ended = true; file.tracks.push({ endTick: tick }); }
        running = 0;
      } else if (status === 0xf0 || status === 0xf7) {
        at += vlq(); running = 0;
      } else {
        running = status;
        const kind = status & 0xf0; const channel = status & 0x0f;
        const data = kind === 0xc0 || kind === 0xd0 ? [u8()] : [u8(), u8()];
        if (data.some((b) => b > 0x7f)) throw new Error("data byte out of range");
        file.channelEvents.push({ track, tick, status, data });
        const key = `${channel}:${data[0]}`;
        if (kind === 0x90 && data[1] > 0) {
          open.set(key, [...(open.get(key) ?? []), { startTick: tick, velocity: data[1] }]);
        } else if (kind === 0x80 || kind === 0x90) {
          const stack = open.get(key);
          const first = stack?.shift();
          if (!first) throw new Error(`track ${track}: note off without note on (${key} @${tick})`);
          file.notes.push({ track, channel, midi: data[0], startTick: first.startTick, durationTicks: tick - first.startTick, velocity: first.velocity });
        }
      }
    }
    if (at !== end) throw new Error(`track ${track}: chunk length mismatch`);
    if (!ended) throw new Error(`track ${track}: missing end of track`);
    if ([...open.values()].some((stack) => stack.length)) throw new Error(`track ${track}: hanging note`);
  }
  if (at !== bytes.length) throw new Error("trailing bytes after last track");
  file.notes.sort((a, b) => a.track - b.track || a.startTick - b.startTick || a.midi - b.midi);
  return file;
}
