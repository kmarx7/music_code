/*
 * Minimal zip reader for compressed MusicXML (.mxl), Phase 8 step 1. Stored (0) and deflated (8) entries only,
 * through the platform's DecompressionStream: no dependency. Encrypted and zip64 archives are refused, and the
 * entry count and the inflated total are capped so a small archive cannot expand without bound.
 */

export type ZipErrorCode = "NOT_ZIP" | "UNSUPPORTED_ZIP" | "TOO_LARGE" | "CORRUPT";

export class ZipReadError extends Error {
  constructor(public readonly code: ZipErrorCode, message: string) { super(message); this.name = "ZipReadError"; }
}

export interface ZipLimits { maxEntries: number; maxTotalBytes: number }
export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 200, maxTotalBytes: 20 * 1024 * 1024 };

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEnd(view: DataView): number {
  // The end record is 22 bytes plus an optional comment of up to 65535 bytes.
  for (let at = view.byteLength - 22; at >= Math.max(0, view.byteLength - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === END_SIGNATURE) return at;
  }
  return -1;
}

async function inflate(data: Uint8Array, budget: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > budget) { await reader.cancel(); throw new ZipReadError("TOO_LARGE", "압축을 푼 크기가 상한을 넘습니다."); }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

/** Reads every file entry of a zip archive into memory. Directory entries are skipped. */
export async function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 22 || view.getUint32(0, true) !== LOCAL_SIGNATURE) throw new ZipReadError("NOT_ZIP", "zip 파일이 아닙니다.");
  const end = findEnd(view);
  if (end < 0) throw new ZipReadError("CORRUPT", "zip 끝 정보를 찾을 수 없습니다.");
  const count = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new ZipReadError("UNSUPPORTED_ZIP", "zip64 형식은 지원하지 않습니다.");
  if (count > limits.maxEntries) throw new ZipReadError("TOO_LARGE", "zip 항목이 너무 많습니다.");
  const entries = new Map<string, Uint8Array>();
  const names = new TextDecoder();
  let total = 0; let at = directoryOffset;
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.byteLength || view.getUint32(at, true) !== CENTRAL_SIGNATURE) throw new ZipReadError("CORRUPT", "zip 목록이 손상되었습니다.");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) throw new ZipReadError("UNSUPPORTED_ZIP", "암호화된 zip은 지원하지 않습니다.");
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipReadError("UNSUPPORTED_ZIP", "zip64 형식은 지원하지 않습니다.");
    }
    if (method !== 0 && method !== 8) throw new ZipReadError("UNSUPPORTED_ZIP", "지원하지 않는 zip 압축 방식입니다.");
    if (name.endsWith("/")) continue;
    if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new ZipReadError("CORRUPT", "zip 항목이 손상되었습니다.");
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.byteLength) throw new ZipReadError("CORRUPT", "zip 항목이 손상되었습니다.");
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    const budget = limits.maxTotalBytes - total;
    let content: Uint8Array;
    if (method === 0) {
      if (data.byteLength > budget) throw new ZipReadError("TOO_LARGE", "압축을 푼 크기가 상한을 넘습니다.");
      content = data.slice();
    } else {
      try { content = await inflate(data, budget); } catch (error) {
        if (error instanceof ZipReadError) throw error;
        throw new ZipReadError("CORRUPT", "zip 항목을 풀 수 없습니다.");
      }
    }
    total += content.byteLength;
    entries.set(name, content);
  }
  return entries;
}

const SCORE_ENTRY = /\.(musicxml|xml)$/i;

/** The score inside an .mxl: container.xml's first rootfile when present, else the first score file outside META-INF. */
export function findMusicXmlEntry(entries: Map<string, Uint8Array>): string | null {
  const container = entries.get("META-INF/container.xml");
  if (container) {
    const path = /full-path\s*=\s*"([^"]+)"/.exec(new TextDecoder().decode(container))?.[1];
    if (path && entries.has(path)) return path;
  }
  return [...entries.keys()].filter((name) => !name.startsWith("META-INF/") && SCORE_ENTRY.test(name)).sort()[0] ?? null;
}
