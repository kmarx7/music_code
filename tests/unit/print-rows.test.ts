import { describe, expect, it } from "vitest";
import { printRowViewBox } from "@/adapters/vexflow/printRows";

describe("printRowViewBox", () => {
  const canvas = { x: 0, width: 900 };
  it("keeps every row the full canvas width so all rows print at one scale", () => {
    const box = printRowViewBox({ x: 10, y: 60, width: 400, height: 60 }, 0, 130, canvas);
    expect([box.x, box.width]).toEqual([0, 900]);
  });

  it("covers the row's staff band even when the drawing is small, plus a margin", () => {
    const box = printRowViewBox({ x: 10, y: 80, width: 880, height: 41 }, 0, 130, canvas);
    // Row 0 staff starts at y = 40; the band runs 20 px above to 100 px below that start.
    expect(box.y).toBe(40 + 20 - 8);
    expect(box.y + box.height).toBe(40 + 100 + 8);
  });

  it("grows to include ledger lines, labels or ties that reach outside the band", () => {
    const box = printRowViewBox({ x: 10, y: 130 + 40 - 30, width: 880, height: 200 }, 1, 130, canvas);
    expect(box.y).toBe(130 + 40 - 30 - 8);
    expect(box.y + box.height).toBe(130 + 40 - 30 + 200 + 8);
  });

  it("widens for a drawing past the canvas edge", () => {
    const box = printRowViewBox({ x: -12, y: 60, width: 940, height: 60 }, 0, 130, canvas);
    expect([box.x, box.x + box.width]).toEqual([-20, 936]);
  });
});
