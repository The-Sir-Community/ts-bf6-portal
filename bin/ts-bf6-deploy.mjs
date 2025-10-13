#!/usr/bin/env node
import { readFile, access, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { bundle } from 'ts-portal-bundler/dist/bundler.js';
import { SantiagoWebPlayClient } from 'santiago-playweb-client';

const TOOL_NAME = 'ts-bf6-deploy';
const DEFAULT_CONFIG_FILE = 'ts-bf6-portal.config.json';
const SESSION_ENV_VAR = 'TS_BF6_GATEWAY_SESSION_ID';
const DEFAULT_BUNDLE_PATH = path.join('dest', 'portal-bundle.ts');

function log(message) {
  console.log(`[${TOOL_NAME}] ${message}`);
}

function logError(message) {
  console.error(`[${TOOL_NAME}] ${message}`);
}

function printUsage() {
  console.log(`Usage: ${TOOL_NAME} [--config <path>]`);
  console.log('');
  console.log('Flags:');
  console.log('  --config <path>  Path to configuration file (defaults to ts-bf6-portal.config.json)');
}

function parseArgs(argv) {
  const result = { configPath: DEFAULT_CONFIG_FILE };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--config') {
      const next = args.shift();
      if (!next) {
        throw new Error('--config flag requires a path argument');
      }
      result.configPath = next;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

async function fileExists(filepath) {
  try {
    await access(filepath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolvePath(baseDir, maybeRelative) {
  return path.isAbsolute(maybeRelative)
    ? maybeRelative
    : path.resolve(baseDir, maybeRelative);
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration file must contain a JSON object.');
  }
  if (!config.experienceId || typeof config.experienceId !== 'string') {
    throw new Error('Configuration is missing "experienceId" (string).');
  }
  const bundleCfg = config.bundle;
  if (!bundleCfg || typeof bundleCfg !== 'object') {
    throw new Error('Configuration is missing "bundle" object.');
  }
  if (!bundleCfg.entry || typeof bundleCfg.entry !== 'string') {
    throw new Error('Configuration bundle entry must be provided as a string.');
  }
  if (bundleCfg.outFile && typeof bundleCfg.outFile !== 'string') {
    throw new Error('Configuration bundle outFile must be a string when provided.');
  }
  if (bundleCfg.tsconfig && typeof bundleCfg.tsconfig !== 'string') {
    throw new Error('Configuration bundle tsconfig must be a string when provided.');
  }
  if (config.includeDenied !== undefined && typeof config.includeDenied !== 'boolean') {
    throw new Error('Configuration "includeDenied" must be a boolean when provided.');
  }
}

function isTypeScriptAttachment(attachment) {
  if (!attachment) {
    return false;
  }
  const type = attachment.attachmentType;
  const typeMatches = type === 2 || type === 'ATTACHMENT_TYPE_SPATIAL';
  if (!typeMatches) {
    return false;
  }
  const filename = attachment.filename?.value ?? attachment.filename;
  return typeof filename === 'string' && filename.toLowerCase().endsWith('.ts');
}

function getAttachmentFilename(attachment) {
  const raw = attachment?.filename?.value ?? attachment?.filename;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function selectTypeScriptAttachment(attachments, preferredFilename) {
  const typed = attachments.filter(isTypeScriptAttachment);
  if (!typed.length) {
    return undefined;
  }
  if (preferredFilename) {
    const match = typed.find(
      (att) => (att.filename?.value ?? att.filename) === preferredFilename
    );
    if (match) {
      return match;
    }
  }
  return typed[0];
}

function decodeAttachmentContent(attachment) {
  const original = attachment?.attachmentData?.original;
  if (!original) {
    return undefined;
  }
  const buffer = Buffer.isBuffer(original)
    ? original
    : Buffer.from(original);
  return buffer.toString('utf8');
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

async function loadConfig(configPath) {
  const exists = await fileExists(configPath);
  if (!exists) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }
  const raw = await readFile(configPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${configPath}: ${error.message}`);
  }
  validateConfig(parsed);
  return parsed;
}

function detectPermissionError(error) {
  if (!error || typeof error.message !== 'string') {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes('403') || message.includes('unauthorized') || message.includes('permission');
}

async function main() {
  const { configPath } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const resolvedConfigPath = resolvePath(cwd, configPath);
  log(`Using config: ${resolvedConfigPath}`);

  const config = await loadConfig(resolvedConfigPath);
  const bundleConfig = config.bundle;
  const sessionId = process.env[SESSION_ENV_VAR];
  if (!sessionId || sessionId.trim() === '') {
    throw new Error(
      `Missing ${SESSION_ENV_VAR}. Log into https://portal.battlefield.com/, copy your x-gateway-session-id, and export it as ${SESSION_ENV_VAR}.`
    );
  }

  const entryFile = resolvePath(path.dirname(resolvedConfigPath), bundleConfig.entry);
  const outFile = resolvePath(
    path.dirname(resolvedConfigPath),
    bundleConfig.outFile ?? DEFAULT_BUNDLE_PATH
  );
  const tsconfigPath = bundleConfig.tsconfig
    ? resolvePath(path.dirname(resolvedConfigPath), bundleConfig.tsconfig)
    : undefined;

  log(`Bundling from ${entryFile}`);
  log(`Writing bundle to ${outFile}`);
  await mkdir(path.dirname(outFile), { recursive: true });

  try {
    bundle({ entryFile, outFile, tsConfigPath: tsconfigPath });
  } catch (error) {
    throw new Error(`Failed to bundle entry file: ${error.message}`);
  }

  const bundledScript = await readFile(outFile, 'utf8');
  log(`Bundle complete (${bundledScript.length} bytes).`);

  const stampedScript = `// Updated ${new Date().toISOString()}\n${bundledScript}`;

  const client = new SantiagoWebPlayClient({ sessionId });

  log('Updating script via Santiago WebPlay API');
  const response = await client.updateTypeScriptCode(
    config.experienceId,
    stampedScript
  );

  const name = response?.playElement?.name ?? 'Unknown';
  const updatedAttachment = selectTypeScriptAttachment(
    response?.playElementDesign?.attachments ?? [],
    undefined
  );
  const updatedFilename = getAttachmentFilename(updatedAttachment) ?? 'Script.ts';
  log(`Deployment succeeded for experience ${config.experienceId} (${name}).`);
  if (response?.playElement?.publishStateType !== undefined) {
    log(`Publish state: ${response.playElement.publishStateType}`);
  }

  log('Verifying deployed TypeScript content');
  const verification = await client.getPlayElementDecoded({
    id: config.experienceId,
    includeDenied: config.includeDenied ?? false,
  });
  const verificationAttachment = selectTypeScriptAttachment(
    verification?.playElementDesign?.attachments ?? [],
    updatedFilename
  );
  const latestCode = decodeAttachmentContent(verificationAttachment);
  if (!latestCode) {
    throw new Error('Could not retrieve TypeScript attachment after update.');
  }

  const expected = normalizeLineEndings(stampedScript);
  const actual = normalizeLineEndings(latestCode);
  if (expected !== actual) {
    throw new Error(`Verification failed: remote code in ${updatedFilename} does not match bundled output.`);
  }

  log(`Verified ${updatedFilename} is up to date (${actual.length} bytes).`);
}

main().catch((error) => {
  if (detectPermissionError(error)) {
    logError('Permission error when calling WebPlay API.');
    logError('Visit https://portal.battlefield.com/, ensure you are logged in, and set the x-gateway-session-id via:');
    logError(`  export ${SESSION_ENV_VAR}=<your-session-id>`);
  }
  logError(error?.message ?? 'Unknown error');
  process.exitCode = 1;
});
