import type { XmlElementLike } from "./reader";

/*
 * Browser-side helpers for reading MusicXML (Phase 8 step 1). The XML parser is the browser's DOMParser,
 * so no parser library ships. Bytes are decoded as UTF-8 or as UTF-16 with a byte-order mark; any other
 * declared encoding is refused rather than guessed.
 */

export function parseXmlText(text: string): XmlElementLike | null {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) return null;
  return document.documentElement;
}

export function decodeXmlBytes(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder("utf-8").decode(hasBom ? bytes.subarray(3) : bytes);
  const declared = text.slice(0, 200).match(/^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1];
  if (declared && !/^utf-?8$/i.test(declared)) return null;
  return text;
}
