#!/usr/bin/env node
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { bundle } from 'ts-portal-bundler/dist/bundler.js';
import {
  SantiagoWebPlayClient,
  PlayElementModifier,
} from 'santiago-playweb-client';

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
  console.log(`Usage: ${TOOL_NAME} [--config <path>] [--strings <path>] [--no-strings]`);
  console.log('');
  console.log('Flags:');
  console.log('  --config <path>   Path to configuration file (defaults to ts-bf6-portal.config.json)');
  console.log('  --strings <path>  Attach the specified Strings.json file via PlayElementModifier.setStrings (defaults to dist/strings.json when present)');
  console.log('  --no-strings      Disable automatic Strings attachment');
}

function parseArgs(argv) {
  const result = { configPath: DEFAULT_CONFIG_FILE, stringsPath: undefined };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--config') {
      const next = args.shift();
      if (!next) {
        throw new Error('--config flag requires a path argument');
      }
      result.configPath = next;
    } else if (arg === '--strings') {
      const next = args.shift();
      if (!next) {
        throw new Error('--strings flag requires a path argument');
      }
      result.stringsPath = next;
    } else if (arg === '--no-strings') {
      result.stringsPath = null;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function resolvePath(baseDir, maybeRelative) {
  return path.isAbsolute(maybeRelative)
    ? maybeRelative
    : path.resolve(baseDir, maybeRelative);
}


async function bundleIfNeeded(config, configDir, outFile) {
  if (!config.bundle) {
    return undefined;
  }

  const bundleConfig = config.bundle;
  const entryFile = resolvePath(configDir, bundleConfig.entry);
  const tsconfigPath = bundleConfig.tsconfig
    ? resolvePath(configDir, bundleConfig.tsconfig)
    : undefined;

  log(`Bundling from ${entryFile}`);
  await mkdir(path.dirname(outFile), { recursive: true });

  try {
    bundle({ entryFile, outFile, tsConfigPath: tsconfigPath });
  } catch (error) {
    throw new Error(`Failed to bundle entry file: ${error.message}`);
  }

  const bundledScript = await readFile(outFile, 'utf8');
  log(`Bundle complete (${bundledScript.length} bytes).`);
  return bundledScript;
}

async function applyStringsIfConfigured(client, experienceId, configDir, stringsPath, config) {
  let stringsFile = null;
  let stringsResolution = 'none';

  if (stringsPath === null) {
    stringsResolution = 'disabled';
  } else if (stringsPath === undefined) {
    const defaultStringsCandidate = resolvePath(configDir, path.join('dist', 'strings.json'));
    if (existsSync(defaultStringsCandidate)) {
      stringsFile = defaultStringsCandidate;
      stringsResolution = 'auto';
    }
  } else {
    stringsFile = resolvePath(configDir, stringsPath);
    stringsResolution = 'explicit';
  }

  if (!stringsFile) {
    return;
  }

  try {
    const stringsContent = await readFile(stringsFile, 'utf8');
    // Validate JSON
    JSON.parse(stringsContent);

    const displayPath = path.relative(configDir, stringsFile) || stringsFile;
    const basename = path.basename(stringsFile);
    const suffix = stringsResolution === 'auto' ? ' (auto-detected)' : '';
    log(`Attaching strings from ${displayPath}${suffix}`);

    // Fetch current, modify, and update
    const current = await client.getPlayElementDecoded({
      id: experienceId,
      includeDenied: config.includeDenied ?? false,
    });

    const modifier = new PlayElementModifier(current);
    modifier.setStrings(stringsContent, basename);

    await client.updatePlayElement({
      id: experienceId,
      ...modifier.build(),
    });

    log('Strings attachment completed');
  } catch (error) {
    if (stringsResolution === 'explicit') {
      throw new Error(`Failed to attach strings: ${error.message}`);
    }
    // Auto-detection failures are non-fatal
    log(`Note: Could not attach strings (${error.message})`);
  }
}

async function main() {
  const { configPath, stringsPath } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const resolvedConfigPath = resolvePath(cwd, configPath);
  const configDir = path.dirname(resolvedConfigPath);

  log(`Using config: ${resolvedConfigPath}`);

  // Load and parse config
  if (!existsSync(resolvedConfigPath)) {
    throw new Error(`Configuration file not found at ${resolvedConfigPath}`);
  }

  const configContent = readFileSync(resolvedConfigPath, 'utf8');
  let config;
  try {
    config = JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${resolvedConfigPath}: ${error.message}`);
  }

  const sessionId = process.env[SESSION_ENV_VAR];
  if (!sessionId || sessionId.trim() === '') {
    throw new Error(
      `Missing ${SESSION_ENV_VAR}. Log into https://portal.battlefield.com/, copy your x-gateway-session-id, and export it as ${SESSION_ENV_VAR}.`
    );
  }

  // Handle bundling if configured
  const outFile = resolvePath(
    configDir,
    config.bundle?.outFile ?? DEFAULT_BUNDLE_PATH
  );

  const bundledCode = await bundleIfNeeded(config, configDir, outFile);
  if (bundledCode) {
    // Replace bundle config with inline script
    config.script = {
      inline: `// Updated ${new Date().toISOString()}\n${bundledCode}`,
    };
    delete config.bundle;
  }

  // Initialize client
  const client = new SantiagoWebPlayClient({ sessionId });

  try {
    // Apply configuration using upstream client
    const experienceId = config.id || config.experienceId;
    if (!experienceId) {
      throw new Error('Configuration must have "id" or "experienceId".');
    }

    log(`Deploying to experience: ${experienceId}`);

    // Fetch current experience
    const current = await client.getPlayElementDecoded({
      id: experienceId,
      includeDenied: config.includeDenied ?? false,
    });

    // Create modifier and apply all config updates
    const modifier = new PlayElementModifier(current);

    if (config.name) {
      log(`Setting name: ${config.name}`);
      modifier.setName(config.name);
    }

    if (config.description) {
      log(`Setting description: ${config.description}`);
      modifier.setDescription(config.description);
    }

    if (config.published !== undefined) {
      log(`Setting publish state: ${config.published ? 'PUBLISHED' : 'DRAFT'}`);
      modifier.setPublishState(config.published ? 2 : 1);
    }

    // Set script/code
    if (config.script?.inline) {
      log(`Updating TypeScript code (${config.script.inline.length} bytes)`);
      modifier.setTypeScriptCode(config.script.inline);
    } else if (config.script?.code) {
      log(`Updating TypeScript code (${config.script.code.length} bytes)`);
      modifier.setTypeScriptCode(config.script.code);
    } else if (config.script?.file) {
      const scriptPath = resolvePath(configDir, config.script.file);
      const scriptContent = await readFile(scriptPath, 'utf8');
      log(`Updating TypeScript code from ${config.script.file} (${scriptContent.length} bytes)`);
      modifier.setTypeScriptCode(scriptContent);
    }

    // Send update
    log('Sending update to Santiago WebPlay API');
    const updated = await client.updatePlayElement({
      id: experienceId,
      ...modifier.build(),
    });

    log('Deployment succeeded');
    if (updated.playElement?.name) {
      log(`Experience name: ${updated.playElement.name}`);
    }

    // Handle strings separately if configured
    await applyStringsIfConfigured(client, experienceId, configDir, stringsPath, config);
  } catch (error) {
    if (error.message?.toLowerCase().includes('403') ||
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.toLowerCase().includes('permission')) {
      logError('Permission error when calling WebPlay API.');
      logError('Visit https://portal.battlefield.com/, ensure you are logged in, and set the x-gateway-session-id via:');
      logError(`  export ${SESSION_ENV_VAR}=<your-session-id>`);
    }
    throw error;
  }
}

main().catch((error) => {
  logError(error?.message ?? 'Unknown error');
  process.exitCode = 1;
});
