// Enforces the TypeScript file-size ceiling while grandfathering the existing backlog.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASELINE_PATH = "scripts/ts-max-loc-baseline.json";

function writeStdoutLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

export type ParsedArgs = {
  baselinePath: string;
  maxLines: number;
  writeBaseline: boolean;
};

export function parseArgs(argv: string[]): ParsedArgs {
  let baselinePath = DEFAULT_BASELINE_PATH;
  let maxLines = 500;
  let writeBaseline = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--max") {
      const next = argv[index + 1];
      if (!next || !/^\d+$/u.test(next)) {
        throw new Error("--max requires a positive integer");
      }
      maxLines = Number(next);
      if (!Number.isSafeInteger(maxLines) || maxLines <= 0) {
        throw new Error("--max requires a positive integer");
      }
      index++;
      continue;
    }
    if (arg === "--baseline") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--baseline requires a path");
      }
      baselinePath = next;
      index++;
      continue;
    }
    if (arg === "--base-ref") {
      // Accepted and ignored: CI still passes the retired comparison ref. The
      // check compares against the checked-in baseline only; raises land as
      // reviewable baseline diffs in the same PR (see the note in main()).
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("--base-ref requires a git ref");
      }
      index++;
      continue;
    }
    if (arg === "--write-baseline") {
      writeBaseline = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { baselinePath, maxLines, writeBaseline };
}

function gitLsFilesAll(): string[] {
  // Include untracked files too so local refactors do not pass by accident.
  const stdout = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isProductionTypeScriptFile(filePath: string): boolean {
  return (
    /\.(?:ts|tsx|mts|cts)$/u.test(filePath) &&
    // The i18n catalog grows with every key: en.ts is a single source-of-truth
    // registry and the other bundles are generated. A never-grow ratchet here
    // would block every string addition, and the bundles cannot be split.
    !filePath.startsWith("ui/src/i18n/locales/") &&
    !/(^|\/)(test|tests|__tests__|test-helpers?|test-support)(\/|$)|\.(test|spec|suite)\.[cm]?tsx?$|(?:^|[/.-])test-(?:helpers?|support|harness)(?:[/.-]|$)/u.test(
      filePath,
    )
  );
}

export function countPhysicalLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  const splitCount = content.split("\n").length;
  return content.endsWith("\n") ? splitCount - 1 : splitCount;
}

async function countLines(filePath: string): Promise<number> {
  const content = await readFile(filePath, "utf8");
  return countPhysicalLines(content);
}

type LocResult = {
  filePath: string;
  lines: number;
};

type LocBaseline = Record<string, number>;

export type LocRatchetViolation = LocResult & {
  baselineLines?: number;
  reason: "baseline-missing" | "baseline-stale" | "grew";
};

export function findLocRatchetViolations(params: {
  baseline: LocBaseline;
  maxLines: number;
  results: LocResult[];
}): LocRatchetViolation[] {
  const currentByPath = new Map(params.results.map((result) => [result.filePath, result.lines]));
  const violations: LocRatchetViolation[] = [];

  for (const result of params.results) {
    const baselineLines = params.baseline[result.filePath];
    if (result.lines <= params.maxLines) {
      if (baselineLines !== undefined) {
        violations.push({ ...result, baselineLines, reason: "baseline-stale" });
      }
      continue;
    }
    if (baselineLines === undefined) {
      violations.push({ ...result, reason: "baseline-missing" });
    } else if (result.lines > baselineLines) {
      violations.push({ ...result, baselineLines, reason: "grew" });
    } else if (result.lines < baselineLines) {
      // Require the baseline to move down with every successful split.
      violations.push({ ...result, baselineLines, reason: "baseline-stale" });
    }
  }

  for (const [filePath, baselineLines] of Object.entries(params.baseline)) {
    if (!currentByPath.has(filePath)) {
      violations.push({ filePath, lines: 0, baselineLines, reason: "baseline-stale" });
    }
  }

  return violations.toSorted(
    (left, right) => right.lines - left.lines || left.filePath.localeCompare(right.filePath),
  );
}

async function readBaseline(filePath: string): Promise<LocBaseline> {
  return parseBaseline(await readFile(filePath, "utf8"), filePath);
}

function parseBaseline(content: string, source: string): LocBaseline {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid TypeScript LOC baseline: ${source}`);
  }
  const baseline: LocBaseline = {};
  for (const [entryPath, value] of Object.entries(parsed)) {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new Error(`Invalid TypeScript LOC baseline entry: ${entryPath}`);
    }
    baseline[entryPath] = value as number;
  }
  return baseline;
}

function buildBaseline(results: LocResult[], maxLines: number): LocBaseline {
  return Object.fromEntries(
    results
      .filter((result) => result.lines > maxLines)
      .toSorted((left, right) => left.filePath.localeCompare(right.filePath))
      .map((result) => [result.filePath, result.lines]),
  );
}

function reportViolations(violations: LocRatchetViolation[]): void {
  for (const violation of violations) {
    writeStdoutLine(
      `${violation.lines}\t${violation.baselineLines ?? "-"}\t${violation.reason}\t${violation.filePath}`,
    );
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });

  const { baselinePath, maxLines, writeBaseline } = parseArgs(argv);
  const files = gitLsFilesAll()
    .filter((filePath) => existsSync(filePath))
    .filter(isProductionTypeScriptFile);
  const results = await Promise.all(
    files.map(async (filePath) => ({ filePath, lines: await countLines(filePath) })),
  );

  if (writeBaseline) {
    // Absorb current reality, growth included: raises land as reviewable
    // baseline diffs in the same PR instead of dead-ending the ratchet. The
    // check mode below still forces baselines to move down with every split.
    const updatedBaseline = buildBaseline(results, maxLines);
    await writeFile(baselinePath, `${JSON.stringify(updatedBaseline, null, 2)}\n`, "utf8");
    writeStdoutLine(`updated ${baselinePath} (${Object.keys(updatedBaseline).length} files)`);
    return 0;
  }

  // Deliberate trade-off: baseline raises are legal but must land as visible
  // baseline diffs reviewed in the same PR (same contract as the deadcode
  // exports ratchet). A base-ref comparison that rejected every raise made all
  // legitimate growth unlandable and deadlocked merges fleet-wide.
  const baseline = await readBaseline(baselinePath);
  const violations = findLocRatchetViolations({ baseline, maxLines, results });
  reportViolations(violations);
  return violations.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    const exitCode = await main();
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
