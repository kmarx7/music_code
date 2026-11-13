import { describe, expect, it } from "vitest";
import { exportScore } from "@/application";
import { midiExport, writeMidi } from "@/adapters/midi";
import { createEmptyScore, createNoteEvent, mergeTiedNotes, TICKS_PER_QUARTER } from "@/domain/score";
import type { Part, Score } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { readSmf } from "../fixtures/smf-reader";
import { baseScore, fourNoteScore, FIXTURE_CREATED_AT, longTiedScore, tiedScore } from "../fixtures/scores";

const text = (data: Uint8Array) => new TextDecoder().decode(data);
const expectedNotes = (score: Score) => score.parts.flatMap((part, index) => mergeTiedNotes(part).map((note) => ({
  track: index + 1, midi: note.pitch.midi, startTick: note.startTick, durationTicks: note.durationTicks, velocity: Math.max(1, note.velocity),
}))).sort((a, b) => a.track - b.track || a.startTick - b.startTick || a.midi - b.midi);
const notesOf = (score: Score) => readSmf(writeMidi(score)).notes.map(({ track, midi, startTick, durationTicks, velocity }) =>
  ({ track, midi, startTick, durationTicks, velocity }));

function twoPartScore(): Score {
  const score = fourNoteScore();
  const bass: Part = { ...score.parts[0], id: "part-2", name: "Bass", clef: "bass", ties: [],
    measures: score.parts[0].measures.map((measure) => ({ ...measure, id: `${measure.id}-b`, events: measure.index === 0
      ? [createNoteEvent({ id: "b1", step: "C", octave: 3, startTick: 0, durationTicks: 3840 })] : [] })) };
  return { ...score, parts: [score.parts[0], bass] };
}

describe("writeMidi", () => {
  it("writes SMF type 1 at 960 ticks per quarter with a conductor track and one track per part", () => {
    const file = readSmf(writeMidi(twoPartScore()));
    expect(file).toMatchObject({ format: 1, trackCount: 3, division: TICKS_PER_QUARTER });
    expect(TICKS_PER_QUARTER).toBe(960);
    const header = writeMidi(baseScore()).slice(0, 14);
    expect([...header]).toEqual([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x03, 0xc0]);
  });

  it("puts the score's tempo, meter, key and title on the conductor track at tick 0", () => {
    const eMinor = KEY_SIGNATURE_OPTIONS.find((option) => option.key.mode === "minor" && option.key.fifths === 1)!.key;
    const score = { ...baseScore(), title: "연습곡 <1>", tempoBpm: 90 };
    score.parts[0] = { ...score.parts[0], keySignature: eMinor, timeSignature: { numerator: 6, denominator: 8 } };
    const metas = readSmf(writeMidi(score)).metas.filter((meta) => meta.track === 0);
    const meta = (type: number) => metas.find((entry) => entry.type === type)!;
    expect(metas.filter((entry) => entry.type !== 0x2f).every((entry) => entry.tick === 0)).toBe(true);
    expect([...meta(0x51).data]).toEqual([0x0a, 0x2c, 0x2b]); // 60 000 000 / 90 = 666 666.7 → 666 667 µs
    expect([...meta(0x58).data]).toEqual([6, 3, 12, 8]);
    expect([...meta(0x59).data]).toEqual([1, 1]);
    expect(text(meta(0x03).data)).toBe("연습곡 <1>");
  });

  it("encodes flat keys as a signed byte", () => {
    const score = baseScore();
    const bFlat = KEY_SIGNATURE_OPTIONS.find((option) => option.key.mode === "major" && option.key.fifths === -2)!.key;
    score.parts[0] = { ...score.parts[0], keySignature: bFlat };
    const key = readSmf(writeMidi(score)).metas.find((meta) => meta.type === 0x59)!;
    expect([...key.data]).toEqual([0xfe, 0]);
  });

  it("writes every note at its own tick and full length (no playback gate)", () => {
    const score = fourNoteScore();
    expect(notesOf(score)).toEqual(expectedNotes(score));
    expect(notesOf(score).map((note) => note.durationTicks)).toEqual([960, 960, 960, 960]);
  });

  it("joins a tie chain into one note, including chains across many measures", () => {
    expect(notesOf(tiedScore())).toEqual([{ track: 1, midi: 60, startTick: 2880, durationTicks: 1920, velocity: expect.any(Number) }]);
    const long = longTiedScore(300, true);
    expect(notesOf(long)).toEqual(expectedNotes(long));
    expect(notesOf(long)).toHaveLength(1);
  });

  it("keeps all parts on their own tracks and channels, piano program, skipping the drum channel", () => {
    const parts = Array.from({ length: 11 }, (_, index): Part => ({ ...baseScore().parts[0], id: `p${index}`, name: `P${index}`, ties: [],
      measures: baseScore().parts[0].measures.map((measure) => ({ ...measure, id: `m${index}-${measure.index}`, events: measure.index === 0
        ? [createNoteEvent({ id: `n${index}`, step: "C", octave: 4, startTick: 0, durationTicks: 960 })] : [] })) }));
    const file = readSmf(writeMidi({ ...baseScore(), parts }));
    const channels = file.notes.map((note) => note.channel);
    expect(channels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11]);
    const programs = file.channelEvents.filter((event) => (event.status & 0xf0) === 0xc0);
    expect(programs.map((event) => event.data[0])).toEqual(new Array(11).fill(0));
    const names = file.metas.filter((meta) => meta.type === 0x03 && meta.track > 0).map((meta) => text(meta.data));
    expect(names).toEqual(parts.map((part) => part.name));
  });

  it("keeps a repeated pitch at a shared boundary as two notes", () => {
    const score = baseScore();
    score.parts[0].measures[0].events = [
      createNoteEvent({ id: "a", step: "E", octave: 4, startTick: 0, durationTicks: 960 }),
      createNoteEvent({ id: "b", step: "E", octave: 4, startTick: 960, durationTicks: 960 }),
    ];
    expect(notesOf(score).map((note) => [note.startTick, note.durationTicks])).toEqual([[0, 960], [960, 960]]);
  });

  it("writes lengths that cannot be notated, exactly", () => {
    const score = baseScore();
    score.parts[0].measures[0].events = [createNoteEvent({ id: "odd", step: "G", octave: 4, startTick: 7, durationTicks: 1001 })];
    expect(notesOf(score)).toEqual([{ track: 1, midi: 67, startTick: 7, durationTicks: 1001, velocity: expect.any(Number) }]);
  });

  it("keeps the event velocity and raises velocity 0 to 1 so it is not read as a note-off", () => {
    const score = baseScore();
    score.parts[0].measures[0].events = [
      { ...createNoteEvent({ id: "loud", step: "C", octave: 5, startTick: 0, durationTicks: 960 }), velocity: 112 },
      { ...createNoteEvent({ id: "mute", step: "D", octave: 5, startTick: 960, durationTicks: 960 }), velocity: 0 },
    ];
    expect(notesOf(score).map((note) => note.velocity)).toEqual([112, 1]);
  });

  it("ends every track at the end of the last measure, so trailing rests and empty measures keep their length", () => {
    const score = createEmptyScore({ id: "rests", measureCount: 3, createdAt: FIXTURE_CREATED_AT });
    score.parts[0].measures[0].events = [createNoteEvent({ id: "n", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
      { kind: "rest", id: "r", startTick: 960, durationTicks: 960 }];
    const file = readSmf(writeMidi(score));
    expect(file.tracks.map((track) => track.endTick)).toEqual([3 * 3840, 3 * 3840]);
  });

  it("writes a valid file with no notes for an empty or rest-only score", () => {
    const empty = createEmptyScore({ id: "e", measureCount: 1, createdAt: FIXTURE_CREATED_AT });
    expect(readSmf(writeMidi(empty)).notes).toEqual([]);
    empty.parts[0].measures[0].events = [{ kind: "rest", id: "r", startTick: 0, durationTicks: 3840 }];
    expect(readSmf(writeMidi(empty)).notes).toEqual([]);
  });
});

describe("midiExport through exportScore", () => {
  it("returns a .mid file and leaves the score untouched", () => {
    const score = tiedScore();
    const before = JSON.stringify(score);
    const result = exportScore(score, midiExport);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.filename).toBe(`${score.title}.mid`);
    expect(result.file.mimeType).toBe("audio/midi");
    expect(readSmf(result.file.data as Uint8Array).notes).toHaveLength(1);
    expect(JSON.stringify(score)).toBe(before);
  });
});

describe("independent read-back (P5-03)", () => {
  const fixtures: [string, () => Score][] = [
    ["base", baseScore], ["four notes", fourNoteScore], ["tie", tiedScore], ["two parts", twoPartScore],
    ["long tie", () => longTiedScore(40)], ["long tie after a rest", () => longTiedScore(9, true)],
  ];
  it.each(fixtures)("%s: (pitch, start, length, velocity) per part equals mergeTiedNotes", (_name, make) => {
    const score = make();
    expect(notesOf(score)).toEqual(expectedNotes(score));
    const file = readSmf(writeMidi(score));
    expect(file.trackCount).toBe(score.parts.length + 1);
    expect(file.tracks.every((track) => track.endTick === Math.max(...score.parts.map((part) => part.measures.length * 3840)))).toBe(true);
  });
});
