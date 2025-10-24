#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { bundle } from '../dist/src/bundler/bundler.js';
import { loadExperienceFromConfig } from '../dist/src/webplay/experience-loader.js';

const TOOL_NAME = 'ts-bf6-deploy';
const DEFAULT_CONFIG_FILE = 'ts-bf6-portal.config.json';
const DEFAULT_ENV_FILE = '.env';
const SESSION_ENV_VAR = 'BF_PORTAL_SESSION_ID';
const EXPERIENCE_ID_ENV_VAR = 'BF_PORTAL_EXPERIENCE_ID';
const DEFAULT_BUNDLE_PATH = path.join('dest', 'portal-bundle.ts');

function log(message) {
  console.log(`[${TOOL_NAME}] ${message}`);
}

function logError(message) {
  console.error(`[${TOOL_NAME}] ${message}`);
}

function printUsage() {
  console.log(`Usage: ${TOOL_NAME} [--config <path>] [--env-file <path>] [--strings <path>] [--no-strings]`);
  console.log('');
  console.log('Flags:');
  console.log('  --config <path>   Path to configuration file (defaults to ts-bf6-portal.config.json)');
  console.log('  --env-file <path> Path to .env file (defaults to .env if present)');
  console.log('  --strings <path>  Attach the specified Strings.json file via PlayElementModifier.setStrings (defaults to dist/strings.json when present)');
  console.log('  --no-strings      Disable automatic Strings attachment');
  console.log('');
  console.log('Environment Variables:');
  console.log(`  ${SESSION_ENV_VAR}       Session ID from https://portal.battlefield.com/ (can be in .env file)`);
  console.log(`  ${EXPERIENCE_ID_ENV_VAR}  Experience ID to deploy to (can be in .env file or config)`);
}

function parseArgs(argv) {
  const result = { configPath: DEFAULT_CONFIG_FILE, envFilePath: DEFAULT_ENV_FILE, stringsPath: undefined };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--config') {
      const next = args.shift();
      if (!next) {
        throw new Error('--config flag requires a path argument');
      }
      result.configPath = next;
    } else if (arg === '--env-file') {
      const next = args.shift();
      if (!next) {
        throw new Error('--env-file flag requires a path argument');
      }
      result.envFilePath = next;
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

function loadEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) {
    return null;
  }

  try {
    const envContent = readFileSync(envFilePath, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      // Skip empty lines and comments
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();

      // Only set if not already set from command line
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    return lines.filter(l => l.trim() && !l.trim().startsWith('#')).length;
  } catch (error) {
    throw new Error(`Failed to load .env file ${envFilePath}: ${error.message}`);
  }
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

async function compileStringsConfig(configDir, stringsPath) {
  let stringsFile = null;
  let stringsResolution = 'none';

  if (stringsPath === null) {
    return null;
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
    return null;
  }

  try {
    const stringsContent = await readFile(stringsFile, 'utf8');
    // Validate JSON
    JSON.parse(stringsContent);

    const displayPath = path.relative(configDir, stringsFile) || stringsFile;
    const basename = path.basename(stringsFile);
    const suffix = stringsResolution === 'auto' ? ' (auto-detected)' : '';
    log(`Compiling strings from ${displayPath}${suffix}`);

    return {
      [basename]: stringsContent,
    };
  } catch (error) {
    if (stringsResolution === 'explicit') {
      throw new Error(`Failed to compile strings: ${error.message}`);
    }
    // Auto-detection failures are non-fatal
    log(`Note: Could not compile strings (${error.message})`);
    return null;
  }
}

async function main() {
  const { configPath, envFilePath, stringsPath } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const resolvedConfigPath = resolvePath(cwd, configPath);
  const configDir = path.dirname(resolvedConfigPath);

  // Load .env file if it exists
  const resolvedEnvPath = resolvePath(cwd, envFilePath);
  const envVarsLoaded = loadEnvFile(resolvedEnvPath);
  if (envVarsLoaded) {
    log(`Loaded ${envVarsLoaded} environment variable(s) from ${resolvedEnvPath}`);
  }

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
      `Missing ${SESSION_ENV_VAR}. Log into https://portal.battlefield.com/, copy your x-gateway-session-id, and either:\n` +
      `  1. Create a .env file with: ${SESSION_ENV_VAR}=<your-session-id>\n` +
      `  2. Export it as an environment variable: export ${SESSION_ENV_VAR}=<your-session-id>`
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

  // Resolve experience ID from config, env file, or environment
  const experienceId = config.id || config.experienceId || process.env[EXPERIENCE_ID_ENV_VAR];
  if (!experienceId) {
    throw new Error(
      `Experience ID is required. Provide it in one of these ways:\n` +
      `  1. In config file as "id" or "experienceId"\n` +
      `  2. In .env file as ${EXPERIENCE_ID_ENV_VAR}=<experience-id>\n` +
      `  3. As an environment variable: export ${EXPERIENCE_ID_ENV_VAR}=<experience-id>`
    );
  }

  try {
    log(`Deploying to experience: ${experienceId}`);

    // Handle script/code configuration
    if (config.script?.inline) {
      log(`Updating TypeScript code (${config.script.inline.length} bytes)`);
    } else if (config.script?.code) {
      log(`Updating TypeScript code (${config.script.code.length} bytes)`);
    } else if (config.script?.file) {
      const scriptPath = resolvePath(configDir, config.script.file);
      const scriptContent = await readFile(scriptPath, 'utf8');
      log(`Updating TypeScript code from ${config.script.file} (${scriptContent.length} bytes)`);
      config.script = { inline: scriptContent };
    }

    // Compile strings configuration before API call
    const stringsConfig = await compileStringsConfig(configDir, stringsPath);
    if (stringsConfig) {
      // Merge strings into config
      if (!config.strings) {
        config.strings = {};
      }
      Object.assign(config.strings, stringsConfig);
    }

    // Single API call with complete configuration (pass config object directly)
    log('Sending update to Santiago WebPlay API');
    const updated = await loadExperienceFromConfig(config, {
      playElementId: experienceId,
      sessionId,
      configDir, // Pass the config directory for resolving relative file paths
    });

    log('Deployment succeeded');
    if (updated?.playElement?.name) {
      log(`Experience name: ${updated.playElement.name}`);
    }
    if (stringsConfig) {
      log('Strings attachment completed');
    }
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
