/**
 * P6-08: offline evaluation of real humming takes against the C-09 target (Phase 6 decision 9).
 * Test-side only. Recordings stay outside the repository and are never committed; this file reads them from a folder
 * the user names and writes nothing except the report the caller asks for.
 *
 * Folder layout: `<take>.wav` + `<take>.json` (ground truth, format in docs/HUMMING_EVAL.md).
 * Each take runs through the same path as the editor: `transcribeRecording` (pitch track → segments → quantize).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { transcribeRecording } from "@/application/transcription";
import { SUPPORTED_DENOMINATORS, TICKS_PER_QUARTER } from "@/domain/score/constants";
import type { KeySignature, TimeSignature } from "@/domain/score/types";
import { estimatePitchTrack, segmentNotes } from "@/domain/transcription";
import {
  aggregateTranscriptionScores, assertMelodyNote, scoreTranscription, type MelodyNote, type TranscriptionScore,
} from "../fixtures/transcription-score";

/** Decision 9: total F1 ≥ 0.90 over at least 20 takes, onset tolerance 0 (C-09 definition). */
export const HUMMING_GATE = { minF1: 0.9, minTakes: 20, onsetToleranceTicks: 0 } as const;

// ---------------------------------------------------------------- WAV

export interface WavAudio { samples: Float32Array; sampleRate: number; channels: number; bitsPerSample: number }

const ascii = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));

/** RIFF/WAVE reader: PCM 16/24/32-bit integer or 32-bit float (incl. WAVE_FORMAT_EXTENSIBLE). Channels are averaged to mono. */
export function readWav(bytes: Uint8Array): WavAudio {
  if (bytes.length < 12 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") throw new Error("Not a RIFF/WAVE file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: { tag: number; channels: number; sampleRate: number; bits: number } | undefined;
  let data: { offset: number; length: number } | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = ascii(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      let tag = view.getUint16(body, true);
      if (tag === 0xfffe && size >= 26) tag = view.getUint16(body + 24, true); // SubFormat GUID starts with the format tag
      format = { tag, channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === "data") {
      data = { offset: body, length: Math.min(size, bytes.length - body) };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  if (!format) throw new Error("WAV has no fmt chunk");
  if (!data) throw new Error("WAV has no data chunk");
  const { tag, channels, sampleRate, bits } = format;
  const float = tag === 3;
  if (!(tag === 1 || float)) throw new Error(`Unsupported WAV format tag ${tag} (PCM or IEEE float only)`);
  if (float ? bits !== 32 : ![16, 24, 32].includes(bits)) throw new Error(`Unsupported ${bits}-bit ${float ? "float" : "PCM"} WAV`);
  if (channels < 1 || sampleRate <= 0) throw new Error("WAV has no channels or sample rate");
  const width = bits / 8;
  const frames = Math.floor(data.length / (width * channels));
  const samples = new Float32Array(frames);
  const read = (at: number): number => {
    if (float) return view.getFloat32(at, true);
    if (bits === 16) return view.getInt16(at, true) / 32768;
    if (bits === 32) return view.getInt32(at, true) / 2147483648;
    const value = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16);
    return value / 8388608;
  };
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) sum += read(data.offset + (frame * channels + channel) * width);
    samples[frame] = sum / channels;
  }
  return { samples, sampleRate, channels, bitsPerSample: bits };
}

/** WAV writer for the self-check (synthetic clips → files the reader must accept). Interleaves `samples` as given. */
export function encodeWav(samples: Float32Array, sampleRate: number,
  options: { bitsPerSample?: 16 | 24 | 32; float?: boolean; channels?: number } = {}): Uint8Array {
  const float = options.float ?? false;
  const bits = float ? 32 : options.bitsPerSample ?? 16;
  const channels = options.channels ?? 1;
  const width = bits / 8;
  const bytes = new Uint8Array(44 + samples.length * width);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < 4; i += 1) bytes[offset + i] = value.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, float ? 3 : 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * width, true);
  view.setUint16(32, channels * width, true); view.setUint16(34, bits, true);
  text(36, "data"); view.setUint32(40, samples.length * width, true);
  samples.forEach((sample, index) => {
    const at = 44 + index * width;
    const clamped = Math.max(-1, Math.min(1, sample));
    if (float) view.setFloat32(at, sample, true);
    else if (bits === 16) view.setInt16(at, Math.round(clamped * 32767), true);
    else if (bits === 32) view.setInt32(at, Math.round(clamped * 2147483647), true);
    else {
      const value = Math.round(clamped * 8388607);
      view.setUint8(at, value & 0xff); view.setUint8(at + 1, (value >> 8) & 0xff); view.setInt8(at + 2, value >> 16);
    }
  });
  return bytes;
}

// ---------------------------------------------------------------- ground truth

export interface HummingGroundTruth {
  tempoBpm: number;
  timeSignature: TimeSignature;
  key: KeySignature;
  /** Seconds into the WAV where tick 0 falls. Absent → first-note alignment (see `evaluateTake`). */
  downbeatSeconds?: number;
  /** Already applied: reference notes are `notes[].midi + 12 × octaveShift`. */
  notes: MelodyNote[];
  note?: string;
}

const C_MAJOR: KeySignature = { tonic: "C", alter: 0, mode: "major", fifths: 0 };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseGroundTruth(input: unknown, source: string): HummingGroundTruth {
  const fail = (message: string): never => { throw new Error(`${source}: ${message}`); };
  if (!isObject(input)) fail("ground truth must be a JSON object");
  const value = input as Record<string, unknown>;
  const tempoBpm = value.tempoBpm;
  if (typeof tempoBpm !== "number" || !Number.isFinite(tempoBpm) || tempoBpm <= 0) fail("tempoBpm must be a positive number");
  const time = value.timeSignature;
  if (!isObject(time) || !Number.isInteger(time.numerator) || (time.numerator as number) < 1
    || !(SUPPORTED_DENOMINATORS as readonly unknown[]).includes(time.denominator)) {
    fail(`timeSignature must be {numerator, denominator} with denominator in ${SUPPORTED_DENOMINATORS.join("/")}`);
  }
  const downbeat = value.downbeatSeconds;
  if (downbeat !== undefined && (typeof downbeat !== "number" || !Number.isFinite(downbeat) || downbeat < 0)) fail("downbeatSeconds must be a non-negative number");
  const key = value.key === undefined ? C_MAJOR : value.key;
  if (!isObject(key) || typeof key.tonic !== "string" || typeof key.fifths !== "number") fail("key must be a KeySignature object");
  const octaveShift = value.octaveShift ?? 0;
  if (!Number.isInteger(octaveShift)) fail("octaveShift must be a whole number of octaves");
  if (!Array.isArray(value.notes) || value.notes.length === 0) fail("notes must be a non-empty array");
  const notes = (value.notes as unknown[]).map((raw, index) => {
    if (!isObject(raw)) return fail(`notes[${index}] must be an object`);
    const note = { midi: typeof raw.midi === "number" ? raw.midi + 12 * (octaveShift as number) : raw.midi, startTick: raw.startTick, durationTicks: raw.durationTicks } as MelodyNote;
    try { assertMelodyNote(note); } catch (error) { fail(`notes[${index}]: ${(error as Error).message}`); }
    return note;
  }).sort((a, b) => a.startTick - b.startTick);
  return {
    tempoBpm: tempoBpm as number, timeSignature: { numerator: (time as Record<string, number>).numerator, denominator: (time as Record<string, number>).denominator },
    key: key as unknown as KeySignature, downbeatSeconds: downbeat as number | undefined, notes,
    note: typeof value.note === "string" ? value.note : undefined,
  };
}

// ---------------------------------------------------------------- recording plan

const Q = TICKS_PER_QUARTER;
const FOUR: TimeSignature = { numerator: 4, denominator: 4 };
function line(items: readonly (readonly [number | null, number])[]): MelodyNote[] {
  const notes: MelodyNote[] = [];
  let tick = 0;
  for (const [midi, beats] of items) {
    if (midi !== null) notes.push({ midi, startTick: tick, durationTicks: beats * Q });
    tick += beats * Q;
  }
  return notes;
}

/** Five short melodies (C4–C5, C major) covering steps, repeats, rests, eighths and 3/4. Recorded 4 times each. */
export const HUMMING_MELODY_PLAN = [
  { id: "scale", title: "도레미파솔라시도 (4분음표, 2마디)", tempoBpm: 90, timeSignature: FOUR,
    notes: line([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [69, 1], [71, 1], [72, 1]]) },
  { id: "repeated", title: "같은 음 반복 후 긴 음 (4마디)", tempoBpm: 90, timeSignature: FOUR,
    notes: line([[67, 1], [67, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2], [60, 2]]) },
  { id: "rests", title: "쉼표가 있는 선율 (4마디)", tempoBpm: 90, timeSignature: FOUR,
    notes: line([[60, 1], [null, 1], [64, 1], [null, 1], [67, 2], [null, 2], [65, 1], [64, 1], [null, 2], [60, 4]]) },
  { id: "eighths", title: "8분음표 진행 (2마디)", tempoBpm: 80, timeSignature: FOUR,
    notes: line([[60, 0.5], [62, 0.5], [64, 0.5], [65, 0.5], [67, 1], [65, 0.5], [64, 0.5], [62, 0.5], [64, 0.5], [65, 0.5], [62, 0.5], [60, 2]]) },
  { id: "waltz", title: "3/4박자 (4마디)", tempoBpm: 110, timeSignature: { numerator: 3, denominator: 4 },
    notes: line([[64, 1], [65, 1], [67, 1], [72, 3], [71, 1], [69, 1], [67, 1], [64, 3]]) },
] as const;

export const HUMMING_TAKE_PLAN = HUMMING_MELODY_PLAN.flatMap((melody) => [1, 2, 3, 4].map((take) => ({ name: `${melody.id}-${take}`, melody })));

/** Writes `<take>.json` for every planned take that has none yet. Returns the file names written. */
export function writeHummingTemplates(folder: string): string[] {
  const written: string[] = [];
  for (const { name, melody } of HUMMING_TAKE_PLAN) {
    const file = `${name}.json`;
    if (existsSync(join(folder, file))) continue;
    writeFileSync(join(folder, file), `${JSON.stringify({
      note: melody.title, tempoBpm: melody.tempoBpm, timeSignature: melody.timeSignature, octaveShift: 0, notes: melody.notes,
    }, null, 2)}\n`);
    written.push(file);
  }
  return written;
}

// ---------------------------------------------------------------- evaluation

export interface TakeResult {
  name: string;
  /** `downbeat`: tick 0 from the ground truth. `first-note`: the first detected onset is placed on the first reference onset. */
  alignment?: "downbeat" | "first-note";
  downbeatSeconds?: number;
  durationSeconds?: number;
  reference?: MelodyNote[];
  predicted?: MelodyNote[];
  /** Present whenever the ground truth was valid, even if transcription found nothing (all reference notes missed). */
  score?: TranscriptionScore;
  error?: string;
}

export type HummingVerdict = "PASS" | "FAIL" | "INSUFFICIENT";

export interface HummingEvalResult {
  folder: string;
  takes: TakeResult[];
  /** Micro-averaged over every take that had valid ground truth. */
  total: TranscriptionScore;
  scoredTakes: number;
  verdict: HummingVerdict;
}

export function evaluateTake(name: string, audio: WavAudio, truth: HummingGroundTruth): TakeResult {
  let downbeatSeconds = truth.downbeatSeconds;
  const alignment = downbeatSeconds === undefined ? "first-note" : "downbeat";
  if (downbeatSeconds === undefined) {
    // No count-in reference in the file: put the first detected onset on the first reference onset. This removes any
    // constant offset (and so slightly flatters onsets) but leaves pitch, segmentation and relative timing fully scored.
    const first = segmentNotes(estimatePitchTrack(audio.samples, audio.sampleRate))[0];
    const refSeconds = (truth.notes[0].startTick / TICKS_PER_QUARTER) * (60 / truth.tempoBpm); // tempo is quarter notes per minute, as in quantize
    downbeatSeconds = first ? first.startSeconds - refSeconds : 0; // may be negative: tick 0 before the file starts
  }
  // Tick 0 before the file starts (singing began on a later beat): pad silence in front, since quantize needs a
  // non-negative downbeat. Silence adds no notes; the reported downbeat stays the unpadded value.
  const pad = downbeatSeconds < 0 ? Math.ceil(-downbeatSeconds * audio.sampleRate) : 0;
  const samples = pad === 0 ? audio.samples : new Float32Array(pad + audio.samples.length);
  if (pad > 0) samples.set(audio.samples, pad);
  let ids = 0;
  const result = transcribeRecording(
    { samples, sampleRate: audio.sampleRate, durationSeconds: samples.length / audio.sampleRate, stoppedBy: "user" },
    { tempoBpm: truth.tempoBpm, timeSignature: truth.timeSignature, key: truth.key, downbeatSeconds: Math.max(0, downbeatSeconds + pad / audio.sampleRate), nextId: () => `eval-${ids++}` },
  );
  const predicted = result.ok ? result.notes.map(({ midi, startTick, durationTicks }) => ({ midi, startTick, durationTicks })) : [];
  return {
    name, alignment, downbeatSeconds, durationSeconds: audio.samples.length / audio.sampleRate,
    reference: truth.notes, predicted,
    score: scoreTranscription(truth.notes, predicted, { onsetToleranceTicks: HUMMING_GATE.onsetToleranceTicks }),
    error: result.ok ? undefined : `${result.issue}: ${result.message}`,
  };
}

export function verdictFor(total: TranscriptionScore, scoredTakes: number): HummingVerdict {
  if (scoredTakes < HUMMING_GATE.minTakes) return "INSUFFICIENT";
  return total.f1 >= HUMMING_GATE.minF1 ? "PASS" : "FAIL";
}

/** Every `.wav`/`.json` pair in `folder` (not recursive), sorted by name. Unpaired or unreadable files become error rows. */
export function evaluateHummingFolder(folder: string): HummingEvalResult {
  const files = readdirSync(folder);
  const names = new Set(files.filter((file) => /\.(wav|json)$/i.test(file)).map((file) => basename(file, extname(file))));
  if (!files.some((file) => /\.wav$/i.test(file))) throw new Error(`No WAV files in ${folder}`);
  const find = (name: string, ext: string) => files.find((file) => file.toLowerCase() === `${name}${ext}`.toLowerCase());
  const takes = [...names].sort().map((name): TakeResult => {
    const wavFile = find(name, ".wav"), jsonFile = find(name, ".json");
    if (!wavFile) return { name, error: "WAV 파일이 없습니다" };
    if (!jsonFile) return { name, error: "정답 JSON 파일이 없습니다" };
    try {
      const truth = parseGroundTruth(JSON.parse(readFileSync(join(folder, jsonFile), "utf8")), jsonFile);
      return evaluateTake(name, readWav(new Uint8Array(readFileSync(join(folder, wavFile)))), truth);
    } catch (error) {
      return { name, error: (error as Error).message };
    }
  });
  const scored = takes.flatMap((take) => (take.score ? [take.score] : []));
  const total = aggregateTranscriptionScores(scored);
  return { folder, takes, total, scoredTakes: scored.length, verdict: verdictFor(total, scored.length) };
}

// ---------------------------------------------------------------- report

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function formatHummingReport(result: HummingEvalResult, meta: { generatedAt: string; commit?: string }): string {
  const { total, verdict } = result;
  const lines = [
    "# 허밍 평가 보고서 (P6-08, C-09)",
    "",
    `- 생성: ${meta.generatedAt}${meta.commit ? ` · 코드 ${meta.commit}` : ""}`,
    `- 폴더: ${result.folder}`,
    `- 기준: 전체 F1 ≥ ${HUMMING_GATE.minF1} · 채점된 테이크 ≥ ${HUMMING_GATE.minTakes} · 시작 허용 오차 ${HUMMING_GATE.onsetToleranceTicks} tick`,
    `- 판정: ${verdict} (채점 ${result.scoredTakes}개 / 전체 ${result.takes.length}개)`,
    "",
    "| 합계 | 정답 | 예측 | TP | FP | FN | 정밀도 | 재현율 | F1 | 옥타브 오류 | 음높이 오류 | 길이 일치 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    `| 전체 | ${total.referenceCount} | ${total.predictedCount} | ${total.truePositives} | ${total.falsePositives} | ${total.falseNegatives} | ${pct(total.precision)} | ${pct(total.recall)} | ${total.f1.toFixed(3)} | ${total.octaveErrors} | ${total.pitchErrors} | ${total.durationMatches} |`,
    "",
    "## 테이크별",
    "",
    "| 테이크 | 정렬 | 길이(s) | 정답 | 예측 | TP | F1 | 옥타브 | 음높이 | 비고 |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...result.takes.map((take) => {
      const s = take.score;
      const cells = s
        ? [take.alignment ?? "", take.durationSeconds?.toFixed(1) ?? "", s.referenceCount, s.predictedCount, s.truePositives, s.f1.toFixed(3), s.octaveErrors, s.pitchErrors]
        : ["", "", "", "", "", "", "", ""];
      return `| ${take.name} | ${cells.join(" | ")} | ${(take.error ?? "").replace(/\|/g, "\\|")} |`;
    }),
    "",
    "정렬 `first-note`: 정답에 `downbeatSeconds`가 없어 첫 검출 음을 첫 정답 음에 맞췄다. 일정한 시작 지연은 점수에 반영되지 않는다.",
    "이 보고서는 녹음한 사람·기기·환경에 대한 결과이며 다른 목소리나 기기에서의 품질을 보장하지 않는다.",
    "",
  ];
  return lines.join("\n");
}
