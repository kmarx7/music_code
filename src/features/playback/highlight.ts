/** DOM-only projection; selection and canonical score are left untouched. */
export function highlightPlayback(root: HTMLElement, activeIds: readonly string[]): void {
  const active = new Set(activeIds);
  root.querySelectorAll<HTMLElement | SVGElement>("[data-event-id]").forEach((element) => {
    if (active.has(element.getAttribute("data-event-id") ?? "")) element.setAttribute("data-playing", "true");
    else element.removeAttribute("data-playing");
  });
}
