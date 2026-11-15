import type { NoteLabelMode } from "@/domain/music-theory";
import type { Score } from "@/domain/score/types";
import { renderScoreInto, STAFF_ROW_LAYOUT, staffRowGeometry } from "./renderScore";

interface Box { x: number; y: number; width: number; height: number }

const MARGIN = 8;
/** Part of a row that always belongs to it: from 20 px above the stave origin to 100 px below (staff lines and stems). */
const BAND_TOP = 20;
const BAND_BOTTOM = 100;

/**
 * The viewBox of one printed row: the full canvas width (so every row prints at the same scale) and the row's
 * staff band, grown to whatever the row actually drew (ledger lines, labels, ties).
 */
export function printRowViewBox(drawn: Box, row: number, rowHeight: number, canvas: { x: number; width: number }, bassOffset = 0): Box {
  const origin = row * rowHeight + STAFF_ROW_LAYOUT.staveTop;
  const top = Math.min(drawn.y, origin + BAND_TOP) - MARGIN;
  // A grand staff (25현 가야금) keeps its bass stave in the same printed row.
  const bottom = Math.max(drawn.y + drawn.height, origin + BAND_BOTTOM + bassOffset) + MARGIN;
  const left = Math.min(canvas.x, drawn.x - MARGIN);
  const right = Math.max(canvas.x + canvas.width, drawn.x + drawn.width + MARGIN);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Print projection (P5-06): draws the first part with the editor renderer into `host` (which must be laid out,
 * e.g. off-screen, so SVG boxes can be measured), then returns one standalone SVG per staff row so the browser
 * can break pages between rows and never through one. No cursor, selection or playback state is drawn.
 * Throws the renderer's NotationRenderError for a score that cannot be notated exactly.
 */
export async function renderPrintRows(host: HTMLDivElement, score: Score, labelMode: NoteLabelMode,
  pressedEventIds?: ReadonlySet<string>): Promise<SVGSVGElement[]> {
  await renderScoreInto(host, score, { labelMode, pressedEventIds });
  await host.ownerDocument.fonts?.ready;
  const svg = host.querySelector("svg");
  if (!svg) return [];
  const part = score.parts[0];
  const { rowHeight, bassOffset } = part ? staffRowGeometry(part, labelMode)
    : { rowHeight: labelMode === "none" ? STAFF_ROW_LAYOUT.rowHeight : STAFF_ROW_LAYOUT.labelledRowHeight, bassOffset: 0 };
  const view = svg.viewBox?.baseVal;
  const canvas = view && view.width > 0 ? { x: view.x, width: view.width } : { x: 0, width: Number(svg.getAttribute("width")) || svg.getBBox().width };
  const groups = Array.from(svg.children).filter((child): child is SVGGElement => child.matches("g[data-staff-row]"));
  const boxes = groups.map((group) => printRowViewBox(group.getBBox(), Number(group.getAttribute("data-staff-row")), rowHeight, canvas, bassOffset));
  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  return groups.map((group, index) => {
    const row = svg.cloneNode(false) as SVGSVGElement;
    const box = { ...boxes[index], x: left, width: right - left };
    row.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    row.removeAttribute("height");
    row.setAttribute("width", "100%");
    row.setAttribute("data-print-row", String(index));
    row.style.display = "block";
    row.style.height = "auto";
    row.style.width = "100%";
    row.appendChild(group);
    return row;
  });
}
