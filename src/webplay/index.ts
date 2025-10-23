/**
 * Santiago Portal Client
 *
 * A TypeScript client library for interacting with the Santiago WebPlay service via gRPC-Web.
 *
 * @example
 * ```typescript
 * import { SantiagoWebPlayClient, PlayElementModifier } from 'santiago-playweb-client';
 *
 * const client = new SantiagoWebPlayClient({
 *   sessionId: 'your-session-id',
 *   // host and tenancy default to DICE production values; override if needed
 * });
 *
 * // Simple script update
 * await client.updatePlayElementScript({
 *   id: 'element-id',
 *   script: 'console.log("Hello");',
 *   includeDenied: false,
 * });
 *
 * // Multiple changes with modifier
 * const current = await client.getPlayElementDecoded({ id: 'element-id' });
 * const modified = new PlayElementModifier(current)
 *   .setName('New Name')
 *   .setScript('console.log("Updated");')
 *   .setStrings({ "0": "Hello", "1": "World" })
 *   .build();
 * await client.updatePlayElement({ id: 'element-id', ...modified });
 * ```
 *
 * @module santiago-playweb-client
 */

// Re-export everything from playweb-client
export {
  SantiagoWebPlayClient,
  PlayElementModifier,
  DEFAULT_SANTIAGO_HOST,
  DEFAULT_SANTIAGO_TENANCY,
  encodeGetPlayElementRequest,
  type GrpcWebClientConfig,
  type StringValue,
  type AttachmentData,
  type Attachment,
  type ModRules,
  type PlayElementDesign,
  type PlayElement,
  type PlayElementResponse,
  type GetPlayElementRequest,
  type UpdatePlayElementOptions,
  type UpdatePlayElementScriptOptions,
  // Enums
  AttachmentType,
  ProcessingStatus,
  PublishState,
  ModerationState,
  AttachmentCompileStatus,
  BalancingMethod,
  RotationBehavior,
  // Map rotation types and helpers
  MapRotationBuilder,
  createTeams,
  mutator,
  sparseMutator,
  Mutators,
  MutatorCategories,
  type Team,
  type InternalTeam,
  type TeamComposition,
  type MapEntry,
  type MapRotationConfig,
  type Mutator,
  type MutatorKind,
  type BlazeGameSettings,
  type GameServerJoinabilitySettings,
} from './playweb-client.js';

// Re-export response decoder utilities
export {
  decodePlayElementResponse,
  summarizePlayElementResponse,
  extractScript,
  hasCompilationErrors,
  getCompilationErrors,
} from './response-decoder.js';

// Re-export experience loader utilities
export {
  loadExperienceFromConfig,
  validateExperienceConfig,
  downloadExperienceAsJSON,
  AssetCategoryType,
  ASSET_CATEGORY_UUID_MAP,
  ASSET_CATEGORY_NAME_TO_UUID,
  type AttachmentReference,
  type ExperienceConfig,
  type MapConfig,
  type BotConfig,
  type RuleConfig,
  type GlobalRuleConfig,
  type SparseRuleConfig,
  type JoinabilityConfig,
  type ScriptConfig,
  type StringsConfig,
  type SpatialConfig,
  type AssetRestriction,
  type LoadExperienceOptions,
  type DownloadExperienceOptions,
} from './experience-loader.js';
