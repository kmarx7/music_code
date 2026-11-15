import type { ExportPort, ExportWriteResult } from "@/application/ports";
import {
  assignGrandStaves, exportPartName, getInstrumentProfile, instrumentOf, measureStartTick, measureTicks, planPartNotation, usesGrandStaff,
} from "@/domain/score";
import type { GrandStaffNumber, NotatableDuration, NotationFragment, Part, Score } from "@/domain/score";

/*
 * MusicXML 4.0 partwise writer (D-03 #5, #6): uncompressed, divisions 960 (= Score PPQ), key/time/clef in each
 * part's first measure, score tempo as <sound tempo> on the first part. Glyphs come from the same exact
 * decomposition as the editor (H-02); an event split into several glyphs and Part.ties both become <tie>/<tied>.
 * Gaps between events advance with <forward> (no invented rests). Labels and velocity are not written.
 * Implementation defaults: one voice, no <accidental> (readers derive it from <alter>), part ids P1..Pn,
 * empty measures stay empty, a measure with events is filled to its end with <forward>.
 * A 25현 가야금 part is one voice on a grand staff: <staves>2</staves>, G and F clefs, and <staff> on every note.
 */

const TYPE_NAMES: Readonly<Record<NotatableDuration["base"], string>> = {
  1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "16th", 32: "32nd",
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!)
    // Control characters other than tab/newline/carriage return are not allowed in XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "");
}

function fragmentXml(fragment: NotationFragment, tiedFrom: ReadonlySet<string>, tiedTo: ReadonlySet<string>, staff?: GrandStaffNumber): string[] {
  const { event, duration, index, count } = fragment;
  const lines = ["<note>"];
  if (event.kind === "rest") {
    lines.push("  <rest/>");
  } else {
    const { step, alter, octave } = event.pitch;
    lines.push(`  <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`);
  }
  lines.push(`  <duration>${duration.ticks}</duration>`);
  const ties: ("stop" | "start")[] = [];
  if (event.kind === "note") {
    if (index > 0 || (index === 0 && tiedTo.has(event.id))) ties.push("stop");
    if (index < count - 1 || (index === count - 1 && tiedFrom.has(event.id))) ties.push("start");
  }
  for (const type of ties) lines.push(`  <tie type="${type}"/>`);
  lines.push("  <voice>1</voice>", `  <type>${TYPE_NAMES[duration.base]}</type>`);
  for (let dot = 0; dot < duration.dots; dot++) lines.push("  <dot/>");
  if (staff !== undefined) lines.push(`  <staff>${staff}</staff>`);
  if (ties.length) lines.push(`  <notations>${ties.map((type) => `<tied type="${type}"/>`).join("")}</notations>`);
  lines.push("</note>");
  return lines;
}

const forward = (ticks: number) => [`<forward><duration>${ticks}</duration></forward>`];

function partXml(part: Part, measures: readonly (readonly NotationFragment[])[], tempoBpm: number | undefined): string[] {
  const tiedFrom = new Set(part.ties.map((tie) => tie.from));
  const tiedTo = new Set(part.ties.map((tie) => tie.to));
  const length = measureTicks(part.timeSignature);
  const staves = usesGrandStaff(part) ? assignGrandStaves(measures) : null;
  const lines: string[] = [];
  part.measures.forEach((measure, m) => {
    lines.push(`<measure number="${m + 1}">`);
    const body: string[] = [];
    if (m === 0) {
      const { fifths, mode } = part.keySignature;
      const { numerator, denominator } = part.timeSignature;
      const clef = part.clef === "bass" ? "<sign>F</sign><line>4</line>" : "<sign>G</sign><line>2</line>";
      const clefs = staves
        ? ["  <staves>2</staves>", '  <clef number="1"><sign>G</sign><line>2</line></clef>', '  <clef number="2"><sign>F</sign><line>4</line></clef>']
        : [`  <clef>${clef}</clef>`];
      body.push("<attributes>", "  <divisions>960</divisions>", `  <key><fifths>${fifths}</fifths><mode>${mode}</mode></key>`,
        `  <time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time>`, ...clefs, "</attributes>");
      if (tempoBpm !== undefined) {
        body.push('<direction placement="above">',
          `  <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempoBpm}</per-minute></metronome></direction-type>`,
          `  <sound tempo="${tempoBpm}"/>`, "</direction>");
      }
    }
    const start = measureStartTick(measure.index, part.timeSignature);
    let cursor = start;
    (measures[m] ?? []).forEach((fragment, position) => {
      if (fragment.startTick > cursor) body.push(...forward(fragment.startTick - cursor));
      body.push(...fragmentXml(fragment, tiedFrom, tiedTo, staves?.[m][position]));
      cursor = fragment.startTick + fragment.duration.ticks;
    });
    if ((measures[m]?.length ?? 0) > 0 && cursor < start + length) body.push(...forward(start + length - cursor));
    lines.push(...body.map((line) => `  ${line}`), "</measure>");
  });
  return lines;
}

export function writeMusicXml(score: Readonly<Score>): ExportWriteResult {
  const plans: (readonly (readonly NotationFragment[])[])[] = [];
  for (const part of score.parts) {
    const plan = planPartNotation(part);
    if (!plan.ok) {
      const { code, message, measureNumber, eventId } = plan.issue;
      return { ok: false, issue: { code, message: `MusicXML로 내보낼 수 없습니다. ${message}`, measureNumber, eventId } };
    }
    plans.push(plan.measures);
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `  <work><work-title>${escapeXml(score.title)}</work-title></work>`,
    "  <identification><encoding><software>허밍버드</software></encoding></identification>",
    "  <part-list>",
    // Decision 9: the instrument's name in <part-name> and <score-instrument> (one instrument per part).
    ...score.parts.map((part, p) => `    <score-part id="P${p + 1}"><part-name>${escapeXml(exportPartName(part))}</part-name>`
      + `<score-instrument id="P${p + 1}-I1"><instrument-name>${escapeXml(getInstrumentProfile(instrumentOf(part)).name)}</instrument-name></score-instrument></score-part>`),
    "  </part-list>",
  ];
  score.parts.forEach((part, p) => {
    lines.push(`  <part id="P${p + 1}">`, ...partXml(part, plans[p], p === 0 ? score.tempoBpm : undefined).map((line) => `    ${line}`), "  </part>");
  });
  lines.push("</score-partwise>", "");
  return { ok: true, data: lines.join("\n") };
}

export const musicXmlExport: ExportPort = {
  format: "musicxml",
  mimeType: "application/vnd.recordare.musicxml+xml",
  write: writeMusicXml,
};
