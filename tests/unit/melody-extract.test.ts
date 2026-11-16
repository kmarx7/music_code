import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMusicXml } from "@/adapters/musicxml";
import { extractMelody, IMPORT_GRID_TICKS } from "@/domain/score";
import type { ImportedScore, ImportNoticeCode, MelodyExtraction, NoteEvent } from "@/domain/score";
import { parseXmlLite } from "../fixtures/xml-lite";

const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures/musicxml-import", name), "utf8");
function read(text: string): ImportedScore {
  const result = readMusicXml(parseXmlLite(text));
  if (!result.ok) throw new Error(result.message);
  return result.score;
}
function ok(result: MelodyExtraction) {
  if (!result.ok) throw new Error(result.message);
  return result;
}
const notes = (result: ReturnType<typeof ok>) => result.clipboard.events as NoteEvent[];
const notice = (result: ReturnType<typeof ok>, code: ImportNoticeCode) => result.notices.find((item) => item.code === code);
const spelled = (event: NoteEvent) => `${event.pitch.step}${event.pitch.alter === 1 ? "#" : event.pitch.alter === -1 ? "b" : ""}${event.pitch.octave}`;

function partwise(measures: string, { attributes = "<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>", parts = 1 } = {}) {
  const list = Array.from({ length: parts }, (_, i) => `<score-part id="P${i + 1}"><part-name>Part ${i + 1}</part-name></score-part>`).join("");
  const body = Array.from({ length: parts }, (_, i) => `<part id="P${i + 1}"><measure number="1"><attributes>${attributes}</attributes>${measures}</measure></part>`).join("");
  return `<score-partwise><part-list>${list}</part-list>${body}</score-partwise>`;
}
const n = (step: string, octave: number, duration: number, extra = "") =>
  `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice></note>`;

describe("extractMelody (Phase 8 step 1)", () => {
  it("simple melody comes through unchanged", () => {
    const result = ok(extractMelody(read(fixture("simple-melody.musicxml"))));
    expect(result.notices).toEqual([]);
    expect(result.settings).toEqual({
      title: "아리랑 연습", tempoBpm: 100, timeSignature: { numerator: 4, denominator: 4 },
      keySignature: { tonic: "G", alter: 0, mode: "major", fifths: 1 },
    });
    expect(result.noteCount).toBe(12);
    expect(notes(result)[0]).toMatchObject({ startTick: 0, durationTicks: 960, pitch: { step: "G", octave: 4, midi: 67 }, provenance: { source: "import" } });
    expect(result.clipboard.lengthTicks).toBe(4 * 3840);
    expect(result.clipboard.ties).toEqual([]);
  });

  it("piano keeps the upper staff and the top of each chord", () => {
    const result = ok(extractMelody(read(fixture("piano-two-staves.musicxml"))));
    expect(notice(result, "LOWER_STAFF_DROPPED")).toMatchObject({ count: 2, measures: ["1", "2"] });
    expect(notice(result, "CHORD_NOTES_DROPPED")).toMatchObject({ count: 2 });
    expect(notes(result).map(spelled)).toEqual(["E5", "G5", "D5", "C5", "D5", "E5"]);
    expect(notes(result).map((event) => [event.startTick, event.durationTicks])).toEqual([
      [0, 960], [960, 960], [1920, 1920], [3840, 960], [4800, 960], [5760, 1920],
    ]);
  });

  it("extract keeps the higher voice when two voices overlap in the upper staff", () => {
    const xml = partwise(`${n("C", 5, 4)}<backup><duration>4</duration></backup>`
      + `<note><rest/><duration>1</duration><voice>2</voice></note>`
      + `<note><pitch><step>A</step><octave>4</octave></pitch><duration>3</duration><voice>2</voice></note>`);
    const result = ok(extractMelody(read(xml)));
    expect(notes(result).map(spelled)).toEqual(["C5"]);
    expect(notes(result)[0]!.durationTicks).toBe(3840);
    expect(notice(result, "OVERLAP_TRUNCATED")).toMatchObject({ count: 1 });
  });

  it("merges a staff split when staves never overlap", () => {
    const xml = partwise(
      `<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>`
      + `<backup><duration>2</duration></backup><forward><duration>2</duration></forward>`
      + `<note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>5</voice><staff>2</staff></note>`,
      { attributes: "<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>" },
    );
    const result = ok(extractMelody(read(xml)));
    expect(notice(result, "LOWER_STAFF_DROPPED")).toBeUndefined();
    expect(notes(result).map(spelled)).toEqual(["C5", "C3"]);
  });

  it("rounds tuplets to sixteenths and drops grace and cue", () => {
    const result = ok(extractMelody(read(fixture("odd-rhythm.musicxml"))));
    expect(notice(result, "ROUNDED_TO_GRID")).toMatchObject({ count: 3, measures: ["1"] });
    expect(notice(result, "GRACE_DROPPED")).toMatchObject({ count: 1 });
    expect(notice(result, "CUE_DROPPED")).toMatchObject({ count: 1 });
    for (const event of notes(result)) {
      expect(event.startTick % IMPORT_GRID_TICKS).toBe(0);
      expect(event.durationTicks % IMPORT_GRID_TICKS).toBe(0);
    }
    expect(notes(result).map(spelled)).toEqual(["C5", "D5", "E5", "G5", "C5"]);
    expect(notes(result).at(-1)).toMatchObject({ startTick: 2880, durationTicks: 1920 });
  });

  it("pads the pickup and reports changes", () => {
    const result = ok(extractMelody(read(fixture("pickup-and-changes.musicxml"))));
    expect(notes(result)[0]!.startTick).toBe(3840 - 960);
    expect(notice(result, "PICKUP_PADDED")).toBeDefined();
    expect(notice(result, "TIME_SIGNATURE_CHANGED")).toMatchObject({ count: 1, measures: ["2"] });
    expect(notice(result, "KEY_CHANGED")).toMatchObject({ count: 1, measures: ["2"] });
    expect(notice(result, "MODE_AS_MAJOR")).toMatchObject({ detail: "dorian" });
    expect(notice(result, "TEMPO_CHANGED")).toMatchObject({ count: 1, measures: ["2"] });
    for (const code of ["REPEATS_IGNORED", "LYRICS_IGNORED", "DIRECTIONS_IGNORED"] as const) expect(notice(result, code)).toBeDefined();
    expect(result.settings).toMatchObject({ tempoBpm: 80, timeSignature: { numerator: 4, denominator: 4 }, keySignature: { tonic: "C", mode: "major", fifths: 0 } });
  });

  it("clamps tempo", () => {
    const score = read(fixture("simple-melody.musicxml"));
    const result = ok(extractMelody({ ...score, tempos: [{ tick: 0, bpm: 600 }] }));
    expect(result.settings.tempoBpm).toBe(400);
    expect(notice(result, "TEMPO_CLAMPED")).toBeDefined();
    expect(ok(extractMelody({ ...score, tempos: [] })).settings.tempoBpm).toBe(90);
  });

  it("rejects unsupported keys and empty parts", () => {
    const key = extractMelody(read(partwise(n("C", 5, 4), { attributes: "<divisions>1</divisions><key><fifths>8</fifths></key>" })));
    expect(key.ok ? "ok" : key.code).toBe("UNSUPPORTED_KEY");
    const time = extractMelody(read(partwise(n("C", 5, 4), { attributes: "<divisions>1</divisions><time><beats>4</beats><beat-type>3</beat-type></time>" })));
    expect(time.ok ? "ok" : time.code).toBe("UNSUPPORTED_TIME");
    const empty = extractMelody(read(partwise(`<note><rest/><duration>4</duration><voice>1</voice></note>`)));
    expect(empty.ok ? "ok" : empty.code).toBe("NO_NOTES");
  });

  it("part choice", () => {
    const score = read(partwise(n("C", 5, 4), { parts: 2 }));
    const second = score.parts[1]!;
    second.notes = second.notes.map((note) => ({ ...note, pitch: { step: "E", alter: 0, octave: 5 } }));
    const result = ok(extractMelody(score, { partIndex: 1 }));
    expect(result.partIndex).toBe(1);
    expect(notes(result).map(spelled)).toEqual(["E5"]);
    expect(result.parts).toEqual([{ index: 0, name: "Part 1", noteCount: 1 }, { index: 1, name: "Part 2", noteCount: 1 }]);
    expect(ok(extractMelody(score)).partIndex).toBe(0);
  });

  it("titles fall back and are trimmed", () => {
    const score = read(partwise(n("C", 5, 4)));
    expect(ok(extractMelody(score, { fallbackTitle: "my-song" })).settings.title).toBe("my-song");
    expect(ok(extractMelody(score)).settings.title).toBe("가져온 악보");
    expect(ok(extractMelody({ ...score, title: `  ${"가".repeat(200)} ` })).settings.title).toHaveLength(120);
  });
});

describe("extractMelody review fixes", () => {
  it("a lower voice pushed later never hides the next melody note", () => {
    const xml = partwise(`${n("C", 5, 2)}${n("D", 5, 2)}<backup><duration>4</duration></backup>`
      + `<note><rest/><duration>1</duration><voice>2</voice></note>`
      + `<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>2</voice></note>`
      + `<note><rest/><duration>1</duration><voice>2</voice></note>`);
    const result = ok(extractMelody(read(xml)));
    expect(notes(result).map(spelled)).toEqual(["C5", "D5"]);
    expect(notes(result).map((event) => [event.startTick, event.durationTicks])).toEqual([[0, 1920], [1920, 1920]]);
  });

  it("a short first measure without implicit is a pickup", () => {
    const xml = `<score-partwise><part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list><part id="P1">`
      + `<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${n("G", 4, 1)}</measure>`
      + `<measure number="2">${n("C", 5, 4)}</measure></part></score-partwise>`;
    const result = ok(extractMelody(read(xml)));
    expect(notes(result).map((event) => event.startTick)).toEqual([2880, 3840]);
    expect(notice(result, "PICKUP_PADDED")).toBeDefined();
  });

  it("notatable rhythms such as 32nds are kept exactly", () => {
    const thirtySeconds = Array.from({ length: 8 }, () => n("C", 5, 1)).join("") + n("D", 5, 3) + n("E", 5, 1) + `<note><rest/><duration>20</duration><voice>1</voice></note>`;
    const result = ok(extractMelody(read(partwise(thirtySeconds, { attributes: "<divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time>" }))));
    expect(notes(result).map((event) => event.durationTicks)).toEqual([120, 120, 120, 120, 120, 120, 120, 120, 360, 120]);
    expect(notice(result, "ROUNDED_TO_GRID")).toBeUndefined();
    expect(notice(result, "DROPPED_ZERO_LENGTH")).toBeUndefined();
  });
});

describe("extractMelody MIDI rules (Phase 8 step 3)", () => {
  const imported = (starts: [number, number][], extra: Partial<ImportedScore> = {}): ImportedScore => ({
    title: "t", tempos: [{ tick: 0, bpm: 120 }], ignored: { repeats: 0, lyrics: 0, directions: 0 }, ...extra,
    parts: [{ id: "M1", name: "m", staves: 1, timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }], keys: [],
      measures: [{ number: "1", startTick: 0, lengthTicks: 3840, implicit: false }, { number: "2", startTick: 3840, lengthTicks: 3840, implicit: false }],
      notes: starts.map(([start, length], index) => ({ measureNumber: "1", startTick: start, durationTicks: length,
        pitch: { step: (["C", "D", "E", "F"] as const)[index % 4]!, alter: 0, octave: 5 },
        staff: 1, voice: "1", chord: false, grace: false, cue: false, tieStart: false, tieStop: false })) }],
  });

  it("performance MIDI snaps the whole part", () => {
    // 990 is notatable on its own (a multiple of 30) but sits in a played, unquantized take.
    const result = ok(extractMelody(imported([[5, 950], [990, 940], [1915, 980]]), { rhythm: "grid-all-if-any-off" }));
    expect(notes(result).map((event) => [event.startTick, event.durationTicks])).toEqual([[0, 960], [960, 960], [1920, 960]]);
    expect(notice(result, "PERFORMANCE_QUANTIZED")).toMatchObject({ count: 3 });
    expect(notice(result, "ROUNDED_TO_GRID")).toBeUndefined();
  });

  it("notation MIDI stays exact under the MIDI rule", () => {
    const result = ok(extractMelody(imported([[0, 120], [120, 360], [480, 480]]), { rhythm: "grid-all-if-any-off" }));
    expect(notes(result).map((event) => [event.startTick, event.durationTicks])).toEqual([[0, 120], [120, 360], [480, 480]]);
    expect(notice(result, "PERFORMANCE_QUANTIZED")).toBeUndefined();
  });

  it("reports drums and an assumed key", () => {
    const result = ok(extractMelody(imported([[0, 960]], { ignored: { repeats: 0, lyrics: 0, directions: 0, drums: 4 } })));
    expect(notice(result, "DRUMS_IGNORED")).toMatchObject({ count: 4 });
    expect(notice(result, "KEY_ASSUMED")).toBeDefined();
    expect(result.settings.keySignature).toMatchObject({ fifths: 0, mode: "major" });
  });

  it("fractional tempo is rounded without a clamp notice", () => {
    const result = ok(extractMelody(imported([[0, 960]], { tempos: [{ tick: 0, bpm: 96.5 }] })));
    expect(result.settings.tempoBpm).toBe(97);
    expect(notice(result, "TEMPO_CLAMPED")).toBeUndefined();
    expect(notice(ok(extractMelody(imported([[0, 960]], { tempos: [{ tick: 0, bpm: 10.4 }] }))), "TEMPO_CLAMPED")).toBeDefined();
  });
});

describe("extractMelody MIDI review fixes", () => {
  const imported = (starts: [number, number][]): ImportedScore => ({
    title: "t", tempos: [{ tick: 0, bpm: 120 }], ignored: { repeats: 0, lyrics: 0, directions: 0 },
    parts: [{ id: "M1", name: "m", staves: 1, timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }], keys: [],
      measures: [{ number: "1", startTick: 0, lengthTicks: 3840, implicit: false }],
      notes: starts.map(([start, length], index) => ({ measureNumber: "1", startTick: start, durationTicks: length,
        pitch: { step: (["C", "D", "E", "F", "G", "A"] as const)[index % 6]!, alter: 0, octave: 5 },
        staff: 1, voice: "1", chord: false, grace: false, cue: false, tieStart: false, tieStop: false })) }],
  });

  it("played short notes keep at least a sixteenth", () => {
    const result = ok(extractMelody(imported([[3, 100], [483, 100], [963, 100]]), { rhythm: "grid-all-if-any-off" }));
    expect(notes(result).map((event) => [event.startTick, event.durationTicks])).toEqual([[0, 240], [480, 240], [960, 240]]);
    expect(notice(result, "DROPPED_ZERO_LENGTH")).toBeUndefined();
  });

  it("triplets do not make a notation MIDI look played", () => {
    // quarter, three 8th triplets, two 32nds, dotted 8th
    const result = ok(extractMelody(imported([[0, 960], [960, 320], [1280, 320], [1600, 320], [1920, 120], [2040, 120], [2160, 720]]),
      { rhythm: "grid-all-if-any-off" }));
    expect(notice(result, "PERFORMANCE_QUANTIZED")).toBeUndefined();
    expect(notes(result).slice(4).map((event) => [event.startTick, event.durationTicks])).toEqual([[1920, 120], [2040, 120], [2160, 720]]);
    expect(notice(result, "ROUNDED_TO_GRID")).toBeDefined();
  });
});
