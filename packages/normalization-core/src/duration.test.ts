import { parseDurationMs } from "@openclaw/normalization-core/duration";
import { describe, expect, it } from "vitest";

describe("normalization-core/duration", () => {
  it.each([
    ["10000", undefined, 10_000],
    ["1.5s", undefined, 1_500],
    ["1h30m", undefined, 5_400_000],
    ["2", { defaultUnit: "m" as const }, 120_000],
  ])("parses %s", (input, options, expected) => {
    expect(parseDurationMs(input, options)).toBe(expected);
  });

  it.each(["", "1h30", "1h-30m", "9007199254740993ms"])('rejects "%s"', (input) => {
    expect(() => parseDurationMs(input)).toThrow(/Invalid duration/u);
  });
});
