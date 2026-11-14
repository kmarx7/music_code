import { describe, expect, it } from "vitest";
import { exportScore } from "@/application";
import { musicXmlExport, writeMusicXml } from "@/adapters/musicxml";
import { createEmptyScore, createNoteEvent, createRestEvent } from "@/domain/score";
import type { Part, Score } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { validateMusicXml, xpath } from "../fixtures/xmllint";
import { baseScore, FIXTURE_CREATED_AT, fourNoteScore, longTiedScore, tiedScore } from "../fixtures/scores";

const xml = (score: Score) => {
  const result = writeMusicXml(score);
  if (!result.ok) throw new Error(result.issue.message);
  if (typeof result.data !== "string") throw new Error("MusicXML must be text");
  return result.data;
};
const valid = (text: string) => expect(validateMusicXml(text), validateMusicXml(text).output).toMatchObject({ ok: true });
const count = (text: string, path: string) => Number(xpath(text, `count(${path})`));
const str = (text: string, path: string) => xpath(text, `string(${path})`);
const note = (n: number) => `(//part[1]//note)[${n}]`;

function twoPartScore(): Score {
  const score = fourNoteScore();
  const bass: Part = { ...score.parts[0], id: "part 2 & <b>", name: "Bass", clef: "bass", ties: [],
    measures: score.parts[0].measures.map((measure) => ({ ...measure, id: `${measure.id}-b`, events: measure.index === 0
      ? [createNoteEvent({ id: "b1", step: "C", octave: 3, startTick: 0, durationTicks: 3840 })] : [] })) };
  return { ...score, parts: [score.parts[0], bass] };
}

describe("writeMusicXml", () => {
  it("names the product as the encoding software", () => {
    expect(str(xml(fourNoteScore()), "//identification/encoding/software")).toBe("허밍버드");
  });

  it("writes a valid MusicXML 4.0 partwise document with 960 divisions", () => {
    const text = xml(fourNoteScore());
    valid(text);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(str(text, "/score-partwise/@version")).toBe("4.0");
    expect(str(text, "//part[1]/measure[1]/attributes/divisions")).toBe("960");
  });

  it("writes title, part names, key, meter, clef and the score tempo", () => {
    const eMinor = KEY_SIGNATURE_OPTIONS.find((option) => option.key.mode === "minor" && option.key.fifths === 1)!.key;
    const score = { ...baseScore(), title: `R&B <"연습곡"> 'x'`, tempoBpm: 96 };
    score.parts[0] = { ...score.parts[0], name: "Melody & Co", keySignature: eMinor, timeSignature: { numerator: 6, denominator: 8 }, clef: "bass" };
    const text = xml(score);
    valid(text);
    expect(str(text, "//work/work-title")).toBe(`R&B <"연습곡"> 'x'`);
    expect(str(text, "//part-list/score-part[1]/part-name")).toBe("Melody & Co");
    const attributes = "//part[1]/measure[1]/attributes";
    expect([str(text, `${attributes}/key/fifths`), str(text, `${attributes}/key/mode`)]).toEqual(["1", "minor"]);
    expect([str(text, `${attributes}/time/beats`), str(text, `${attributes}/time/beat-type`)]).toEqual(["6", "8"]);
    expect([str(text, `${attributes}/clef/sign`), str(text, `${attributes}/clef/line`)]).toEqual(["F", "4"]);
    expect(str(text, "//part[1]/measure[1]/direction/sound/@tempo")).toBe("96");
    expect(str(text, "//part[1]/measure[1]/direction//metronome/per-minute")).toBe("96");
    expect(count(text, "//part[1]/measure[position() > 1]/attributes")).toBe(0);
  });

  it("drops control characters XML cannot carry, so any stored title still gives a valid file", () => {
    const text = xml({ ...baseScore(), title: "a\u0001b\u001fc\td" });
    valid(text);
    expect(str(text, "//work/work-title")).toBe("abc\td");
  });

  it("keeps the spelling of every pitch (step, alter, octave)", () => {
    const score = baseScore();
    score.parts[0].measures[0].events = [
      createNoteEvent({ id: "a", step: "F", alter: 1, octave: 4, startTick: 0, durationTicks: 960 }),
      createNoteEvent({ id: "b", step: "G", alter: -1, octave: 4, startTick: 960, durationTicks: 960 }),
      createNoteEvent({ id: "c", step: "B", alter: 1, octave: 3, startTick: 1920, durationTicks: 960 }),
      createNoteEvent({ id: "d", step: "D", alter: -2, octave: 5, startTick: 2880, durationTicks: 960 }),
    ];
    const text = xml(score);
    valid(text);
    const spelled = [1, 2, 3, 4].map((n) => [str(text, `${note(n)}/pitch/step`), str(text, `${note(n)}/pitch/alter`), str(text, `${note(n)}/pitch/octave`)]);
    expect(spelled).toEqual([["F", "1", "4"], ["G", "-1", "4"], ["B", "1", "3"], ["D", "-2", "5"]]);
    expect(count(text, "//note/pitch[not(alter)]")).toBe(0);
  });

  it("omits alter for natural pitches", () => {
    const text = xml(fourNoteScore());
    expect(count(text, "//note/pitch/alter")).toBe(0);
  });

  it("writes type and dots from the exact decomposition, and rests as rests", () => {
    const score = baseScore();
    score.parts[0].measures[0].events = [
      createNoteEvent({ id: "dotted", step: "C", octave: 4, startTick: 0, durationTicks: 1440 }),
      { kind: "rest", id: "r", startTick: 1440, durationTicks: 480 },
      createNoteEvent({ id: "half", step: "D", octave: 4, startTick: 1920, durationTicks: 1920 }),
    ];
    const text = xml(score);
    valid(text);
    expect([str(text, note(1) + "/type"), count(text, note(1) + "/dot"), str(text, note(1) + "/duration")]).toEqual(["quarter", 1, "1440"]);
    expect([count(text, note(2) + "/rest"), str(text, note(2) + "/type")]).toEqual([1, "eighth"]);
    expect([str(text, note(3) + "/type"), count(text, note(3) + "/dot")]).toEqual(["half", 0]);
  });

  it("splits one event into tied fragments when it needs several glyphs", () => {
    const score = baseScore();
    // 5 eighths = half + eighth: one event, two glyphs joined by a tie.
    score.parts[0].measures[0].events = [createNoteEvent({ id: "five", step: "E", octave: 4, startTick: 0, durationTicks: 2400 })];
    const text = xml(score);
    valid(text);
    expect(count(text, "//part[1]//note")).toBe(2);
    expect([str(text, note(1) + "/type"), str(text, note(2) + "/type")]).toEqual(["half", "eighth"]);
    expect([str(text, note(1) + "/tie/@type"), str(text, note(1) + "/notations/tied/@type")]).toEqual(["start", "start"]);
    expect([str(text, note(2) + "/tie/@type"), str(text, note(2) + "/notations/tied/@type")]).toEqual(["stop", "stop"]);
  });

  it("writes Part.ties across bar lines as tie stop/start pairs", () => {
    const text = xml(tiedScore());
    valid(text);
    const head = "//part[1]/measure[1]/note[pitch]"; const tail = "//part[1]/measure[2]/note[pitch]";
    expect([count(text, `${head}/tie[@type='start']`), count(text, `${head}/tie[@type='stop']`)]).toEqual([1, 0]);
    expect([count(text, `${tail}/tie[@type='stop']`), count(text, `${tail}/tie[@type='start']`)]).toEqual([1, 0]);
    const long = xml(longTiedScore(12));
    valid(long);
    expect(count(long, "//note[tie[@type='start'] and tie[@type='stop']]")).toBe(10);
  });

  it("advances over gaps with <forward> instead of inventing rests, and fills a started measure to its end", () => {
    const score = baseScore();
    score.parts[0].measures[0].events = [createNoteEvent({ id: "late", step: "A", octave: 4, startTick: 960, durationTicks: 960 })];
    const text = xml(score);
    valid(text);
    expect(count(text, "//note/rest")).toBe(0);
    const forwards = xpath(text, "//part[1]/measure[1]/forward/duration/text()").split(/\s+/);
    expect(forwards).toEqual(["960", "1920"]);
    expect(count(text, "//part[1]/measure[2]/*[self::note or self::forward]")).toBe(0);
  });

  it("writes every part with its own clef and an XML-safe part id", () => {
    const text = xml(twoPartScore());
    valid(text);
    expect(count(text, "//part")).toBe(2);
    expect(xpath(text, "//score-part/@id").replace(/\s+/g, " ")).toBe('id="P1" id="P2"');
    expect(str(text, "//part[2]/measure[1]/attributes/clef/sign")).toBe("F");
    expect(str(text, "//part[2]//note[1]/type")).toBe("whole");
  });

  it("refuses a length that cannot be notated, naming the measure, and writes nothing", () => {
    const score = createEmptyScore({ id: "odd", measureCount: 2, createdAt: FIXTURE_CREATED_AT });
    score.parts[0].measures[1].events = [createNoteEvent({ id: "odd-note", step: "G", octave: 4, startTick: 3840, durationTicks: 1001 })];
    const result = writeMusicXml(score);
    expect(result).toMatchObject({ ok: false, issue: { code: "NOT_NOTATABLE", measureNumber: 2, eventId: "odd-note" } });
    if (!result.ok) expect(result.issue.message).toContain("2마디");
  });

  it("validates an empty score and a rest-only score", () => {
    const empty = createEmptyScore({ id: "e", measureCount: 2, createdAt: FIXTURE_CREATED_AT });
    valid(xml(empty));
    empty.parts[0].measures[0].events = [{ kind: "rest", id: "r", startTick: 0, durationTicks: 3840 }];
    const text = xml(empty);
    valid(text);
    expect(str(text, "//note/rest/../type")).toBe("whole");
  });
});

describe("read-back against the score (P5-05)", () => {
  const fixtures: [string, () => Score][] = [
    ["base", baseScore], ["four notes", fourNoteScore], ["tie", tiedScore], ["two parts", twoPartScore],
    ["long tie", () => longTiedScore(40)], ["long tie after a rest", () => longTiedScore(9, true)],
  ];
  it.each(fixtures)("%s: schema-valid, same measure count, spelling and per-measure duration", (_name, make) => {
    const score = make();
    const text = xml(score);
    valid(text);
    score.parts.forEach((part, p) => {
      const at = `//part[${p + 1}]`;
      expect(count(text, `${at}/measure`)).toBe(part.measures.length);
      const notes = part.measures.flatMap((measure) => measure.events).filter((event) => event.kind === "note");
      const steps = count(text, `${at}//note[pitch]`) ? xpath(text, `${at}//note[pitch][not(tie[@type='stop'])]/pitch/step/text()`).split(/\s+/) : [];
      expect(steps).toEqual(notes.filter((event) => !part.ties.some((tie) => tie.to === event.id)).map((event) => event.pitch.step));
      part.measures.forEach((measure, m) => {
        const used = measure.events.reduce((sum, event) => sum + event.durationTicks, 0);
        const written = Number(xpath(text, `sum(${at}/measure[${m + 1}]/note/duration)`));
        expect(written).toBe(used);
      });
    });
  });
});

describe("musicXmlExport through exportScore", () => {
  it("returns a .musicxml file and leaves the score untouched", () => {
    const score = tiedScore();
    const before = JSON.stringify(score);
    const result = exportScore(score, musicXmlExport);
    expect(result).toMatchObject({ ok: true, file: { filename: `${score.title}.musicxml`, mimeType: "application/vnd.recordare.musicxml+xml" } });
    expect(JSON.stringify(score)).toBe(before);
  });
});

describe("writeMusicXml: 25현 가야금 on a grand staff (B-1)", () => {
  function gayageumScore(): Score {
    const score = createEmptyScore({ id: "g", createdAt: FIXTURE_CREATED_AT, measureCount: 2 });
    const part = score.parts[0];
    const events = [
      createNoteEvent({ id: "hi", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
      createNoteEvent({ id: "lo", step: "E", octave: 2, startTick: 960, durationTicks: 960 }),
      createRestEvent({ id: "r", startTick: 1920, durationTicks: 960 }),
      createNoteEvent({ id: "top", step: "G", octave: 5, startTick: 2880, durationTicks: 960 }),
    ];
    return { ...score, parts: [{ ...part, instrument: "gayageum-25",
      measures: part.measures.map((measure) => (measure.index === 0 ? { ...measure, events } : measure)) }] };
  }

  it("declares two staves with treble and bass clefs, and puts each glyph on its staff; still valid MusicXML 4.0", () => {
    const text = xml(gayageumScore());
    valid(text);
    expect(str(text, "//part[1]/measure[1]/attributes/staves")).toBe("2");
    expect(str(text, '//part[1]/measure[1]/attributes/clef[@number="1"]/sign')).toBe("G");
    expect(str(text, '//part[1]/measure[1]/attributes/clef[@number="2"]/sign')).toBe("F");
    expect(str(text, '//part[1]/measure[1]/attributes/clef[@number="2"]/line')).toBe("4");
    expect([1, 2, 3, 4].map((n) => str(text, `${note(n)}/staff`))).toEqual(["1", "2", "2", "1"]);
  });

  it("keeps a single clef and no <staff> for the piano and the 12-string sanjo gayageum", () => {
    for (const instrument of ["piano", "gayageum-12-sanjo"] as const) {
      const score = gayageumScore();
      const text = xml({ ...score, parts: [{ ...score.parts[0], instrument }] });
      valid(text);
      expect(count(text, "//staves")).toBe(0);
      expect(count(text, "//note/staff")).toBe(0);
      expect(count(text, "//attributes/clef")).toBe(1);
    }
  });
});
