/**
 * Experience Loader - Load and apply Battlefield Portal experiences from JSON configurations
 *
 * This module provides a high-level API for loading experience configurations from JSON files,
 * resolving external file references, and applying them to the WebPlay API.
 *
 * @module experience-loader
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SantiagoWebPlayClient,
  PlayElementModifier,
  RotationBehavior,
  BalancingMethod,
  PublishState,
  createTeams,
  sparseMutator,
  type MapEntry,
  type Mutator,
  type MutatorKind,
} from './playweb-client.js';

// ============================================================================
// Asset Category Types and UUID Mapping
// ============================================================================

/**
 * Human-readable asset category types
 * These map to UUID tagIds internally
 */
export enum AssetCategoryType {
  // Common categories
  WEAPON = 'weapon',
  VEHICLE = 'vehicle',
  GADGET = 'gadget',
  MELEE = 'melee',
  THROWABLE = 'throwable',
  EQUIPMENT = 'equipment',
  CLASS = 'class',
  SPECIALIZATION = 'specialization',
}

/**
 * Map of known asset category UUID to human-readable names
 * Populate this as UUIDs are discovered from the game/API
 *
 * To discover UUID meanings:
 * 1. Download an experience using downloadExperienceAsJSON()
 * 2. Check console logs for unmapped UUIDs
 * 3. Cross-reference with game data or API responses
 * 4. Add mappings here as they are discovered
 */
export const ASSET_CATEGORY_UUID_MAP: Record<string, string> = {
  // IMPORTANT: Keys must be lowercase UUIDs (they're converted to lowercase when looking up)
  // Known mappings (add as discovered)
  '47ef914c-ad5b-4248-ae86-d73d1369c009': 'class_assault',
  '49e59f6a-8eb7-4f27-a9e9-8c375b4af5eb': 'class_engineer',
  '835aa100-f265-4065-bc6c-8376bfbda606': 'class_recon',
  '74398fcc-a02e-4aee-b830-ac9cd400c837': 'class_support',
  '0f72e98a-53b7-4380-9435-263b621d11d2': 'vehicle_kht',
  'd9a88985-e856-4825-8c1f-5a2aadfc8840': 'vehicle_su57',
  '95ec6560-1be8-40cc-af70-b9db59375dc1': 'vehicle_f61v'
};

/**
 * Reverse map: human-readable name to UUID
 * Auto-populated from ASSET_CATEGORY_UUID_MAP on first use
 */
export const ASSET_CATEGORY_NAME_TO_UUID: Record<string, string> = {
  // Auto-generated from ASSET_CATEGORY_UUID_MAP
};

/**
 * Initialize the reverse mapping
 */
function initializeNameToUuidMap() {
  for (const [uuid, name] of Object.entries(ASSET_CATEGORY_UUID_MAP)) {
    ASSET_CATEGORY_NAME_TO_UUID[name.toLowerCase()] = uuid;
  }
}

// Initialize on module load
initializeNameToUuidMap();

/**
 * Configuration for a bot/AI spawn
 */
export interface BotConfig {
  /** Team ID (1-based) */
  team?: number;
  /** Spawn type: 'fill' (fill empty slots) or 'fixed' (always spawn this many) */
  type?: 'fill' | 'fixed';
  /** Number of bots to spawn */
  count: number;

  // Deprecated aliases for backward compatibility
  teamId?: number;
  spawnType?: 'FILL' | 'FIXED';
}

/**
 * Configuration for a global game rule/mutator (applies to all teams)
 */
export interface GlobalRuleConfig {
  /** Mutator name (from Mutators constants) */
  name: string;
  /** Mutator value (boolean, number, or string) */
  value: boolean | number | string;
  /** Optional mutator category */
  category?: string;
  /** Optional mutator ID */
  id?: string;
}

/**
 * Configuration for a per-team (sparse) game rule/mutator
 *
 * Specify different values for different teams.
 *
 * @example
 * // Team 1 gets 2.0x health, Team 2 gets 1.5x health, others get default (1.0x)
 * {
 *   "name": "SOLDIER_MAX_HEALTH_PER_TEAM",
 *   "perTeamValues": [2.0, 1.5],
 *   "defaultValue": 1.0
 * }
 *
 * @example
 * // Disable sprint for Team 2, enable for others
 * {
 *   "name": "SPRINT_ALLOWED_PER_TEAM",
 *   "perTeamValues": [true, false, true],
 *   "defaultValue": true
 * }
 */
export interface SparseRuleConfig {
  /** Mutator name (must be a per-team mutator from Mutators constants) */
  name: string;
  /** Array of per-team values (index 0 = team 1, index 1 = team 2, etc.) */
  perTeamValues: Array<boolean | number>;
  /** Default value for teams not in perTeamValues array (optional) */
  defaultValue?: boolean | number;
  /** Optional mutator category */
  category?: string;
}

/**
 * Configuration for a game rule/mutator (global or per-team)
 */
export type RuleConfig = GlobalRuleConfig | SparseRuleConfig;

/**
 * Game joinability settings
 */
export interface JoinabilityConfig {
  /** Allow joining in progress */
  joinInProgress?: boolean;
  /** Allow open join */
  openJoin?: boolean;
  /** Allow invites */
  invites?: boolean;

  // Deprecated aliases
  openToJoinByPlayer?: boolean;
  openToInvites?: boolean;
}

/**
 * Spatial/map data configuration
 */
export interface SpatialConfig {
  /** Path to spatial data file (relative to config file location) */
  file?: string;
  /** Inline spatial data object */
  data?: object;

  // Deprecated aliases
  inline?: object;
}

/**
 * Script/code configuration
 */
export interface ScriptConfig {
  /** Path to TypeScript/JavaScript file (relative to config file location) */
  file?: string;
  /** Inline TypeScript/JavaScript code */
  inline?: string;
  /** Alias for inline */
  code?: string;
}

/**
 * Localization strings configuration
 * Supports loading strings from a file or providing them inline
 */
export interface StringsConfig {
  /** Path to strings JSON file (relative to config file location) */
  file?: string;
  /** Inline localization strings object */
  data?: Record<string, unknown>;
}

/**
 * Asset restriction configuration (weapons, vehicles, gadgets)
 *
 * Restricts which assets (weapons, vehicles, gadgets) are available in the experience.
 * Use human-readable category names or specific asset names.
 *
 * @example
 * // Disable all gadgets
 * {
 *   "tagId": "gadget",
 *   "allowAll": false
 * }
 *
 * @example
 * // Allow only specific weapons
 * {
 *   "tagId": "weapon",
 *   "allowedTags": ["rifle_assault_m16a2", "rifle_sniper_spas12"]
 * }
 *
 * @example
 * // Per-team vehicle restrictions
 * {
 *   "tagId": "vehicle",
 *   "allowAll": false,
 *   "perTeamRestrictions": [
 *     { "teamId": 1, "allowAll": true },
 *     { "teamId": 2, "allowAll": false, "allowedTags": ["heli_transport"] }
 *   ]
 * }
 */
export interface AssetRestriction {
  /** Asset category name (from AssetCategoryType) or UUID */
  tagId: string;
  /** Allow all assets in this category (default true) */
  allowAll?: boolean;
  /** Specific asset tags/names to allow (if empty and allowAll is false, nothing is allowed) */
  allowedTags?: string[];
  /** Per-team restrictions (index 0 = team 1, etc.) */
  perTeamRestrictions?: Array<{
    teamId: number;
    allowAll?: boolean;
    allowedTags?: string[];
  }>;
}

/**
 * Map rotation entry configuration
 */
export interface MapConfig {
  /** Map name (e.g., 'Kaleidoscope', 'Breakaway') */
  map?: string;
  /** Display name for the map in the rotation */
  name?: string;
  /** Number of spectators allowed */
  spectators?: number;
  /** Team sizes (e.g., [32, 32] for 32v32) */
  teams?: number[];
  /** Team balancing method: 'none', 'skill', or 'squad' */
  balancing?: 'none' | 'skill' | 'squad';
  /** Spatial/map data configuration */
  spatial?: SpatialConfig;
  /** Game rules/mutators for this map */
  rules?: RuleConfig[];
  /** Joinability settings for this map */
  joinability?: JoinabilityConfig;
  /** Enable matchmaking for this map */
  matchmaking?: boolean;
  /** Number of rounds to play */
  rounds?: number;
  /** Bot spawn configuration */
  bots?: BotConfig[];

  // Deprecated field names for backward compatibility
  levelName?: string;
  displayName?: string;
  allowedSpectators?: number;
  teamSize?: '16v16' | '32v32' | '64v64' | 'custom';
  teamBalancing?: 'NONE' | 'SKILL' | 'SQUAD';
  customTeams?: Array<{ teamId: number; capacity: number }>;
  spatialData?: SpatialConfig;
  mutators?: RuleConfig[];
  gameSettings?: JoinabilityConfig;
  matchmakingSettings?: { matchmakingInProgress?: boolean };
}

/**
 * Attachment file reference in downloaded experience
 */
export interface AttachmentReference {
  /** Attachment type (SCRIPT, SPATIAL, STRINGS, etc.) */
  type: number;
  /** Relative file path to the attachment */
  file: string;
  /** Optional display name for the attachment */
  name?: string;
  /** Optional metadata (e.g., mapIdx for spatial data) */
  metadata?: string;
}

/**
 * Experience configuration
 */
export interface ExperienceConfig {
  /** Experience/playground ID (can be UUID or name) */
  id?: string;
  /** Whether the experience is published */
  published?: boolean;
  /** Map rotation behavior: 'loop', 'shuffle', or 'once' */
  rotation?: 'loop' | 'shuffle' | 'once';
  /** Experience name */
  name: string;
  /** Experience description */
  description?: string;
  /** TypeScript/JavaScript script configuration */
  script?: ScriptConfig;
  /** Localization strings configuration */
  strings?: StringsConfig;
  /** Map rotation entries */
  maps: MapConfig[];
  /** Global game rules/mutators (apply to all maps) */
  globalRules?: RuleConfig[];
  /** Asset restrictions (weapons, vehicles, gadgets, etc.) */
  restrictions?: AssetRestriction[];
  /** Attachment file references (populated when downloading) */
  attachments?: AttachmentReference[];
  /** Game settings */
  settings?: {
    /** Allow copies of this experience */
    allowCopies?: boolean;
    /** Secret for access control */
    secret?: string;
  };

  // Deprecated field names for backward compatibility
  experienceId?: string;
  publishState?: 'DRAFT' | 'PUBLISHED';
  rotationBehavior?: 'LOOP' | 'SHUFFLE' | 'ONCE';
}

/**
 * Options for loading an experience from config
 */
export interface LoadExperienceOptions {
  /** Session ID for authentication (can also be set via BF_PORTAL_SESSION_ID env var) */
  sessionId?: string;
  /** Play element ID (overrides config file) */
  playElementId?: string;
  /** Console logging level: 'verbose', 'normal', or 'silent' */
  logLevel?: 'verbose' | 'normal' | 'silent';
  /** Base directory for resolving relative file paths (only used when passing a config object, not a file path) */
  configDir?: string;
}

// ============================================================================
// Internal Helper Functions (Not Exported)
// ============================================================================

/**
 * Log helper with level support
 */
function log(message: string, level: 'info' | 'warn' | 'error', options: LoadExperienceOptions) {
  if (options.logLevel === 'silent') return;
  if (level === 'error' || level === 'warn' || options.logLevel !== 'verbose') {
    if (level === 'error') console.error(message);
    else if (level === 'warn') console.warn(message);
    else console.log(message);
  } else {
    console.log(message);
  }
}

/**
 * Load configuration from JSON file
 */
function loadConfigFile(configPath: string): ExperienceConfig {
  const configContent = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configContent) as ExperienceConfig;
}

/**
 * Load TypeScript code from file or return inline code
 */
function loadTypeScriptCode(scriptConfig: ScriptConfig | undefined, configDir: string): string {
  if (!scriptConfig) {
    return '// Default script\nconsole.log("Experience loaded");';
  }

  if (scriptConfig.inline) {
    return scriptConfig.inline;
  }

  if (scriptConfig.code && !scriptConfig.inline) {
    return scriptConfig.code;
  }

  if (scriptConfig.file) {
    const scriptPath = path.isAbsolute(scriptConfig.file)
      ? scriptConfig.file
      : path.resolve(configDir, scriptConfig.file);
    return fs.readFileSync(scriptPath, 'utf8');
  }

  throw new Error('Script configuration must have either "file", "inline", or "code"');
}

/**
 * Load spatial data from file or inline
 */
function loadSpatialData(
  spatialConfig: SpatialConfig | undefined,
  configDir: string
): string | Record<string, unknown> | undefined {
  if (!spatialConfig) {
    return undefined;
  }

  if (spatialConfig.inline) {
    return spatialConfig.inline as Record<string, unknown>;
  }

  if (spatialConfig.data) {
    return spatialConfig.data as Record<string, unknown>;
  }

  if (spatialConfig.file) {
    const spatialPath = path.isAbsolute(spatialConfig.file)
      ? spatialConfig.file
      : path.resolve(configDir, spatialConfig.file);
    return fs.readFileSync(spatialPath, 'utf8');
  }

  return undefined;
}

/**
 * Load localization strings from file or inline
 */
function loadStringsData(
  stringsConfig: StringsConfig | undefined,
  configDir: string
): Record<string, unknown> | string | undefined {
  if (!stringsConfig) {
    return undefined;
  }

  // Prefer data (inline) if present
  if (stringsConfig.data) {
    return stringsConfig.data;
  }

  if (stringsConfig.file) {
    const stringsPath = path.isAbsolute(stringsConfig.file)
      ? stringsConfig.file
      : path.resolve(configDir, stringsConfig.file);
    const content = fs.readFileSync(stringsPath, 'utf8');
    // Parse to validate it's valid JSON, then return the content
    try {
      JSON.parse(content);
      return content;
    } catch (err) {
      throw new Error(`Invalid JSON in strings file ${stringsConfig.file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return undefined;
}

/**
 * Normalize rotation behavior string to enum
 */
function normalizeRotationBehavior(behavior?: string): RotationBehavior {
  if (!behavior) return RotationBehavior.LOOP;
  const upper = behavior.toUpperCase();
  switch (upper) {
    case 'EORMM':
      return RotationBehavior.EORMM;
    case 'ONE_MAP':
    case 'ONCE':
      return RotationBehavior.ONE_MAP;
    case 'SHUFFLE':
    case 'LOOP':
    default:
      return RotationBehavior.LOOP;
  }
}

/**
 * Normalize publish state
 */
function normalizePublishState(published?: boolean, deprecated?: 'DRAFT' | 'PUBLISHED'): PublishState {
  if (published !== undefined) {
    return published ? PublishState.PUBLISHED : PublishState.DRAFT;
  }
  if (deprecated === 'PUBLISHED') {
    return PublishState.PUBLISHED;
  }
  return PublishState.DRAFT;
}

/**
 * Get bot spawn type (capacity type)
 */
function getBotCapacityType(spawnType?: 'FILL' | 'FIXED'): number {
  switch (spawnType?.toUpperCase()) {
    case 'FILL':
      return 1;
    case 'FIXED':
      return 2;
    default:
      return 1;
  }
}

/**
 * Normalize map field names (handle both new and old names)
 */
function normalizeMapName(mapConfig: MapConfig): string {
  return mapConfig.map || mapConfig.levelName || '';
}

function normalizeTeamSizes(mapConfig: MapConfig): number[] {
  if (mapConfig.teams) {
    return mapConfig.teams;
  }

  if (mapConfig.teamSize) {
    switch (mapConfig.teamSize) {
      case '16v16':
        return [16, 16];
      case '32v32':
        return [32, 32];
      case '64v64':
        return [64, 64];
      case 'custom':
        if (mapConfig.customTeams) {
          return mapConfig.customTeams.map(t => t.capacity);
        }
    }
  }

  return [32, 32];
}

function normalizeBalancingMethod(mapConfig: MapConfig): BalancingMethod {
  const balancing = mapConfig.balancing || mapConfig.teamBalancing;
  if (!balancing) return BalancingMethod.SKILL;

  const normalized = balancing.toUpperCase();
  switch (normalized) {
    case 'SKILL':
      return BalancingMethod.SKILL;
    case 'SQUAD':
      return BalancingMethod.SQUAD;
    case 'NONE':
      return BalancingMethod.NONE;
    default:
      return BalancingMethod.SKILL;
  }
}

function normalizeSpatialData(mapConfig: MapConfig): SpatialConfig | undefined {
  if (mapConfig.spatial) {
    return {
      file: mapConfig.spatial.file,
      data: mapConfig.spatial.data,
      inline: mapConfig.spatial.inline,
    };
  }
  return mapConfig.spatialData;
}

function normalizeRules(mapConfig: MapConfig): RuleConfig[] | undefined {
  return mapConfig.rules || mapConfig.mutators;
}

function normalizeJoinability(mapConfig: MapConfig): JoinabilityConfig | undefined {
  return mapConfig.joinability || mapConfig.gameSettings;
}

function normalizeMatchmaking(mapConfig: MapConfig): boolean | undefined {
  if (mapConfig.matchmaking !== undefined) {
    return mapConfig.matchmaking;
  }
  if (mapConfig.matchmakingSettings?.matchmakingInProgress !== undefined) {
    return mapConfig.matchmakingSettings.matchmakingInProgress;
  }
  return undefined;
}

function normalizeBotTeamId(bot: BotConfig): number {
  return bot.team || bot.teamId || 1;
}

function normalizeBotSpawnType(bot: BotConfig): 'FILL' | 'FIXED' {
  if (bot.type) {
    return bot.type.toUpperCase() as 'FILL' | 'FIXED';
  }
  return (bot.spawnType || 'FILL') as 'FILL' | 'FIXED';
}

/**
 * Check if a rule config is sparse (per-team)
 */
function isSparseRule(ruleConfig: RuleConfig): ruleConfig is SparseRuleConfig {
  return 'perTeamValues' in ruleConfig;
}

/**
 * Convert a readable asset category name to UUID
 * If the input looks like a UUID, return it as-is
 * If it's a known name in the mapping, return the UUID
 * Otherwise, return the input (may be a UUID or name not in our map)
 */
function nameToUUID(tagId: string): string {
  // If it's already a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), return as-is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tagId)) {
    return tagId;
  }

  // Check if it's in our name-to-UUID mapping
  const uuid = ASSET_CATEGORY_NAME_TO_UUID[tagId.toLowerCase()];
  if (uuid) {
    return uuid;
  }

  // If not found in mapping, return as-is (might be a custom name or known UUID)
  return tagId;
}

/**
 * Convert a UUID to a readable asset category name
 * If the UUID is in our mapping, return the readable name
 * Otherwise, return the UUID as-is for transparency
 */
function uuidToName(uuid: string, logUnmapped = false): string {
  // Check if it's in our UUID-to-name mapping
  const lowerUuid = uuid.toLowerCase();
  const name = ASSET_CATEGORY_UUID_MAP[lowerUuid];
  if (name) {
    return name;
  }

  // Log unmapped UUIDs for discovery (only once per UUID)
  if (logUnmapped && !unmappedUuids.has(lowerUuid)) {
    unmappedUuids.add(lowerUuid);
    console.log(`\n⚠️  Unmapped asset category UUID: ${lowerUuid}`);
    console.log(`    → Add to ASSET_CATEGORY_UUID_MAP for a readable name`);
    console.log(`    → Example: ASSET_CATEGORY_UUID_MAP['${lowerUuid}'] = 'descriptive_name';\n`);
  }

  // Return the UUID as-is if not mapped
  return uuid;
}

/**
 * Track unmapped UUIDs to avoid duplicate logging
 */
const unmappedUuids = new Set<string>();

/**
 * Convert asset restriction config to internal AssetCategory format
 */
function convertAssetRestrictionToCategory(restriction: AssetRestriction, availableAssetCategories?: Map<string, string>): any | null {
  if (!restriction.tagId) {
    return null;
  }

  // Convert readable name to UUID if needed
  // First try using the Blueprint data, then fall back to hardcoded map
  let uuid = restriction.tagId;
  if (availableAssetCategories) {
    const blueprintUuid = availableAssetCategories.get(restriction.tagId);
    if (blueprintUuid) {
      uuid = blueprintUuid;
    } else {
      // Tag name not found in blueprint
      console.warn(`Asset category '${restriction.tagId}' not found in Blueprint`);
      return null;
    }
  } else {
    // Fall back to hardcoded mapping if no blueprint data
    uuid = nameToUUID(restriction.tagId);
  }

  // Build the asset category structure
  const category: any = {
    tagId: uuid,
  };

  // If we have allowed tags, create boolean overrides
  if (restriction.allowedTags && restriction.allowedTags.length > 0) {
    category.boolean = {
      defaultValue: restriction.allowAll !== false, // If not explicitly false, default is true
      overrides: {
        assetCategoryTags: restriction.allowedTags,
        value: true, // Allowed tags are set to true
      },
    };
  } else if (restriction.allowAll === false) {
    // If allowAll is explicitly false and no allowedTags, disable all
    category.boolean = {
      defaultValue: false,
    };
  } else {
    // Default: allow all
    category.boolean = {
      defaultValue: true,
    };
  }

  // Handle per-team restrictions if specified
  if (restriction.perTeamRestrictions && restriction.perTeamRestrictions.length > 0) {
    category.boolean.teamOverrides = restriction.perTeamRestrictions.map(tr => ({
      teamId: tr.teamId,
      assetCategoryTags: tr.allowedTags || [],
      value: tr.allowAll !== false,
    }));
  }

  return category;
}

/**
 * Convert internal AssetCategory format to asset restriction config
 */
function convertAssetCategoryToRestriction(category: any, logUnmapped = false): AssetRestriction | null {
  if (!category.tagId || !category.boolean) {
    return null;
  }

  // Convert UUID to readable name if available, with logging for discovery
  const readableName = uuidToName(category.tagId, logUnmapped);

  const restriction: AssetRestriction = {
    tagId: readableName,
    allowAll: category.boolean.defaultValue ?? true,
  };

  // Extract allowed tags from overrides
  if (category.boolean.overrides?.assetCategoryTags) {
    restriction.allowedTags = category.boolean.overrides.assetCategoryTags;
  }

  // Extract per-team overrides
  if (category.boolean.teamOverrides && category.boolean.teamOverrides.length > 0) {
    restriction.perTeamRestrictions = category.boolean.teamOverrides.map((to: any) => ({
      teamId: to.teamId,
      allowAll: to.value ?? true,
      allowedTags: to.assetCategoryTags,
    }));
  }

  return restriction;
}

/**
 * Build mutator from rule configuration (global or sparse)
 */
function buildMutator(ruleConfig: RuleConfig, availableMutators?: Map<string, any>): Mutator {
  // Handle sparse/per-team rules
  if (isSparseRule(ruleConfig)) {
    const rule = ruleConfig as SparseRuleConfig;

    // Check what types of values we have
    const hasInt = rule.perTeamValues.some(v => typeof v === 'number' && Number.isInteger(v));

    let perTeamValues = rule.perTeamValues;
    let defaultValue = rule.defaultValue;

    // If we have integers in the sparse values, all values should be integers
    // This ensures sparseInt mutator gets proper integer values
    if (hasInt) {
      perTeamValues = rule.perTeamValues.map(v => {
        if (typeof v === 'number') {
          // Always convert to integer if we have any integers
          return Number.isInteger(v) ? v : Math.round(v);
        }
        return v;
      });

      if (typeof defaultValue === 'number') {
        defaultValue = Number.isInteger(defaultValue) ? defaultValue : Math.round(defaultValue);
      }
    }

    // For debugging: if this is a sparse int mutator that still has issues, log it
    if (process.env.DEBUG_SPARSE_MUTATORS) {
      const hasInt = perTeamValues.some(v => typeof v === 'number' && Number.isInteger(v));
      const hasNonInt = perTeamValues.some(v => typeof v === 'number' && !Number.isInteger(v));
      if (hasInt && hasNonInt) {
        console.error(`[DEBUG] Rule ${rule.name} has mixed int/float values:`, perTeamValues);
      }
    }

    const mutator = sparseMutator(rule.name, perTeamValues, defaultValue, rule.category);

    // Assign ID from blueprint if available
    if (availableMutators) {
      const blueprintMutator = availableMutators.get(rule.name);
      if (blueprintMutator && blueprintMutator.id) {
        mutator.id = blueprintMutator.id;
      }
    }

    return mutator;
  }

  // Handle global rules
  const rule = ruleConfig as GlobalRuleConfig;
  const kind: MutatorKind = {};

  if (typeof rule.value === 'boolean') {
    kind.mutatorBoolean = { value: rule.value };
  } else if (typeof rule.value === 'number') {
    if (Number.isInteger(rule.value)) {
      kind.mutatorInt = { value: rule.value };
    } else {
      kind.mutatorFloat = { value: rule.value };
    }
  } else if (typeof rule.value === 'string') {
    kind.mutatorString = { value: rule.value };
  }

  // Try to get ID from config first, then from blueprint if available
  let id = rule.id;
  if (!id && availableMutators) {
    const blueprintMutator = availableMutators.get(rule.name);
    if (blueprintMutator && blueprintMutator.id) {
      id = blueprintMutator.id;
    }
  }

  return {
    name: rule.name,
    category: rule.category,
    kind,
    id,
  };
}

/**
 * Build map rotation from configuration
 */
function buildMapRotation(maps: MapConfig[], configDir: string, options: LoadExperienceOptions, availableMutators?: Map<string, any>): MapEntry[] {
  log(`\n🗺️  Building map rotation with ${maps.length} map(s):`, 'info', options);

  return maps.map((mapConfig, index) => {
    const mapName = normalizeMapName(mapConfig);
    const displayName = mapConfig.name || mapConfig.displayName || mapName;
    const teams = normalizeTeamSizes(mapConfig);
    const balancing = normalizeBalancingMethod(mapConfig);
    const spatialConfig = normalizeSpatialData(mapConfig);
    const rules = normalizeRules(mapConfig);
    const joinability = normalizeJoinability(mapConfig);
    const matchmaking = normalizeMatchmaking(mapConfig);

    log(
      `   ${index + 1}. ${displayName} (${mapConfig.rounds || 1} round${(mapConfig.rounds || 1) > 1 ? 's' : ''})`,
      'info',
      options
    );

    const teamComposition = createTeams(teams, balancing);

    if (mapConfig.bots && mapConfig.bots.length > 0) {
      teamComposition.internalTeams = mapConfig.bots.map(bot => ({
        teamId: normalizeBotTeamId(bot),
        capacity: bot.count,
        capacityType: getBotCapacityType(normalizeBotSpawnType(bot)),
      }));

      const botDescriptions = mapConfig.bots.map(b => {
        const teamId = normalizeBotTeamId(b);
        const spawnType = normalizeBotSpawnType(b);
        return `Team ${teamId}: ${b.count} (${spawnType})`;
      });
      log(`      🤖 Bots: ${botDescriptions.join(', ')}`, 'info', options);
    }

    const entry: MapEntry = {
      levelName: mapName,
      rounds: mapConfig.rounds || 1,
      allowedSpectators: mapConfig.spectators || mapConfig.allowedSpectators || 4,
      teamComposition,
    };

    if (spatialConfig) {
      const spatialData = loadSpatialData(spatialConfig, configDir);
      if (spatialData) {
        entry.spatialData = spatialData;
        const filename = spatialConfig.file
          ? path.basename(spatialConfig.file)
          : `${mapName}_map${index}.spatial.json`;
        entry.spatialFilename = filename;
        log(`      📦 Spatial data: ${filename}`, 'info', options);
      }
    }

    if (rules && rules.length > 0) {
      entry.mutators = rules.map(rule => buildMutator(rule, availableMutators));
      log(`      ⚙️  Rules: ${rules.length} configured`, 'info', options);
    }

    if (joinability) {
      entry.blazeGameSettings = {
        joinInProgress: joinability.joinInProgress !== undefined
          ? joinability.joinInProgress
            ? 1
            : 2
          : joinability.openToJoinByPlayer !== undefined
            ? joinability.openToJoinByPlayer
              ? 1
              : 2
            : undefined,
        openToJoinByPlayer: joinability.openJoin !== undefined
          ? joinability.openJoin
            ? 1
            : 2
          : joinability.openToJoinByPlayer !== undefined
            ? joinability.openToJoinByPlayer
              ? 1
              : 2
            : undefined,
        openToInvites: joinability.invites !== undefined
          ? joinability.invites
            ? 1
            : 2
          : joinability.openToInvites !== undefined
            ? joinability.openToInvites
              ? 1
              : 2
            : undefined,
      };
      log(`      🎮 Joinability settings configured`, 'info', options);
    }

    if (matchmaking !== undefined) {
      entry.gameServerJoinabilitySettings = {
        matchmakingInProgress: matchmaking ? 1 : 2,
      };
      log(`      🔍 Matchmaking: ${matchmaking ? 'enabled' : 'disabled'}`, 'info', options);
    }

    return entry;
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load and apply an experience configuration from a JSON file
 *
 * This function:
 * 1. Loads the JSON configuration from disk
 * 2. Resolves external file references (TypeScript scripts, spatial data)
 * 3. Fetches the current experience from the server
 * 4. Builds the complete update
 * 5. Sends it to the server
 *
 * @param configPath - Path to the JSON configuration file (relative or absolute)
 * @param options - Loading options (sessionId, playElementId, logLevel)
 * @returns Promise that resolves when the experience has been successfully updated
 *
 * @throws Error if configuration is invalid, files cannot be read, or API call fails
 *
 * @example
 * ```typescript
 * import { loadExperienceFromConfig } from 'santiago-playweb-client';
 *
 * // Load and apply configuration
 * await loadExperienceFromConfig('config/my-experience.json', {
 *   sessionId: 'web-your-session-id',
 *   playElementId: '00000000-0000-0000-0000-000000000000',
 *   logLevel: 'verbose',
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With environment variable for session ID
 * process.env.BF_PORTAL_SESSION_ID = 'web-your-session-id';
 * await loadExperienceFromConfig('config/my-experience.json');
 * ```
 */
/**
 * Load an experience from a configuration file path
 */
export async function loadExperienceFromConfig(
  configPath: string,
  options?: LoadExperienceOptions
): Promise<void>;

/**
 * Load an experience from a configuration object
 */
export async function loadExperienceFromConfig(
  config: ExperienceConfig,
  options?: LoadExperienceOptions
): Promise<void>;

/**
 * Load an experience from either a configuration file path or a configuration object.
 * This is the implementation for the overloaded function.
 */
export async function loadExperienceFromConfig(
  configPathOrConfig: string | ExperienceConfig,
  options: LoadExperienceOptions = {}
): Promise<void> {
  const logLevel = options.logLevel || 'normal';
  const opts = { ...options, logLevel };

  log('╔═══════════════════════════════════════════════════════════════╗', 'info', opts);
  log('║  Battlefield Portal Experience Configuration Loader           ║', 'info', opts);
  log('╚═══════════════════════════════════════════════════════════════╝', 'info', opts);

  // Load and parse configuration
  let config: ExperienceConfig;
  let configDir: string;

  if (typeof configPathOrConfig === 'string') {
    // Load from file path
    config = loadConfigFile(configPathOrConfig);
    configDir = path.dirname(path.resolve(configPathOrConfig));
  } else {
    // Use provided config object
    config = configPathOrConfig;
    // Use provided configDir option, or fall back to current working directory
    configDir = options.configDir ? path.resolve(options.configDir) : process.cwd();
  }

  log(`📄 Loaded configuration: ${config.name}`, 'info', opts);
  if (config.description) {
    log(`   ${config.description}`, 'info', opts);
  }

  // Resolve experience ID
  const finalPlayElementId = options.playElementId || config.id || config.experienceId;
  if (!finalPlayElementId) {
    throw new Error(
      'Experience ID must be provided either in the config file (id or experienceId field) or in options.playElementId'
    );
  }

  // Resolve session ID
  const sessionId = options.sessionId || process.env.BF_PORTAL_SESSION_ID;
  if (!sessionId) {
    throw new Error('Session ID must be provided either in options.sessionId or BF_PORTAL_SESSION_ID environment variable');
  }

  // Initialize client
  const client = new SantiagoWebPlayClient({ sessionId });

  try {
    // Fetch blueprint for mutator and asset category ID resolution
    let availableMutators: Map<string, any> | null = null;
    let availableAssetCategories: Map<string, string> | null = null;
    try {
      availableMutators = await client.listAvailableMutators();
      availableAssetCategories = await client.listAvailableAssetCategories();
    } catch (error) {
      log(`⚠️  Could not fetch blueprint for mutator and asset category resolution: ${error instanceof Error ? error.message : String(error)}`, 'warn', opts);
    }

    // Fetch current experience
    log(`\n🔄 Fetching current experience (${finalPlayElementId})...`, 'info', opts);
    const current = await client.getPlayElementDecoded({
      id: finalPlayElementId,
      includeDenied: true,
    });

    log(`   Current name: ${current.playElement?.name || '<unnamed>'}`, 'info', opts);

    // Create modifier
    const modifier = new PlayElementModifier(current);

    // Update basic properties
    log(`\n✏️  Updating experience properties:`, 'info', opts);
    log(`   Name: ${config.name}`, 'info', opts);
    modifier.setName(config.name);

    if (config.description) {
      log(`   Description: ${config.description}`, 'info', opts);
      modifier.setDescription(config.description);
    }

    // Update publish state
    const publishState = normalizePublishState(config.published, config.publishState);
    log(`   Publish state: ${publishState === PublishState.PUBLISHED ? 'PUBLISHED' : 'DRAFT'}`, 'info', opts);
    modifier.setPublishState(publishState);

    // Load and set TypeScript code
    const typeScriptCode = loadTypeScriptCode(config.script, configDir);
    log(`   TypeScript code: ${typeScriptCode.split('\n').length} lines`, 'info', opts);
    modifier.setTypeScriptCode(typeScriptCode);

    // Load and set localization strings if provided
    const strings = loadStringsData(config.strings, configDir);
    if (strings) {
      modifier.setStrings(strings);
      const stringsLabel = typeof strings === 'string' ? 'JSON string' : 'object with locales';
      log(`   Localization strings: ${stringsLabel}`, 'info', opts);
    }

    // Build map rotation
    const maps = buildMapRotation(config.maps, configDir, opts, availableMutators || undefined);
    const rotationBehavior = normalizeRotationBehavior(config.rotation || config.rotationBehavior);
    const rotationName = ['LOOP', 'EORMM', 'ONE_MAP'][rotationBehavior] || 'LOOP';
    log(`   Rotation behavior: ${rotationName}`, 'info', opts);

    // Apply map rotation
    modifier.clearSpatialAttachments();
    modifier.setMapRotation(maps, rotationBehavior);

    // Build the update
    const updateData = modifier.build();

    // Apply global rules if specified
    if (config.globalRules && config.globalRules.length > 0) {
      log(`\n⚙️  Applying global rules:`, 'info', opts);
      const globalMutators = config.globalRules
        .map(rule => buildMutator(rule, availableMutators || undefined))
        .filter((m): m is Mutator => m !== null && m !== undefined);

      if (!updateData.playElementDesign) {
        updateData.playElementDesign = {};
      }

      if (!updateData.playElementDesign.mutators) {
        updateData.playElementDesign.mutators = [];
      }

      // Replace or add global mutators (these apply to entire experience, not per-map)
      // Instead of just pushing, we need to replace existing mutators with the same name
      // and preserve their IDs from the server
      for (const newMutator of globalMutators) {
        const existingIndex = updateData.playElementDesign.mutators.findIndex(
          m => m.name === newMutator.name
        );
        if (existingIndex >= 0) {
          // Replace existing mutator with same name, but preserve the ID from the server
          const existingMutator = updateData.playElementDesign.mutators[existingIndex];
          newMutator.id = existingMutator.id;
          updateData.playElementDesign.mutators[existingIndex] = newMutator;
        } else {
          // Add new mutator (it won't have an ID, which is OK for new mutators)
          updateData.playElementDesign.mutators.push(newMutator);
        }
      }
      log(`   Applied ${globalMutators.length} global rule(s)`, 'info', opts);
    }

    // Apply asset restrictions if specified
    if (config.restrictions && config.restrictions.length > 0) {
      log(`\n🚫 Applying asset restrictions:`, 'info', opts);

      if (!updateData.playElementDesign) {
        updateData.playElementDesign = {};
      }

      updateData.playElementDesign.assetCategories = config.restrictions
        .map(restriction => convertAssetRestrictionToCategory(restriction, availableAssetCategories || undefined))
        .filter((c): c is any => c !== null);

      log(`   Applied ${updateData.playElementDesign.assetCategories.length} restriction(s)`, 'info', opts);
    }

    // Send update
    log(`\n📤 Sending update to server...`, 'info', opts);
    const updated = await client.updatePlayElement({
      id: finalPlayElementId,
      ...updateData,
      current, // Pass the current state to avoid re-fetching
    });

    // Display results
    log('\n✅ Experience updated successfully!', 'info', opts);
    log('\n📊 Summary:', 'info', opts);
    log(`   Name: ${updated.playElement?.name}`, 'info', opts);
    const publishStateType = updated.playElement?.publishStateType === 2 ? 'PUBLISHED' : 'DRAFT';
    log(`   Publish state: ${publishStateType}`, 'info', opts);
    log(`   Maps in rotation: ${updated.playElementDesign?.mapRotation?.maps?.length || 0}`, 'info', opts);
    log(`   Total attachments: ${updated.playElementDesign?.attachments?.length || 0}`, 'info', opts);

    // List attachments
    log('\n📦 Attachments:', 'info', opts);
    updated.playElementDesign?.attachments?.forEach((att: any) => {
      const filename = typeof att.filename === 'string' ? att.filename : att.filename?.value || '<unnamed>';
      const type =
        att.attachmentType === 1 ? 'SPATIAL' : att.attachmentType === 2 ? 'SCRIPT' : `TYPE_${att.attachmentType}`;
      log(`   - ${filename} (${type})`, 'info', opts);
    });

    log('\n🌐 View in portal:', 'info', opts);
    log(`   https://portal.battlefield.com/bf6/experience/rules?playgroundId=${finalPlayElementId}`, 'info', opts);
  } catch (error) {
    log(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`, 'error', opts);
    throw error;
  }
}

/**
 * Validate an experience configuration without applying it
 *
 * @param configPath - Path to the JSON configuration file
 * @returns Object containing validation results
 *
 * @example
 * ```typescript
 * const result = validateExperienceConfig('config/my-experience.json');
 * console.log(result.isValid, result.errors);
 * ```
 */
export function validateExperienceConfig(
  configPath: string
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const config = loadConfigFile(configPath);
    const configDir = path.dirname(path.resolve(configPath));

    // Check required fields
    if (!config.name) {
      errors.push('Missing required field: name');
    }

    if (!config.id && !config.experienceId) {
      warnings.push('No experience ID in config (must be provided as option)');
    }

    if (!config.maps || config.maps.length === 0) {
      errors.push('At least one map is required');
    }

    // Check map configurations
    config.maps.forEach((map, index) => {
      if (!map.map && !map.levelName) {
        errors.push(`Map ${index + 1}: Missing map name`);
      }
    });

    // Check file references
    if (config.script?.file) {
      const scriptPath = path.isAbsolute(config.script.file)
        ? config.script.file
        : path.resolve(configDir, config.script.file);
      if (!fs.existsSync(scriptPath)) {
        errors.push(`Script file not found: ${config.script.file}`);
      }
    }

    config.maps.forEach((map, index) => {
      if (map.spatial?.file || map.spatialData?.file) {
        const filePath = (map.spatial?.file || map.spatialData?.file)!;
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath);
        if (!fs.existsSync(resolvedPath)) {
          errors.push(`Map ${index + 1}: Spatial file not found: ${filePath}`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}

// ============================================================================
// Download/Import Functions
// ============================================================================

/**
 * Options for downloading an experience as JSON configuration
 */
export interface DownloadExperienceOptions {
  /** Session ID for authentication */
  sessionId: string;
  /** Console logging level: 'verbose', 'normal', or 'silent' */
  logLevel?: 'verbose' | 'normal' | 'silent';
  /** Directory to save attachment files (optional) */
  attachmentsDir?: string;
  /** Whether to download attachments (default: true if attachmentsDir is specified) */
  downloadAttachments?: boolean;
}

/**
 * Convert a mutator to RuleConfig format
 */
function convertMutatorToRule(mutator: Mutator): RuleConfig | null {
  if (!mutator.name || !mutator.kind) {
    return null;
  }

  // Handle sparse/per-team mutators
  if (mutator.kind.mutatorSparseBoolean) {
    const sparse = mutator.kind.mutatorSparseBoolean;
    const perTeamValues: boolean[] = [];

    // Build per-team values from sparse array
    if (sparse.sparseValues) {
      sparse.sparseValues.forEach(sv => {
        if (sv.index !== undefined && sv.value !== undefined) {
          // sparseValues indices are 1-based, convert to 0-based for array
          perTeamValues[sv.index - 1] = sv.value;
        }
      });
    }

    // If no sparse values, use default
    if (perTeamValues.length === 0 && sparse.defaultValue !== undefined) {
      return {
        name: mutator.name,
        value: sparse.defaultValue,
        category: mutator.category,
      } as GlobalRuleConfig;
    }

    // Fill gaps with default value
    if (sparse.defaultValue !== undefined) {
      for (let i = 0; i < perTeamValues.length; i++) {
        if (perTeamValues[i] === undefined) {
          perTeamValues[i] = sparse.defaultValue;
        }
      }
    }

    return {
      name: mutator.name,
      perTeamValues,
      defaultValue: sparse.defaultValue,
      category: mutator.category,
    } as SparseRuleConfig;
  }

  if (mutator.kind.mutatorSparseInt) {
    const sparse = mutator.kind.mutatorSparseInt;
    const perTeamValues: number[] = [];

    if (sparse.sparseValues) {
      sparse.sparseValues.forEach(sv => {
        if (sv.index !== undefined && sv.value !== undefined) {
          perTeamValues[sv.index - 1] = sv.value;
        }
      });
    }

    if (perTeamValues.length === 0 && sparse.defaultValue !== undefined) {
      return {
        name: mutator.name,
        value: sparse.defaultValue,
        category: mutator.category,
      } as GlobalRuleConfig;
    }

    if (sparse.defaultValue !== undefined) {
      for (let i = 0; i < perTeamValues.length; i++) {
        if (perTeamValues[i] === undefined) {
          perTeamValues[i] = sparse.defaultValue;
        }
      }
    }

    return {
      name: mutator.name,
      perTeamValues,
      defaultValue: sparse.defaultValue,
      category: mutator.category,
    } as SparseRuleConfig;
  }

  if (mutator.kind.mutatorSparseFloat) {
    const sparse = mutator.kind.mutatorSparseFloat;
    const perTeamValues: number[] = [];

    if (sparse.sparseValues) {
      sparse.sparseValues.forEach(sv => {
        if (sv.index !== undefined && sv.value !== undefined) {
          perTeamValues[sv.index - 1] = sv.value;
        }
      });
    }

    if (perTeamValues.length === 0 && sparse.defaultValue !== undefined) {
      return {
        name: mutator.name,
        value: sparse.defaultValue,
        category: mutator.category,
      } as GlobalRuleConfig;
    }

    if (sparse.defaultValue !== undefined) {
      for (let i = 0; i < perTeamValues.length; i++) {
        if (perTeamValues[i] === undefined) {
          perTeamValues[i] = sparse.defaultValue;
        }
      }
    }

    return {
      name: mutator.name,
      perTeamValues,
      defaultValue: sparse.defaultValue,
      category: mutator.category,
    } as SparseRuleConfig;
  }

  // Handle global mutators
  if (mutator.kind.mutatorBoolean) {
    return {
      name: mutator.name,
      value: mutator.kind.mutatorBoolean.value ?? false,
      category: mutator.category,
    } as GlobalRuleConfig;
  }

  if (mutator.kind.mutatorInt) {
    return {
      name: mutator.name,
      value: mutator.kind.mutatorInt.value ?? 0,
      category: mutator.category,
    } as GlobalRuleConfig;
  }

  if (mutator.kind.mutatorFloat) {
    return {
      name: mutator.name,
      value: mutator.kind.mutatorFloat.value ?? 0,
      category: mutator.category,
    } as GlobalRuleConfig;
  }

  if (mutator.kind.mutatorString) {
    return {
      name: mutator.name,
      value: mutator.kind.mutatorString.value ?? '',
      category: mutator.category,
    } as GlobalRuleConfig;
  }

  return null;
}

/**
 * Download a play experience from the server as JSON configuration
 *
 * This function fetches a play experience from the server and converts it to the
 * JSON configuration format that can be used with `loadExperienceFromConfig()`.
 * This allows you to download an experience, edit it locally, and then import it back.
 *
 * @param playElementId - The play element ID to download
 * @param options - Download options (sessionId, logLevel)
 * @returns The experience configuration as a JSON-serializable object
 *
 * @throws Error if the play element cannot be fetched or is invalid
 *
 * @example
 * ```typescript
 * import { downloadExperienceAsJSON } from 'santiago-playweb-client';
 * import fs from 'fs';
 *
 * // Download an experience from the server
 * const config = await downloadExperienceAsJSON('00000000-0000-0000-0000-000000000000', {
 *   sessionId: 'web-your-session-id',
 *   logLevel: 'verbose',
 * });
 *
 * // Save to file for local editing
 * fs.writeFileSync('my-experience.json', JSON.stringify(config, null, 2));
 *
 * // Later, import it back to the server
 * await loadExperienceFromConfig('my-experience.json', { sessionId: '...' });
 * ```
 */
export async function downloadExperienceAsJSON(
  playElementId: string,
  options: DownloadExperienceOptions
): Promise<ExperienceConfig> {
  const logLevel = options.logLevel || 'normal';
  const opts = { ...options, logLevel };

  log('🔄 Fetching experience...', 'info', opts);

  const client = new SantiagoWebPlayClient({ sessionId: options.sessionId });

  try {
    const response = await client.getPlayElementDecoded({
      id: playElementId,
      includeDenied: true,
    });

    if (!response.playElement) {
      throw new Error('Play element not found or is not accessible');
    }

    const playElement = response.playElement;
    const design = response.playElementDesign;

    log(`✓ Fetched: ${playElement.name}`, 'info', opts);

    // Extract basic properties
    const config: ExperienceConfig = {
      id: playElement.id,
      name: playElement.name || 'Unnamed Experience',
      published: playElement.publishStateType === PublishState.PUBLISHED,
      maps: [],
    };

    // Add description if present
    if (playElement.description) {
      const desc = typeof playElement.description === 'string'
        ? playElement.description
        : (playElement.description as any).value;
      if (desc) {
        config.description = desc;
      }
    }

    // Extract rotation behavior
    if (design?.mapRotation?.attributes?.rotationBehavior !== undefined) {
      const behavior = design.mapRotation.attributes.rotationBehavior;
      switch (behavior) {
        case RotationBehavior.EORMM:
          config.rotation = 'loop'; // Default to loop for export
          break;
        case RotationBehavior.ONE_MAP:
          config.rotation = 'once';
          break;
        case RotationBehavior.LOOP:
        default:
          config.rotation = 'loop';
      }
    }

    // Extract maps
    if (design?.mapRotation?.maps) {
      log(`\n🗺️  Exporting ${design.mapRotation.maps.length} map(s):`, 'info', opts);

      for (let mapIndex = 0; mapIndex < design.mapRotation.maps.length; mapIndex++) {
        const mapEntry = design.mapRotation.maps[mapIndex];
        const mapConfig: MapConfig = {
          map: mapEntry.levelName,
          rounds: mapEntry.rounds || 1,
          spectators: mapEntry.allowedSpectators || 4,
        };

        // Extract team sizes
        if (mapEntry.teamComposition) {
          const tc = mapEntry.teamComposition;
          if (tc.teams && tc.teams.length > 0) {
            mapConfig.teams = tc.teams.map(t => t.capacity);

            // Determine balancing method
            if (tc.balancingMethod === BalancingMethod.SKILL) {
              mapConfig.balancing = 'skill';
            } else if (tc.balancingMethod === BalancingMethod.SQUAD) {
              mapConfig.balancing = 'squad';
            } else if (tc.balancingMethod === BalancingMethod.NONE) {
              mapConfig.balancing = 'none';
            }
          }

          // Extract bots
          if (tc.internalTeams && tc.internalTeams.length > 0) {
            mapConfig.bots = tc.internalTeams
              .filter(team => team.capacity && team.capacity > 0)
              .map(team => ({
                team: team.teamId,
                count: team.capacity,
                type: team.capacityType === 2 ? ('fixed' as const) : ('fill' as const),
              }));
          }
        }

        // Extract rules/mutators
        if (mapEntry.mutators && mapEntry.mutators.length > 0) {
          mapConfig.rules = mapEntry.mutators
            .map(m => convertMutatorToRule(m))
            .filter((r): r is RuleConfig => r !== null);
          log(`   Map ${mapIndex + 1}: ${mapConfig.rules.length} rules`, 'info', opts);
        }

        // Extract joinability settings
        if (mapEntry.blazeGameSettings) {
          const settings = mapEntry.blazeGameSettings;
          mapConfig.joinability = {};
          if (settings.joinInProgress !== undefined) {
            mapConfig.joinability.joinInProgress = settings.joinInProgress === 1;
          }
          if (settings.openToJoinByPlayer !== undefined) {
            mapConfig.joinability.openJoin = settings.openToJoinByPlayer === 1;
          }
          if (settings.openToInvites !== undefined) {
            mapConfig.joinability.invites = settings.openToInvites === 1;
          }
        }

        // Extract matchmaking settings
        if (mapEntry.gameServerJoinabilitySettings?.matchmakingInProgress !== undefined) {
          mapConfig.matchmaking = mapEntry.gameServerJoinabilitySettings.matchmakingInProgress === 1;
        }

        config.maps.push(mapConfig);
      }
    }

    // Extract script from attachments and optionally save all attachments to disk
    if (design?.attachments && design.attachments.length > 0) {
      log(`\n📦 Exporting attachments...`, 'info', opts);

      const shouldDownloadAttachments = opts.downloadAttachments || (opts.attachmentsDir !== undefined);
      const attachmentRefs: AttachmentReference[] = [];

      for (const attachment of design.attachments) {
        // Convert attachment type to number for comparison
        const attType = typeof attachment.attachmentType === 'string'
          ? parseInt(attachment.attachmentType, 10)
          : (attachment.attachmentType as number);
        let filename = '';
        let content: string | Buffer | undefined;

        // Determine filename based on attachment type
        if (attType === 2) { // SCRIPT
          filename = 'Script.ts';
          if (attachment.content) {
            content = typeof attachment.content === 'string'
              ? attachment.content
              : (attachment.content as any).value;
          }
        } else if (attType === 1) { // SPATIAL
          // Extract map index from metadata if available
          const metadata = (attachment.metadata as any)?.value;
          const mapIdx = metadata?.match(/mapIdx=(\d+)/)?.[1] || 'spatial';
          filename = `spatial-${mapIdx}.json`;
          if (attachment.content) {
            content = typeof attachment.content === 'string'
              ? attachment.content
              : JSON.stringify((attachment.content as any));
          }
        } else if (attType === 4) { // STRINGS
          filename = 'Strings.json';
          if (attachment.content) {
            content = typeof attachment.content === 'string'
              ? attachment.content
              : JSON.stringify((attachment.content as any));
          }
        } else if (attType === 5) { // MP_DATA
          filename = 'mp-data.json';
          if (attachment.content) {
            content = typeof attachment.content === 'string'
              ? attachment.content
              : JSON.stringify((attachment.content as any));
          }
        }

        // Save to disk if requested
        if (shouldDownloadAttachments && opts.attachmentsDir && filename && content) {
          try {
            const filepath = path.join(opts.attachmentsDir, filename);
            if (typeof content === 'string') {
              fs.writeFileSync(filepath, content, 'utf8');
            } else {
              fs.writeFileSync(filepath, content);
            }
            log(`   Saved: ${filename}`, 'info', opts);

            // Add reference to config
            attachmentRefs.push({
              type: attType || 0,
              file: filename,
              name: filename,
              metadata: (attachment.metadata as any)?.value,
            });
          } catch (err) {
            log(`   ⚠️  Failed to save ${filename}: ${err instanceof Error ? err.message : String(err)}`, 'warn', opts);
          }
        }

        // For SCRIPT type, also extract to config.script for backward compatibility
        if (attType === 2 && content && typeof content === 'string') {
          config.script = { code: content };
          log(`   Extracted TypeScript script (${content.split('\n').length} lines)`, 'info', opts);
        }

        // For STRINGS type, also extract to config.strings for convenient access
        if (attType === 4 && content && typeof content === 'string') {
          try {
            const stringsData = JSON.parse(content);
            config.strings = { data: stringsData };
            log(`   Extracted localization strings`, 'info', opts);
          } catch (err) {
            log(`   ⚠️  Failed to parse strings JSON: ${err instanceof Error ? err.message : String(err)}`, 'warn', opts);
          }
        }
      }

      if (attachmentRefs.length > 0) {
        config.attachments = attachmentRefs;
        log(`   Exported ${attachmentRefs.length} attachment reference(s)`, 'info', opts);
      }
    }

    // Extract global mutators (experience-level rules)
    if (design?.mutators && design.mutators.length > 0) {
      log(`\n⚙️  Exporting global rules...`, 'info', opts);
      const globalRules = design.mutators
        .map(m => convertMutatorToRule(m))
        .filter((r): r is RuleConfig => r !== null);

      if (globalRules.length > 0) {
        config.globalRules = globalRules;
        log(`   Exported ${globalRules.length} global rule(s)`, 'info', opts);
      }
    }

    // Extract asset restrictions
    if (design?.assetCategories && design.assetCategories.length > 0) {
      log(`\n🚫 Exporting asset restrictions...`, 'info', opts);
      const restrictions = design.assetCategories
        .map((cat: any) => convertAssetCategoryToRestriction(cat, true))
        .filter((r): r is AssetRestriction => r !== null);

      if (restrictions.length > 0) {
        config.restrictions = restrictions;
        log(`   Exported ${restrictions.length} restriction(s)`, 'info', opts);
        log(`\n💡 Tip: Check console logs for unmapped asset category UUIDs`, 'info', opts);
        log(`   Add them to ASSET_CATEGORY_UUID_MAP to get readable names in exported JSON`, 'info', opts);
      }
    }

    log('\n✅ Experience exported successfully!', 'info', opts);
    return config;
  } catch (error) {
    log(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`, 'error', opts);
    throw error;
  }
}
