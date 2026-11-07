#!/usr/bin/env node
/**
 * check-boundaries.mjs
 *
 * dependency-cruiser가 잡지 못하는 규칙을 정적으로 검사한다.
 *  1) canonical 음악 타입(Score/NoteEvent/...)은 src/domain 밖에서 선언할 수 없다.
 *  2) src/domain은 브라우저/런타임 전역과 렌더러/오디오 전역을 참조할 수 없다.
 *  3) 다른 feature의 private 파일( index 가 아닌 파일 )을 import 할 수 없다.
 *
 * 예외가 꼭 필요한 줄에는 `arch-allow-canonical` 또는 `arch-allow-global`
 * 주석을 같은 줄에 남긴다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const DOMAIN = join(SRC, "domain");

const CANONICAL_TYPES = ["Score", "NoteEvent", "RestEvent", "Measure", "Part", "Pitch"];

const FORBIDDEN_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "AudioContext",
  "OfflineAudioContext",
  "requestAnimationFrame",
  "fetch",
  "WebSocket",
  "MediaStream",
  "MediaRecorder",
  "Worker",
  "Vex",
  "Tone",
];

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".json"];

const violations = [];

function addViolation(rule, file, line, message) {
  violations.push({ rule, file: relative(ROOT, file), line, message });
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function collectImportSpecifiers(source) {
  const clean = stripComments(source);
  const specs = [];
  const patterns = [
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(clean)) !== null) {
      specs.push({ spec: match[1], index: match.index });
    }
  }
  return specs;
}

function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;

  const candidates = [
    base,
    ...RESOLVE_EXTENSIONS.map((ext) => base + ext),
    ...RESOLVE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function featureOf(absolutePath) {
  const rel = relative(SRC, absolutePath).split("\\").join("/");
  const match = rel.match(/^features\/([^/]+)\//);
  return match ? match[1] : null;
}

function checkCanonicalTypes(files) {
  const declaration = new RegExp(
    `\\b(?:interface|type)\\s+(${CANONICAL_TYPES.join("|")})\\b`,
  );
  for (const file of files) {
    if (file.startsWith(DOMAIN)) continue;
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      if (!declaration.test(line)) return;
      if (line.includes("arch-allow-canonical")) return;
      addViolation(
        "canonical-type-outside-domain",
        file,
        index + 1,
        "canonical 음악 타입은 src/domain 에서만 선언할 수 있습니다.",
      );
    });
  }
}

function checkDomainGlobals() {
  for (const file of walk(DOMAIN)) {
    const source = readFileSync(file, "utf8");
    const clean = stripComments(source);
    for (const name of FORBIDDEN_GLOBALS) {
      const pattern = new RegExp(`(?<![.\\w$])${name}\\b`, "g");
      let match;
      while ((match = pattern.exec(clean)) !== null) {
        const line = lineOf(clean, match.index);
        const rawLine = source.split("\n")[line - 1] ?? "";
        if (rawLine.includes("arch-allow-global")) continue;
        addViolation(
          "domain-runtime-global",
          file,
          line,
          `src/domain 은 런타임 전역 \`${name}\` 을 참조할 수 없습니다.`,
        );
      }
    }
  }
}

function checkFeaturePrivacy(files) {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const owner = featureOf(file);
    for (const { spec, index } of collectImportSpecifiers(source)) {
      const target = resolveSpecifier(file, spec);
      if (!target) continue;
      const targetFeature = featureOf(target);
      if (!targetFeature) continue;

      const isPublicEntry = /^index\.(ts|tsx|js|mjs)$/.test(basename(target));
      if (owner === targetFeature || isPublicEntry) continue;

      addViolation(
        "feature-private-import",
        file,
        lineOf(source, index),
        `feature \`${targetFeature}\` 의 private 파일(${basename(target)})을 직접 import 했습니다. index.ts 진입점을 사용하세요.`,
      );
    }
  }
}

function main() {
  const files = walk(SRC);
  checkCanonicalTypes(files);
  checkDomainGlobals();
  checkFeaturePrivacy(files);

  if (violations.length === 0) {
    console.log(`✔ check-boundaries: 위반 없음 (검사 파일 ${files.length}개)`);
    return;
  }

  console.error(`✖ check-boundaries: 위반 ${violations.length}건`);
  for (const violation of violations) {
    console.error(
      `  [${violation.rule}] ${violation.file}:${violation.line} — ${violation.message}`,
    );
  }
  process.exitCode = 1;
}

main();
