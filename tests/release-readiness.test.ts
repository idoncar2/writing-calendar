import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("test release readiness", () => {
  it("keeps release versions aligned", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      version: string;
    };
    const packageLock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8")) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const manifest = JSON.parse(readFileSync(resolve("manifest.json"), "utf8")) as {
      version: string;
    };
    const versions = JSON.parse(readFileSync(resolve("versions.json"), "utf8")) as Record<string, string>;
    expect(packageJson.version).toBe("0.3.13");
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages[""]?.version).toBe(packageJson.version);
    expect(manifest.version).toBe(packageJson.version);
    expect(versions[packageJson.version]).toBe("1.7.2");
  });

  it("keeps deployment configuration local and removes private paths", () => {
    const deploySource = readFileSync(resolve("scripts/deploy.mjs"), "utf8");
    expect(deploySource).toContain(".deploy.local.json");
    expect(deploySource).not.toMatch(/[A-Za-z]:[\\/]/u);
  });

  it("ships only user-facing documentation", () => {
    const readme = readFileSync(resolve("README.md"), "utf8");
    expect(existsSync(resolve("DESIGN.md"))).toBe(false);
    expect(readme).not.toContain("开发阶段");
    expect(readme).not.toContain("本地开发");
    expect(readme).not.toContain("测试仓库验证");
    expect(readme).not.toContain("DESIGN.md");
  });
});
