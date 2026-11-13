import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Test-only bridge to the system libxml2 `xmllint` (independent of the writer, D-03 #7). Offline via the local catalog. */
const XMLLINT = "/usr/bin/xmllint";
// Resolved from the repository root (vitest and Playwright both run there; Playwright compiles to CommonJS).
const dir = join(process.cwd(), "tests/fixtures/musicxml-4.0/");
const env = { ...process.env, XML_CATALOG_FILES: `${dir}catalog.xml` };

function run(args: string[], xml: string): { ok: boolean; output: string } {
  try {
    return { ok: true, output: execFileSync(XMLLINT, [...args, "-"], { input: xml, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

export function validateMusicXml(xml: string): { ok: boolean; output: string } {
  return run(["--noout", "--nonet", "--schema", `${dir}musicxml.xsd`], xml);
}

/** Evaluates an XPath expression and returns xmllint's text result (string/number functions return plain text). */
export function xpath(xml: string, expression: string): string {
  const result = run(["--nonet", "--xpath", expression], xml);
  if (!result.ok) throw new Error(`xpath failed: ${expression}\n${result.output}`);
  return result.output.trim();
}
