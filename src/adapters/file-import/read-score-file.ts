import type { ImportedScore } from "@/domain/score";
import { decodeXmlBytes, readMusicXml, type XmlElementLike } from "@/adapters/musicxml";
import { findMusicXmlEntry, readZip } from "./zip";

/*
 * One uploaded score file → the neutral import model (Phase 8 step 1). .mxl (or any file starting with a zip
 * signature) is unpacked first; the XML parser is injected so the browser uses DOMParser and tests use a
 * small parser. Nothing leaves the device; the bytes are only read.
 */

export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type ScoreFileReadResult =
  | { ok: true; imported: ImportedScore; fileTitle: string }
  | { ok: false; message: string };

const ZIP_MESSAGE = "압축 악보(.mxl)를 열 수 없습니다.";

function isZip(name: string, bytes: Uint8Array): boolean {
  return /\.mxl$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
}

export async function readScoreFile(
  file: { name: string; bytes: Uint8Array },
  parseXml: (text: string) => XmlElementLike | null,
): Promise<ScoreFileReadResult> {
  if (file.bytes.byteLength > IMPORT_MAX_FILE_BYTES) return { ok: false, message: "파일이 너무 큽니다(최대 5MB)." };
  let xmlBytes = file.bytes;
  if (isZip(file.name, file.bytes)) {
    try {
      const entries = await readZip(file.bytes);
      const entry = findMusicXmlEntry(entries);
      if (!entry) return { ok: false, message: ZIP_MESSAGE };
      xmlBytes = entries.get(entry)!;
    } catch {
      return { ok: false, message: ZIP_MESSAGE };
    }
  }
  const text = decodeXmlBytes(xmlBytes);
  if (text === null) return { ok: false, message: "지원하지 않는 글자 인코딩입니다. UTF-8로 저장한 MusicXML을 올려 주세요." };
  const root = parseXml(text);
  if (!root) return { ok: false, message: "MusicXML 파일로 읽을 수 없습니다." };
  const result = readMusicXml(root);
  if (!result.ok) {
    if (result.code === "TIMEWISE") return { ok: false, message: "지원하지 않는 MusicXML 형식(score-timewise)입니다." };
    return { ok: false, message: result.message };
  }
  const fileTitle = file.name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  return { ok: true, imported: result.score, fileTitle };
}
