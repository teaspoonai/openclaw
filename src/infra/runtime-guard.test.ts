// Covers runtime detection and version support checks.
import { describe, expect, it } from "vitest";
import { isAtLeast, nodeVersionSatisfiesEngine, parseSemver } from "./runtime-guard.js";

describe("runtime-guard", () => {
  it("parses semver with or without leading v", () => {
    expect(parseSemver("v22.1.3")).toEqual({ major: 22, minor: 1, patch: 3 });
    expect(parseSemver("1.3.0")).toEqual({ major: 1, minor: 3, patch: 0 });
    expect(parseSemver("22.19.0-beta.1")).toEqual({ major: 22, minor: 19, patch: 0 });
    expect(parseSemver("invalid")).toBeNull();
  });

  it("compares versions correctly", () => {
    expect(isAtLeast({ major: 22, minor: 16, patch: 0 }, { major: 22, minor: 16, patch: 0 })).toBe(
      true,
    );
    expect(isAtLeast({ major: 22, minor: 17, patch: 0 }, { major: 22, minor: 16, patch: 0 })).toBe(
      true,
    );
    expect(isAtLeast({ major: 22, minor: 15, patch: 0 }, { major: 22, minor: 16, patch: 0 })).toBe(
      false,
    );
    expect(isAtLeast({ major: 21, minor: 9, patch: 0 }, { major: 22, minor: 16, patch: 0 })).toBe(
      false,
    );
  });

  it("checks node versions against simple engine ranges", () => {
    expect(nodeVersionSatisfiesEngine("22.19.0", ">=22.19.0")).toBe(true);
    expect(nodeVersionSatisfiesEngine("22.18.9", ">=22.19.0")).toBe(false);
    expect(nodeVersionSatisfiesEngine("24.0.0", ">=22.19.0")).toBe(true);
    expect(nodeVersionSatisfiesEngine("22.19.0", "^22.19.0")).toBeNull();
  });

  it("checks node versions against the supported engine range", () => {
    const engine = ">=22.19.0 <23 || >=23.11.0";
    expect(nodeVersionSatisfiesEngine("22.19.0", engine)).toBe(true);
    expect(nodeVersionSatisfiesEngine("22.18.9", engine)).toBe(false);
    expect(nodeVersionSatisfiesEngine("23.7.0", engine)).toBe(false);
    expect(nodeVersionSatisfiesEngine("23.10.9", engine)).toBe(false);
    expect(nodeVersionSatisfiesEngine("23.11.0", engine)).toBe(true);
    expect(nodeVersionSatisfiesEngine("24.0.0", engine)).toBe(true);
    expect(nodeVersionSatisfiesEngine(null, engine)).toBe(false);
    expect(nodeVersionSatisfiesEngine("unknown", engine)).toBe(false);
  });
});
