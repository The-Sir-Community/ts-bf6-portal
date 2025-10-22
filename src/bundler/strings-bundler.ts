#!/usr/bin/env node
import type { Dirent } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";

type StringsTable = Record<string, string>;

const DEFAULT_SOURCE = "src";
const DEFAULT_OUTPUT = "dist/strings.json";
const DEFAULT_EXCLUDE = "exclude.json";
const require = createRequire(import.meta.url);

interface StringEntry {
  value: string;
  source: string;
}

export interface BundleOptions {
  sourceDir: string;
  outputFile: string;
  excludeFile?: string | null;
}

export interface BundleResult {
  count: number;
  outputFile: string;
  sourceDir: string;
  missingSource: boolean;
  duplicates: DuplicateEntry[];
  candidates: CandidateSuggestion[];
  excluded: ExcludedEntry[];
  excludeFile: string | null;
  excludeFileMissing: boolean;
}

interface DuplicateEntry {
  key: string;
  duplicateSource: string;
  originalSource: string;
}

interface CandidateAccumulator {
  value: string;
  sources: Set<string>;
}

export interface CandidateSuggestion {
  key: string;
  value: string;
  sources: string[];
}

interface ExcludedEntry {
  key: string;
  value: string;
  source: string;
}

interface ExcludeData {
  values: Set<string>;
  filePath: string | null;
  missing: boolean;
}

type TypeScriptModule = typeof import("typescript");

let cachedTypescript: TypeScriptModule | null | undefined;
let warnedMissingTypescript = false;

type TsNode = import("typescript").Node;
type TsStringLiteralLike = import("typescript").StringLiteralLike;

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

export function bundleStrings({ sourceDir, outputFile, excludeFile }: BundleOptions): BundleResult {
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

  const excludeData = loadExcludeValues(excludeFile);
  const filteredEntries: Array<[string, StringEntry]> = [];
  const excluded: ExcludedEntry[] = [];

  for (const [key, entry] of sorted) {
    if (excludeData.values.has(entry.value)) {
      excluded.push({ key, value: entry.value, source: entry.source });
      continue;
    }

    filteredEntries.push([key, entry]);
  }

  const output: StringsTable = {};
  for (const [key, { value }] of filteredEntries) {
    output[key] = value;
  }

  const knownValues = new Set(Object.values(output));
  const candidates = missingSource
    ? []
    : findMissingStringCandidates(sourceDir, knownValues, excludeData.values);

  ensureOutputDirectoryExists(outputFile);
  writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);

  return {
    count: filteredEntries.length,
    outputFile,
    sourceDir,
    missingSource,
    duplicates,
    candidates,
    excluded,
    excludeFile: excludeData.filePath,
    excludeFileMissing: excludeData.missing,
  };
}

function parseCliArgs(argv: string[]) {
  const positionals: string[] = [];
  let source: string | undefined;
  let output: string | undefined;
  let exclude: string | null | undefined;

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
      case "-e":
      case "--exclude":
        if (i + 1 >= argv.length) {
          throw new Error(`[strings-bundler] Missing value for ${arg}.`);
        }

        exclude = argv[i + 1];
        i += 1;
        break;
      case "--no-exclude":
        exclude = null;
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
    exclude,
  };
}

function printHelp() {
  const scriptName = basename(process.argv[1] ?? "strings-bundler");
  const indent = " ".repeat(scriptName.length + 7);

  console.log(`Usage: ${scriptName} [options] [sourceDir] [outputFile]

Options:
  -s, --source <dir>   Source directory to scan (${DEFAULT_SOURCE})
  -o, --output <file>  Destination path (${DEFAULT_OUTPUT})
  -e, --exclude <file> JSON file of string values to ignore (${DEFAULT_EXCLUDE} if present)
      --no-exclude     Disable exclude list processing
  -h, --help           Show this help message

Examples:
  ${scriptName}                              ${indent}# bundle from ./src to ./dist/strings.json
  ${scriptName} ./content ./public/strings.json  ${indent}# positional overrides
  ${scriptName} --source assets --output build/strings.json
  ${scriptName} --exclude i18n/exclude.json
`);
}

function runCli(argv = process.argv.slice(2)) {
  if (argv.some((arg) => arg === "-h" || arg === "--help")) {
    printHelp();
    return;
  }

  try {
    const { source, output, exclude } = parseCliArgs(argv);
    const sourceDir = resolve(process.cwd(), source);
    const outputFile = resolve(process.cwd(), output);
    let excludeFile: string | null;
    if (exclude === null) {
      excludeFile = null;
    } else if (exclude === undefined) {
      const defaultPath = resolve(process.cwd(), DEFAULT_EXCLUDE);
      excludeFile = existsSync(defaultPath) ? defaultPath : null;
    } else {
      excludeFile = resolve(process.cwd(), exclude);
    }

    const result = bundleStrings({ sourceDir, outputFile, excludeFile });

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
      if (result.excludeFile) {
        const displayPath = relative(process.cwd(), result.excludeFile) || result.excludeFile;
        if (result.excludeFileMissing) {
          console.warn(
            `[strings-bundler] Exclude file "${displayPath}" not found; no values were excluded.`
          );
        } else if (result.excluded.length > 0) {
          console.warn(
            `[strings-bundler] Excluded ${result.excluded.length} entr${
              result.excluded.length === 1 ? "y" : "ies"
            } using "${displayPath}".`
          );
        }
      }
      if (result.candidates.length > 0) {
        console.warn(
          `[strings-bundler] Detected ${result.candidates.length} candidate string${
            result.candidates.length === 1 ? "" : "s"
          } missing from ${result.outputFile}. Example JSON:`
        );
        const example: Record<string, string> = {};
        for (const candidate of result.candidates) {
          example[candidate.key] = candidate.value;
        }
        console.log(JSON.stringify(example, null, 2));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

runCli();

function loadExcludeValues(excludeFile?: string | null): ExcludeData {
  if (!excludeFile) {
    return {
      values: new Set(),
      filePath: null,
      missing: false,
    };
  }

  if (!existsSync(excludeFile)) {
    return {
      values: new Set(),
      filePath: excludeFile,
      missing: true,
    };
  }

  const raw = readFileSync(excludeFile, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `[strings-bundler] Failed to parse exclude file ${excludeFile}: ${(error as Error).message}`
    );
  }

  let stringList: string[] | undefined;

  if (Array.isArray(parsed)) {
    stringList = normalizeExcludeArray(parsed, excludeFile);
  } else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const candidate = record.strings ?? record.values;

    if (Array.isArray(candidate)) {
      stringList = normalizeExcludeArray(candidate, excludeFile);
    } else {
      const collected: string[] = [];
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === "string") {
          collected.push(value);
        } else {
          throw new Error(
            `[strings-bundler] Exclude file ${excludeFile} entry "${key}" must be a string.`
          );
        }
      }

      if (collected.length === 0) {
        throw new Error(
          `[strings-bundler] Exclude file ${excludeFile} must contain string values.`
        );
      }

      stringList = collected;
    }
  }

  if (!stringList) {
    throw new Error(
      `[strings-bundler] Exclude file ${excludeFile} must be an array of strings, an object with a "strings" array, or a map of string values.`
    );
  }

  return {
    values: new Set(stringList),
    filePath: excludeFile,
    missing: false,
  };
}

function normalizeExcludeArray(values: unknown[], excludeFile: string) {
  const strings: string[] = [];
  for (const [index, entry] of values.entries()) {
    if (typeof entry !== "string") {
      throw new Error(
        `[strings-bundler] Exclude file ${excludeFile} contains a non-string entry at index ${index}.`
      );
    }
    strings.push(entry);
  }

  if (strings.length === 0) {
    throw new Error(
      `[strings-bundler] Exclude file ${excludeFile} must contain at least one string.`
    );
  }

  return strings;
}

function loadTypescriptModule(): TypeScriptModule | null {
  if (cachedTypescript !== undefined) {
    return cachedTypescript;
  }

  try {
    cachedTypescript = require("typescript") as TypeScriptModule;
  } catch (error) {
    cachedTypescript = null;
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "MODULE_NOT_FOUND") {
      if (!warnedMissingTypescript) {
        console.warn(
          "[strings-bundler] Skipping TypeScript string scan; runtime dependency \"typescript\" not found."
        );
        warnedMissingTypescript = true;
      }
    } else if (!warnedMissingTypescript) {
      console.warn(
        `[strings-bundler] Skipping TypeScript string scan; failed to load \"typescript\": ${nodeError?.message ?? error}`
      );
      warnedMissingTypescript = true;
    }
  }

  return cachedTypescript;
}

function findMissingStringCandidates(
  sourceDir: string,
  knownValues: Set<string>,
  excludeValues: Set<string>
): CandidateSuggestion[] {
  const ts = loadTypescriptModule();
  if (!ts) {
    return [];
  }

  const accumulator = new Map<string, CandidateAccumulator>();
  const queue: string[] = [sourceDir];

  while (queue.length > 0) {
    const currentDir = queue.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch (error) {
      console.warn(
        `[strings-bundler] Unable to read directory ${currentDir}: ${(error as Error).message}`
      );
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }

        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!isTypescriptFile(entry.name)) {
        continue;
      }

      processTypescriptFile(ts, entryPath, knownValues, excludeValues, accumulator);
    }
  }

  const suggestions = Array.from(accumulator.values())
    .sort((a, b) => a.value.localeCompare(b.value))
    .map(({ value, sources }) => ({ value, sources: Array.from(sources).sort() }));

  const usedKeys = new Set<string>();
  return suggestions.map(({ value, sources }) => {
    const baseKey = buildCandidateKey(value);
    const uniqueKey = makeUniqueKey(baseKey, usedKeys);
    usedKeys.add(uniqueKey);

    return {
      key: uniqueKey,
      value,
      sources,
    };
  });
}

function shouldSkipDirectory(name: string) {
  return name === "node_modules" || name === "dist" || name.startsWith(".");
}

function isTypescriptFile(fileName: string) {
  if (fileName.endsWith(".d.ts")) {
    return false;
  }

  return fileName.endsWith(".ts") || fileName.endsWith(".tsx");
}

function processTypescriptFile(
  ts: TypeScriptModule,
  filePath: string,
  knownValues: Set<string>,
  excludeValues: Set<string>,
  accumulator: Map<string, CandidateAccumulator>
) {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    console.warn(
      `[strings-bundler] Unable to read ${filePath}: ${(error as Error).message}`
    );
    return;
  }

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const visit = (node: TsNode) => {
    const typedNode = node as import("typescript").Node;
    if (ts.isStringLiteralLike(typedNode)) {
      const literal = typedNode as TsStringLiteralLike;
      if (shouldSkipStringLiteral(ts, literal)) {
        return;
      }

      const value = literal.text;
      if (!value) {
        return;
      }

      if (knownValues.has(value) || excludeValues.has(value)) {
        return;
      }

      const { line } = sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile));
      const location = `${relative(process.cwd(), filePath)}:${line + 1}`;
      const existing = accumulator.get(value);
      if (existing) {
        existing.sources.add(location);
      } else {
        accumulator.set(value, {
          value,
          sources: new Set([location]),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function shouldSkipStringLiteral(ts: TypeScriptModule, node: TsStringLiteralLike) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) {
    return true;
  }

  if (ts.isExternalModuleReference(parent) && parent.expression === node) {
    return true;
  }

  if (ts.isLiteralTypeNode(parent)) {
    return true;
  }

  if (
    (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }

  if (ts.isEnumMember(parent) && parent.name === node) {
    return true;
  }

  return false;
}

function buildCandidateKey(value: string) {
  const sanitized = value
    .replace(/\{[^}]*\}/g, " ")
    .replace(/["'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const words = sanitized
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .slice(0, 6);

  if (words.length === 0) {
    return "stringCandidate";
  }

  const [first, ...rest] = words;
  const camel =
    normalizeLeadingCharacter(first) + rest.map((word) => capitalize(word)).join("");

  return camel.slice(0, 50);
}

function makeUniqueKey(baseKey: string, usedKeys: Set<string>) {
  let candidate = baseKey;
  let index = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${baseKey}${index}`;
    index += 1;
  }
  return candidate;
}

function normalizeLeadingCharacter(word: string): string {
  if (!word) {
    return "string";
  }

  const first = word[0];
  if (/[a-z]/.test(first)) {
    return word;
  }

  if (/[0-9]/.test(first)) {
    return `string${capitalize(word)}`;
  }

  return word.slice(1) ? normalizeLeadingCharacter(word.slice(1)) : "string";
}

function capitalize(word: string) {
  if (!word) {
    return word;
  }

  return word[0].toUpperCase() + word.slice(1);
}
