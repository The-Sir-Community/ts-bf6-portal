#!/usr/bin/env node
import type { Dirent } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type StringsTable = Record<string, string>;

const DEFAULT_SOURCE = "src";
const DEFAULT_OUTPUT = "dist/strings.json";

interface StringEntry {
  value: string;
  source: string;
}

export interface BundleOptions {
  sourceDir: string;
  outputFile: string;
}

export interface BundleResult {
  count: number;
  outputFile: string;
  sourceDir: string;
  missingSource: boolean;
  duplicates: DuplicateEntry[];
}

interface DuplicateEntry {
  key: string;
  duplicateSource: string;
  originalSource: string;
}

function shouldProcessFile(entry: Dirent) {
  if (!entry.isFile()) {
    return false;
  }

  return entry.name === "strings.json" || entry.name.endsWith(".strings.json");
}

function ensureOutputDirectoryExists(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function parseStringsFile(filePath: string) {
  const rawContent = readFileSync(filePath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`[strings-bundler] Failed to parse ${filePath}: ${(error as Error).message}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `[strings-bundler] Expected ${filePath} to contain a flat object of string values.`
    );
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const table: StringsTable = {};

  for (const [key, value] of entries) {
    if (typeof value !== "string") {
      throw new Error(
        `[strings-bundler] Value for key "${key}" in ${filePath} must be a string.`
      );
    }

    table[key] = value;
  }

  return table;
}

function collectStrings(
  dir: string,
  accumulator: Map<string, StringEntry>,
  duplicates: DuplicateEntry[]
) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      collectStrings(entryPath, accumulator, duplicates);
      continue;
    }

    if (!shouldProcessFile(entry)) {
      continue;
    }

    const table = parseStringsFile(entryPath);

    for (const [key, value] of Object.entries(table)) {
      if (accumulator.has(key)) {
        const existing = accumulator.get(key);
        duplicates.push({
          key,
          duplicateSource: entryPath,
          originalSource: existing?.source ?? "<unknown>",
        });
        continue;
      }

      accumulator.set(key, { value, source: entryPath });
    }
  }
}

export function bundleStrings({ sourceDir, outputFile }: BundleOptions): BundleResult {
  const strings = new Map<string, StringEntry>();
  const duplicates: DuplicateEntry[] = [];
  let missingSource = false;

  if (!existsSync(sourceDir)) {
    missingSource = true;
  } else {
    collectStrings(sourceDir, strings, duplicates);
  }

  const sorted = Array.from(strings.entries()).sort(([keyA], [keyB]) =>
    keyA.localeCompare(keyB)
  );

  const output: StringsTable = {};
  for (const [key, { value }] of sorted) {
    output[key] = value;
  }

  ensureOutputDirectoryExists(outputFile);
  writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);

  return {
    count: sorted.length,
    outputFile,
    sourceDir,
    missingSource,
    duplicates,
  };
}

function parseCliArgs(argv: string[]) {
  const positionals: string[] = [];
  let source: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "-s":
      case "--source":
      case "--src":
        if (i + 1 >= argv.length) {
          throw new Error(`[strings-bundler] Missing value for ${arg}.`);
        }

        source = argv[i + 1];
        i += 1;
        break;
      case "-o":
      case "--output":
      case "--out":
        if (i + 1 >= argv.length) {
          throw new Error(`[strings-bundler] Missing value for ${arg}.`);
        }

        output = argv[i + 1];
        i += 1;
        break;
      default:
        positionals.push(arg);
    }
  }

  if (positionals.length > 2) {
    const extras = positionals.slice(2).join(", ");
    throw new Error(`[strings-bundler] Unexpected extra argument(s): ${extras}`);
  }

  if (positionals.length >= 1 && source === undefined) {
    [source] = positionals;
  }

  if (positionals.length >= 2 && output === undefined) {
    [, output] = positionals;
  }

  return {
    source: source ?? DEFAULT_SOURCE,
    output: output ?? DEFAULT_OUTPUT,
  };
}

function printHelp() {
  const scriptName = basename(process.argv[1] ?? "strings-bundler");
  const indent = " ".repeat(scriptName.length + 7);

  console.log(`Usage: ${scriptName} [options] [sourceDir] [outputFile]

Options:
  -s, --source <dir>   Source directory to scan (${DEFAULT_SOURCE})
  -o, --output <file>  Destination path (${DEFAULT_OUTPUT})
  -h, --help           Show this help message

Examples:
  ${scriptName}                              ${indent}# bundle from ./src to ./dist/strings.json
  ${scriptName} ./content ./public/strings.json  ${indent}# positional overrides
  ${scriptName} --source assets --output build/strings.json
`);
}

function runCli(argv = process.argv.slice(2)) {
  if (argv.some((arg) => arg === "-h" || arg === "--help")) {
    printHelp();
    return;
  }

  try {
    const { source, output } = parseCliArgs(argv);
    const sourceDir = resolve(process.cwd(), source);
    const outputFile = resolve(process.cwd(), output);

    const result = bundleStrings({ sourceDir, outputFile });

    if (result.missingSource) {
      console.warn(
        `[strings-bundler] Source directory "${result.sourceDir}" not found. Wrote empty bundle to ${result.outputFile}.`
      );
    } else {
      console.log(
        `[strings-bundler] Bundled ${result.count} ${
          result.count === 1 ? "entry" : "entries"
        } to ${result.outputFile}`
      );
      for (const duplicate of result.duplicates) {
        console.warn(
          `[strings-bundler] Duplicate key "${duplicate.key}" in ${duplicate.duplicateSource}; keeping value from ${duplicate.originalSource}.`
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

runCli();
