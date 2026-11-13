import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPONENTS } from "@/app/licenses/components";

const installed = (name: string): string => JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;
const runtimeDependencies = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies as Record<string, string>);

describe("오픈소스 라이선스 목록(P6-06)", () => {
  it("lists every runtime dependency in package.json", () => {
    const listed = new Set(COMPONENTS.flatMap((component) => component.packages ?? []));
    expect(runtimeDependencies.filter((name) => !listed.has(name))).toEqual([]);
  });

  it("shows the installed version of each listed package", () => {
    for (const component of COMPONENTS) {
      for (const name of component.packages ?? []) expect(component.version, `${component.name} / ${name}`).toContain(installed(name));
    }
  });
});
