#!/usr/bin/env node
import { readFile, access, mkdir } from 'node:fs/promises';
import { constants as fsConstants, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { bundle } from 'ts-portal-bundler/dist/bundler.js';
import {
  SantiagoWebPlayClient,
  PlayElementModifier,
  RotationBehavior,
  BalancingMethod,
  PublishState,
  createTeams,
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

  // Support both old "experienceId" and new "id" field
  const hasExperienceId = config.id || config.experienceId;
  if (!hasExperienceId || typeof hasExperienceId !== 'string') {
    throw new Error('Configuration is missing "id" or "experienceId" (string).');
  }

  // Bundle configuration (required for bundling, optional if script.file is provided)
  const bundleCfg = config.bundle;
  const scriptCfg = config.script;

  // If no bundle config, script must have a file specified
  if (!bundleCfg && (!scriptCfg || !scriptCfg.file)) {
    throw new Error('Configuration must have either a "bundle" object or "script.file" specified.');
  }

  // Validate bundle config if provided
  if (bundleCfg) {
    if (typeof bundleCfg !== 'object') {
      throw new Error('Configuration "bundle" must be an object.');
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
  }

  // Validate script config if provided
  if (scriptCfg && typeof scriptCfg === 'object') {
    if (scriptCfg.file && typeof scriptCfg.file !== 'string') {
      throw new Error('Configuration script.file must be a string when provided.');
    }
    if (scriptCfg.code && typeof scriptCfg.code !== 'string') {
      throw new Error('Configuration script.code must be a string when provided.');
    }
    if (scriptCfg.inline && typeof scriptCfg.inline !== 'string') {
      throw new Error('Configuration script.inline must be a string when provided.');
    }
  }

  if (config.name !== undefined && typeof config.name !== 'string') {
    throw new Error('Configuration "name" must be a string when provided.');
  }

  if (config.description !== undefined && typeof config.description !== 'string') {
    throw new Error('Configuration "description" must be a string when provided.');
  }

  if (config.published !== undefined && typeof config.published !== 'boolean') {
    throw new Error('Configuration "published" must be a boolean when provided.');
  }

  if (config.maps !== undefined && !Array.isArray(config.maps)) {
    throw new Error('Configuration "maps" must be an array when provided.');
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

function getExperienceId(config) {
  return config.id || config.experienceId;
}

function getPublishState(published) {
  if (published === undefined) {
    return undefined;
  }
  return published ? PublishState.PUBLISHED : PublishState.DRAFT;
}

function getRotationBehavior(rotation) {
  if (!rotation) {
    return RotationBehavior.LOOP;
  }
  const normalized = rotation.toUpperCase();
  switch (normalized) {
    case 'SHUFFLE':
      return RotationBehavior.SHUFFLE;
    case 'ONCE':
      return RotationBehavior.ONCE;
    default:
      return RotationBehavior.LOOP;
  }
}

function getBalancingMethod(balancing) {
  if (!balancing) {
    return BalancingMethod.SKILL;
  }
  const normalized = balancing.toUpperCase();
  switch (normalized) {
    case 'SQUAD':
      return BalancingMethod.SQUAD;
    case 'NONE':
      return BalancingMethod.NONE;
    default:
      return BalancingMethod.SKILL;
  }
}

async function loadTypeScriptCode(scriptConfig, bundleConfig, configDir, outFile) {
  // If bundling is configured, bundle and use that
  if (bundleConfig) {
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

  // Otherwise, load from script config
  if (!scriptConfig) {
    throw new Error('No TypeScript code specified. Provide either bundle or script configuration.');
  }

  if (scriptConfig.code) {
    log('Using inline TypeScript code from script.code');
    return scriptConfig.code;
  }

  if (scriptConfig.inline) {
    log('Using inline TypeScript code from script.inline');
    return scriptConfig.inline;
  }

  if (scriptConfig.file) {
    const scriptPath = resolvePath(configDir, scriptConfig.file);
    log(`Loading TypeScript from: ${scriptConfig.file}`);
    return await readFile(scriptPath, 'utf8');
  }

  throw new Error('Script configuration must have either "file", "code", or "inline".');
}

function loadSpatialData(spatialConfig, configDir) {
  if (!spatialConfig) {
    return undefined;
  }

  if (spatialConfig.data) {
    return spatialConfig.data;
  }

  if (spatialConfig.file) {
    const spatialPath = resolvePath(configDir, spatialConfig.file);
    const content = readFileSync(spatialPath, 'utf8');
    return JSON.parse(content);
  }

  return undefined;
}

async function loadStringsContent(stringsPath) {
  const exists = await fileExists(stringsPath);
  if (!exists) {
    throw new Error(`Strings file not found at ${stringsPath}`);
  }

  let content;
  try {
    content = await readFile(stringsPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read Strings file ${stringsPath}: ${error.message}`);
  }

  try {
    JSON.parse(content);
  } catch (error) {
    throw new Error(`Strings file ${stringsPath} must be valid JSON: ${error.message}`);
  }

  return content;
}

function buildMutator(rule) {
  const kind = {};

  // Determine the mutator type based on the value type
  if (typeof rule.value === 'boolean') {
    kind.mutatorBoolean = { value: rule.value };
  } else if (typeof rule.value === 'number') {
    // Use int for whole numbers, float for decimals
    if (Number.isInteger(rule.value)) {
      kind.mutatorInt = { value: rule.value };
    } else {
      kind.mutatorFloat = { value: rule.value };
    }
  } else if (typeof rule.value === 'string') {
    kind.mutatorString = { value: rule.value };
  }

  return {
    name: rule.name,
    category: rule.category,
    kind,
    id: rule.id,
  };
}

function buildMapRotation(maps, configDir) {
  if (!maps || !Array.isArray(maps) || maps.length === 0) {
    return [];
  }

  return maps.map((mapConfig) => {
    const mapName = mapConfig.map || mapConfig.levelName;
    if (!mapName) {
      throw new Error('Map configuration must have "map" or "levelName" specified.');
    }

    // Create base team composition
    const teams = mapConfig.teams || [32, 32];
    const balancing = getBalancingMethod(mapConfig.balancing || mapConfig.teamBalancing);
    const teamComposition = createTeams(teams, balancing);

    // Add bots if configured
    if (mapConfig.bots && Array.isArray(mapConfig.bots)) {
      teamComposition.internalTeams = mapConfig.bots.map((bot) => {
        const teamId = bot.team || bot.teamId || 1;
        const spawnType = bot.type ? bot.type.toUpperCase() : (bot.spawnType || 'FILL');
        const capacityType = spawnType === 'FILL' ? 1 : 2;

        return {
          teamId,
          capacity: bot.count,
          capacityType,
        };
      });
    }

    const entry = {
      levelName: mapName,
      rounds: mapConfig.rounds || 1,
      allowedSpectators: mapConfig.spectators || mapConfig.allowedSpectators || 4,
      teamComposition,
    };

    // Load spatial data if specified
    if (mapConfig.spatial || mapConfig.spatialData) {
      const spatialConfig = mapConfig.spatial || mapConfig.spatialData;
      const spatialData = loadSpatialData(spatialConfig, configDir);
      if (spatialData) {
        entry.spatialData = spatialData;
        const filename = spatialConfig?.file
          ? path.basename(spatialConfig.file)
          : `${mapName}.spatial.json`;
        entry.spatialFilename = filename;
      }
    }

    // Add rules/mutators if configured
    if (mapConfig.rules || mapConfig.mutators) {
      const rules = mapConfig.rules || mapConfig.mutators;
      entry.mutators = rules.map(buildMutator);
    }

    // Add joinability settings if configured
    if (mapConfig.joinability || mapConfig.gameSettings) {
      const joinability = mapConfig.joinability || mapConfig.gameSettings;
      entry.blazeGameSettings = {
        joinInProgress: joinability.joinInProgress !== undefined
          ? (joinability.joinInProgress ? 1 : 2)
          : joinability.openToJoinByPlayer !== undefined
          ? (joinability.openToJoinByPlayer ? 1 : 2)
          : undefined,
        openToJoinByPlayer: joinability.openJoin !== undefined
          ? (joinability.openJoin ? 1 : 2)
          : joinability.openToJoinByPlayer !== undefined
          ? (joinability.openToJoinByPlayer ? 1 : 2)
          : undefined,
        openToInvites: joinability.invites !== undefined
          ? (joinability.invites ? 1 : 2)
          : joinability.openToInvites !== undefined
          ? (joinability.openToInvites ? 1 : 2)
          : undefined,
      };
    }

    // Add matchmaking settings if configured
    if (mapConfig.matchmaking !== undefined) {
      entry.gameServerJoinabilitySettings = {
        matchmakingInProgress: mapConfig.matchmaking ? 1 : 2,
      };
    }

    return entry;
  });
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
  const { configPath, stringsPath } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const resolvedConfigPath = resolvePath(cwd, configPath);
  const configDir = path.dirname(resolvedConfigPath);
  const defaultStringsCandidate = resolvePath(configDir, path.join('dist', 'strings.json'));

  let stringsFile = null;
  let stringsResolution = 'none';
  if (stringsPath === null) {
    stringsResolution = 'disabled';
  } else if (stringsPath === undefined) {
    if (await fileExists(defaultStringsCandidate)) {
      stringsFile = defaultStringsCandidate;
      stringsResolution = 'auto';
    }
  } else {
    stringsFile = resolvePath(configDir, stringsPath);
    stringsResolution = 'explicit';
  }

  log(`Using config: ${resolvedConfigPath}`);

  const config = await loadConfig(resolvedConfigPath);
  const experienceId = getExperienceId(config);
  const sessionId = process.env[SESSION_ENV_VAR];

  if (!sessionId || sessionId.trim() === '') {
    throw new Error(
      `Missing ${SESSION_ENV_VAR}. Log into https://portal.battlefield.com/, copy your x-gateway-session-id, and export it as ${SESSION_ENV_VAR}.`
    );
  }

  // Determine where to write the bundled output
  const outFile = resolvePath(
    configDir,
    config.bundle?.outFile ?? DEFAULT_BUNDLE_PATH
  );

  // Load TypeScript code (bundled or from file)
  const typeScriptCode = await loadTypeScriptCode(
    config.script,
    config.bundle,
    configDir,
    outFile
  );
  const stampedScript = `// Updated ${new Date().toISOString()}\n${typeScriptCode}`;

  // Initialize client
  const client = new SantiagoWebPlayClient({ sessionId });

  // Fetch current experience
  log(`Fetching current experience (${experienceId})`);
  const current = await client.getPlayElementDecoded({
    id: experienceId,
    includeDenied: config.includeDenied ?? false,
  });

  // Create modifier for updates
  const modifier = new PlayElementModifier(current);

  // Update basic properties
  if (config.name) {
    log(`Setting name: ${config.name}`);
    modifier.setName(config.name);
  }

  if (config.description) {
    log(`Setting description: ${config.description}`);
    modifier.setDescription(config.description);
  }

  // Update publish state
  if (config.published !== undefined) {
    const publishState = getPublishState(config.published);
    log(`Setting publish state: ${config.published ? 'PUBLISHED' : 'DRAFT'}`);
    modifier.setPublishState(publishState);
  }

  if (stringsFile) {
    const stringsContent = await loadStringsContent(stringsFile);
    const displayPath = path.relative(configDir, stringsFile) || stringsFile;
    const basename = path.basename(stringsFile);
    const suffix = stringsResolution === 'auto' ? ' (auto-detected)' : '';
    log(`Attaching strings from ${displayPath}${suffix}`);
    modifier.setStrings(stringsContent, basename);
  } else if (stringsResolution === 'explicit') {
    throw new Error('Strings file resolution failed unexpectedly.');
  }

  // Update TypeScript code
  log(`Updating TypeScript code (${stampedScript.length} bytes)`);
  modifier.setTypeScriptCode(stampedScript);

  // Update map rotation if provided
  if (config.maps && Array.isArray(config.maps) && config.maps.length > 0) {
    log(`Building map rotation with ${config.maps.length} map(s)`);
    const mapEntries = buildMapRotation(config.maps, configDir);
    const rotationBehavior = getRotationBehavior(config.rotation);
    modifier.clearSpatialAttachments();
    modifier.setMapRotation(mapEntries, rotationBehavior);
  }

  // Send the update
  log('Sending update to Santiago WebPlay API');
  const updated = await client.updatePlayElement({
    id: experienceId,
    ...modifier.build(),
  });

  log('Deployment succeeded');
  if (updated.playElement?.name) {
    log(`Experience name: ${updated.playElement.name}`);
  }
  if (updated.playElement?.publishStateType !== undefined) {
    const publishState = updated.playElement.publishStateType === 2 ? 'PUBLISHED' : 'DRAFT';
    log(`Publish state: ${publishState}`);
  }

  // Verify deployment
  log('Verifying deployed TypeScript content');
  const verification = await client.getPlayElementDecoded({
    id: experienceId,
    includeDenied: config.includeDenied ?? false,
  });

  const verificationAttachment = selectTypeScriptAttachment(
    verification?.playElementDesign?.attachments ?? [],
    undefined
  );
  const latestCode = decodeAttachmentContent(verificationAttachment);

  if (!latestCode) {
    throw new Error('Could not retrieve TypeScript attachment after update.');
  }

  const expected = normalizeLineEndings(stampedScript);
  const actual = normalizeLineEndings(latestCode);

  if (expected !== actual) {
    throw new Error('Verification failed: remote code does not match deployed output.');
  }

  const filename = getAttachmentFilename(verificationAttachment) ?? 'Script.ts';
  log(`Verified ${filename} is up to date (${actual.length} bytes).`);
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
