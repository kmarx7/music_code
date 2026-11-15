import { describe, expect, it } from "vitest";
import { findMusicXmlEntry, readZip, ZipReadError } from "@/adapters/file-import";
import { makeZip } from "../fixtures/zip";

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; return "no error"; } catch (error) { return error instanceof ZipReadError ? error.code : String(error); }
}

describe("readZip (.mxl, Phase 8 step 1)", () => {
  it("reads stored and deflated entries", async () => {
    const entries = await readZip(makeZip([{ name: "a.txt", data: "hi", method: 0 }, { name: "b.txt", data: "x".repeat(5000), method: 8 }]));
    expect(text(entries.get("a.txt"))).toBe("hi");
    expect(text(entries.get("b.txt"))).toBe("x".repeat(5000));
  });

  it("rejects non-zip bytes", async () => {
    expect(await errorCode(readZip(new TextEncoder().encode("<score-partwise/>")))).toBe("NOT_ZIP");
  });

  it("rejects too many entries / too large", async () => {
    const two = makeZip([{ name: "a", data: "1" }, { name: "b", data: "2" }]);
    expect(await errorCode(readZip(two, { maxEntries: 1, maxTotalBytes: 1000 }))).toBe("TOO_LARGE");
    const big = makeZip([{ name: "b", data: "x".repeat(5000) }]);
    expect(await errorCode(readZip(big, { maxEntries: 10, maxTotalBytes: 10 }))).toBe("TOO_LARGE");
  });

  it("rejects encrypted and zip64", async () => {
    expect(await errorCode(readZip(makeZip([{ name: "a", data: "1", flags: 1 }])))).toBe("UNSUPPORTED_ZIP");
    expect(await errorCode(readZip(makeZip([{ name: "a", data: "1", method: 0, zip64Size: true }])))).toBe("UNSUPPORTED_ZIP");
  });

  it("finds the rootfile from container.xml", async () => {
    const entries = await readZip(makeZip([
      { name: "META-INF/container.xml", data: '<container><rootfiles><rootfile full-path="music/song.xml"/></rootfiles></container>' },
      { name: "a.musicxml", data: "<a/>" }, { name: "music/song.xml", data: "<b/>" },
    ]));
    expect(findMusicXmlEntry(entries)).toBe("music/song.xml");
  });

  it("falls back to the first score entry without container.xml", async () => {
    const entries = await readZip(makeZip([{ name: "z.xml", data: "<z/>" }, { name: "b.musicxml", data: "<b/>" }, { name: "META-INF/x.xml", data: "<m/>" }]));
    expect(findMusicXmlEntry(entries)).toBe("b.musicxml");
    // A container that points at a missing entry falls back the same way.
    const broken = await readZip(makeZip([{ name: "META-INF/container.xml", data: '<rootfile full-path="gone.xml"/>' }, { name: "s.xml", data: "<s/>" }]));
    expect(findMusicXmlEntry(broken)).toBe("s.xml");
  });

  it("returns null when no score entry", async () => {
    expect(findMusicXmlEntry(await readZip(makeZip([{ name: "readme.txt", data: "hi" }])))).toBeNull();
  });
});
