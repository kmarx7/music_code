import type { XmlElementLike } from "@/adapters/musicxml";

/*
 * Test-only XML parser: elements, attributes and text. Comments, <?...?> and <!DOCTYPE> are skipped;
 * the five predefined entities are decoded. Enough for hand-written MusicXML fixtures, not a general parser.
 */

class LiteElement implements XmlElementLike {
  readonly children: LiteElement[] = [];
  private readonly parts: (string | LiteElement)[] = [];
  constructor(readonly tagName: string, private readonly attributes: Map<string, string>) {}
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  append(node: string | LiteElement): void {
    this.parts.push(node);
    if (typeof node !== "string") this.children.push(node);
  }
  get textContent(): string {
    return this.parts.map((part) => (typeof part === "string" ? part : part.textContent)).join("");
  }
}

const decode = (value: string) => value.replace(/&(lt|gt|amp|quot|apos);/g, (_, name: string) =>
  ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[name]!);

export function parseXmlLite(text: string): XmlElementLike {
  const stack: LiteElement[] = [];
  let root: LiteElement | null = null;
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("<", index);
    if (open < 0) break;
    if (open > index && stack.length) stack[stack.length - 1]!.append(decode(text.slice(index, open)));
    if (text.startsWith("<!--", open)) { index = text.indexOf("-->", open) + 3; continue; }
    if (text.startsWith("<?", open)) { index = text.indexOf("?>", open) + 2; continue; }
    if (text.startsWith("<!", open)) { index = text.indexOf(">", open) + 1; continue; }
    const close = text.indexOf(">", open);
    const body = text.slice(open + 1, close);
    index = close + 1;
    if (body.startsWith("/")) { stack.pop(); continue; }
    const selfClosing = body.endsWith("/");
    const inner = selfClosing ? body.slice(0, -1) : body;
    const name = inner.match(/^[^\s/]+/)![0];
    const attributes = new Map<string, string>();
    for (const match of inner.slice(name.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      attributes.set(match[1]!, decode(match[3] ?? match[4] ?? ""));
    }
    const element = new LiteElement(name, attributes);
    if (stack.length) stack[stack.length - 1]!.append(element);
    else root ??= element;
    if (!selfClosing) stack.push(element);
  }
  if (!root) throw new Error("no root element");
  return root;
}
