import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMPORT_MAX_FILE_BYTES, readScoreFile } from "@/adapters/file-import";
import { writeMusicXml } from "@/adapters/musicxml";
import { buildImportedScore, createImportedScore, type ImportedScoreInput } from "@/application";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { createNoteEvent, extractMelody, validateScore } from "@/domain/score";
import type { ClipboardPayload, ImportedScore, NoteEvent, Score } from "@/domain/score";
import { MemoryScoreRepository } from "../fixtures/memory-repository";
import { parseXmlLite } from "../fixtures/xml-lite";
import { makeZip } from "../fixtures/zip";
import { makeSmf, vlq } from "../fixtures/smf-builder";

const parse = (text: string) => { try { return parseXmlLite(text); } catch { return null; } };
const fixtureBytes = (name: string) => new Uint8Array(readFileSync(join(__dirname, "../fixtures/musicxml-import", name)));
const encode = (text: string) => new TextEncoder().encode(text);

async function imported(file: { name: string; bytes: Uint8Array }): Promise<ImportedScore> {
  const result = await readScoreFile(file, parse);
  if (!result.ok) throw new Error(result.message);
  return result.imported;
}
async function message(file: { name: string; bytes: Uint8Array }, parser = parse): Promise<string> {
  const result = await readScoreFile(file, parser);
  return result.ok ? "ok" : result.message;
}
function input(score: ImportedScore, patch: Partial<ImportedScoreInput> = {}): ImportedScoreInput {
  const melody = extractMelody(score);
  if (!melody.ok) throw new Error(melody.message);
  let id = 0;
  return {
    id: "imported", createdAt: "2026-11-16T00:00:00.000Z", settings: melody.settings, clipboard: melody.clipboard,
    instrument: "piano", transpose: null, nextId: () => `m-${(id += 1)}`, ...patch,
  };
}
function built(value: ImportedScoreInput): Score {
  const result = buildImportedScore(value);
  if (!result.ok) throw new Error(result.message);
  return result.score;
}
const scoreNotes = (score: Score) => score.parts[0]!.measures.flatMap((measure) => measure.events)
  .filter((event): event is NoteEvent => event.kind === "note");

describe("readScoreFile (Phase 8 step 1)", () => {
  it("reads a .musicxml file", async () => {
    const result = await readScoreFile({ name: "simple-melody.musicxml", bytes: fixtureBytes("simple-melody.musicxml") }, parse);
    expect(result.ok && result.fileTitle).toBe("simple-melody");
    expect(result.ok && result.imported.title).toBe("아리랑 연습");
  });

  it("reads the same score from .mxl", async () => {
    const plain = await imported({ name: "simple-melody.musicxml", bytes: fixtureBytes("simple-melody.musicxml") });
    const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>';
    const bytes = makeZip([
      { name: "mimetype", data: "application/vnd.recordare.musicxml", method: 0 },
      { name: "META-INF/container.xml", data: container, method: 8 },
      { name: "score.musicxml", data: fixtureBytes("simple-melody.musicxml"), method: 8 },
    ]);
    expect(await imported({ name: "song.mxl", bytes })).toEqual(plain);
    // A zip is recognised by its first bytes even with another extension.
    expect(await imported({ name: "song.musicxml", bytes })).toEqual(plain);
  });

  it("rejects big, broken and unknown files", async () => {
    expect(await message({ name: "a.musicxml", bytes: new Uint8Array(IMPORT_MAX_FILE_BYTES + 1) })).toBe("파일이 너무 큽니다(최대 5MB).");
    expect(await message({ name: "a.mxl", bytes: encode("PK\u0003\u0004 broken") })).toBe("압축 악보(.mxl)를 열 수 없습니다.");
    expect(await message({ name: "a.mxl", bytes: makeZip([{ name: "readme.txt", data: "no score" }]) })).toBe("압축 악보(.mxl)를 열 수 없습니다.");
    expect(await message({ name: "a.musicxml", bytes: encode('<?xml version="1.0" encoding="Shift_JIS"?><score-partwise/>') }))
      .toBe("지원하지 않는 글자 인코딩입니다. UTF-8로 저장한 MusicXML을 올려 주세요.");
    expect(await message({ name: "a.musicxml", bytes: encode("<score-partwise>") }, () => null)).toBe("MusicXML 파일로 읽을 수 없습니다.");
    expect(await message({ name: "a.musicxml", bytes: encode("<score-timewise/>") })).toBe("지원하지 않는 MusicXML 형식(score-timewise)입니다.");
    expect(await message({ name: "a.musicxml", bytes: encode("<score-partwise><part-list/></score-partwise>") })).toBe("악보에 파트가 없습니다.");
    expect(await message({ name: "a.musicxml", bytes: encode("<html/>") })).toBe("MusicXML 악보 파일이 아닙니다.");
  });
});

describe("buildImportedScore", () => {
  it("builds a 25-string score in B♭ major", async () => {
    const score = await imported({ name: "simple-melody.musicxml", bytes: fixtureBytes("simple-melody.musicxml") });
    const bFlat = KEY_SIGNATURE_OPTIONS.find((option) => option.id === "major:-2")!.key;
    const result = built(input(score, { instrument: "gayageum-25", transpose: { kind: "targetKey", targetKey: bFlat, direction: "nearest" } }));
    expect(result.parts[0]!.instrument).toBe("gayageum-25");
    expect(result.parts[0]!.keySignature.fifths).toBe(-2);
    expect(result.title).toBe("아리랑 연습");
    expect(result.tempoBpm).toBe(100);
    expect(validateScore(result)).toEqual([]);
    expect(scoreNotes(result)).toHaveLength(12);
  });

  it("uses the suggested clef for a low piano melody", () => {
    const events = ["C", "D", "E", "C"].map((step, index) => createNoteEvent({ id: `n${index}`, step: step as "C", octave: 3, startTick: index * 960, durationTicks: 960 }));
    const clipboard: ClipboardPayload = { lengthTicks: 3840, events, ties: [] };
    const settings = { title: "낮은 선율", tempoBpm: 90, timeSignature: { numerator: 4, denominator: 4 }, keySignature: KEY_SIGNATURE_OPTIONS.find((o) => o.id === "major:0")!.key };
    let id = 0;
    const result = built({ id: "low", createdAt: "2026-11-16T00:00:00.000Z", settings, clipboard, instrument: "piano", transpose: null, nextId: () => `m${(id += 1)}` });
    expect(result.parts[0]!.clef).toBe("bass");
  });

  it("round trip of an exported grand-staff score", async () => {
    const pitches: [string, number][] = [["C", 3], ["E", 4], ["G", 3], ["C", 5], ["A", 3], ["F", 4]];
    const events = pitches.map(([step, octave], index) => createNoteEvent({ id: `n${index}`, step: step as "C", octave, startTick: index * 960, durationTicks: 960 }));
    const settings = { title: "왕복", tempoBpm: 90, timeSignature: { numerator: 4, denominator: 4 }, keySignature: KEY_SIGNATURE_OPTIONS.find((o) => o.id === "major:0")!.key };
    let id = 0;
    const original = built({ id: "rt", createdAt: "2026-11-16T00:00:00.000Z", settings, clipboard: { lengthTicks: 7680, events, ties: [] }, instrument: "gayageum-25", transpose: null, nextId: () => `m${(id += 1)}` });
    const written = writeMusicXml(original);
    if (!written.ok) throw new Error(written.issue.message);
    const back = await imported({ name: "rt.musicxml", bytes: typeof written.data === "string" ? encode(written.data) : written.data });
    expect(back.parts[0]!.staves).toBe(2);
    const melody = extractMelody(back);
    if (!melody.ok) throw new Error(melody.message);
    expect(melody.notices.find((item) => item.code === "LOWER_STAFF_DROPPED")).toBeUndefined();
    const shape = (list: readonly NoteEvent[]) => list.map((event) => [event.pitch.midi, event.startTick, event.durationTicks]);
    expect(shape(melody.clipboard.events as NoteEvent[])).toEqual(shape(scoreNotes(original)));
  });

  it("createImportedScore writes once and nothing on failure", async () => {
    const score = await imported({ name: "simple-melody.musicxml", bytes: fixtureBytes("simple-melody.musicxml") });
    const repository = new MemoryScoreRepository();
    await createImportedScore(repository, input(score));
    expect(await repository.list()).toHaveLength(1);
    const empty = new MemoryScoreRepository();
    const bad = input(score);
    await expect(createImportedScore(empty, { ...bad, settings: { ...bad.settings, tempoBpm: 1000 } })).rejects.toThrow();
    expect(await empty.list()).toHaveLength(0);
  });
});

describe("readScoreFile with MIDI (Phase 8 step 3)", () => {
  const smf = () => makeSmf({ format: 0, tracks: [[0, 0x90, 60, 100, ...vlq(480), 0x80, 60, 0]] });

  it("routes .mid files and MThd bytes to the MIDI reader", async () => {
    const byName = await readScoreFile({ name: "tune.mid", bytes: smf() }, parse);
    expect(byName.ok && [byName.format, byName.fileTitle, byName.imported.parts[0]!.notes.length]).toEqual(["midi", "tune", 1]);
    const byBytes = await readScoreFile({ name: "tune.bin", bytes: smf() }, parse);
    expect(byBytes.ok && byBytes.format).toBe("midi");
    const xml = await readScoreFile({ name: "simple-melody.musicxml", bytes: fixtureBytes("simple-melody.musicxml") }, parse);
    expect(xml.ok && xml.format).toBe("musicxml");
  });

  it("explains broken MIDI files", async () => {
    expect(await message({ name: "a.midi", bytes: encode("not midi") })).toBe("MIDI 파일로 읽을 수 없습니다.");
    expect(await message({ name: "a.mid", bytes: makeSmf({ format: 2, tracks: [[]] }) })).toBe("지원하지 않는 MIDI 형식(형식 2)입니다.");
  });
});
