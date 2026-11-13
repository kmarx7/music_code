import { deserializeScore, serializeScore } from "@/domain/score";
import type { Score } from "@/domain/score";
import type { ExportData, ExportFormat, ExportIssue, ExportPort } from "@/application/ports";

const EXTENSIONS: Readonly<Record<ExportFormat, string>> = { json: "json", midi: "mid", musicxml: "musicxml", pdf: "pdf" };

/** One rule for every format: NFC, forbidden characters → `_`, trimmed, 80 characters, empty → `score` (D-03 #8). */
export function exportFileName(title: string, format: ExportFormat): string {
  // NFC first: a decomposed (NFD) Hangul title would otherwise be cut mid-syllable by the 80-unit limit.
  const name = title.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80) || "score";
  return `${name}.${EXTENSIONS[format]}`;
}

export interface ExportedFile {
  readonly data: ExportData;
  readonly filename: string;
  readonly mimeType: string;
}

export type ExportResult =
  | { readonly ok: true; readonly file: ExportedFile }
  | { readonly ok: false; readonly issue: ExportIssue };

/**
 * Validates the score, gives the writer an independent copy (so the canonical score, its storage and history
 * cannot change), and names the file. Practice rate, loop and UI state are not part of Score and never reach a writer.
 */
export function exportScore(score: Readonly<Score>, port: ExportPort): ExportResult {
  const parsed = deserializeScore(serializeScore(score as Score));
  if (!parsed.ok) return { ok: false, issue: { code: "INVALID_SCORE", message: `악보를 내보낼 수 없습니다: ${parsed.message}` } };
  const written = port.write(parsed.score);
  if (!written.ok) return written;
  return { ok: true, file: { data: written.data, filename: exportFileName(score.title, port.format), mimeType: port.mimeType } };
}
