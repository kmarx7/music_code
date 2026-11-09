import { vi } from "vitest";
import { Font } from "vexflow";

/** Only CSS shorthand parsing needs a browser here; real glyphs, Dot, ticks and layout remain active. */
export function mockVexflowCssFont() {
  vi.spyOn(Font, "fromCSSString").mockImplementation((css) => {
    const match = css.match(/([\d.]+(?:pt|px))\s+(.+)$/);
    if (!match) throw new Error(`Unsupported test font: ${css}`);
    return { size: match[1], family: match[2], weight: "normal", style: "normal" };
  });
}
