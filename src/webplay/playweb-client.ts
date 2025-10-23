import * as path from 'path';
import protobufjs from 'protobufjs';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Binary writer for protobuf encoding
class BinaryWriter {
  private buffer: number[] = [];

  uint32(value: number): this {
    // Write varint encoded uint32
    while (value > 0x7f) {
      this.buffer.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    this.buffer.push(value);
    return this;
  }

  string(value: string): this {
    const utf8 = new TextEncoder().encode(value);
    this.uint32(utf8.length);
    this.buffer.push(...Array.from(utf8));
    return this;
  }

  bool(value: boolean): this {
    this.buffer.push(value ? 1 : 0);
    return this;
  }

  finish(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

const PROTO_PATH = path.resolve(__dirname, '../../../battlefield_portal.proto');
let protoRootPromise: Promise<protobufjs.Root> | null = null;

const PLAY_ELEMENT_TO_OBJECT_OPTIONS: protobufjs.IConversionOptions = {
  longs: String,
  enums: Number,
  defaults: true,
  arrays: true,
  objects: true,
  oneofs: true,
};

async function loadProtoRoot(): Promise<protobufjs.Root> {
  if (!protoRootPromise) {
    protoRootPromise = protobufjs.load(PROTO_PATH);
  }
  return protoRootPromise;
}

function encodeGrpcWebFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0; // payload is uncompressed
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}

function unwrapGrpcWebMessage(data: Uint8Array, headers?: Headers): Uint8Array {
  if (data.length < 5) {
    if (data.length === 0) {
      // Check if there are gRPC trailers in HTTP headers (valid for responses with no message body)
      if (headers) {
        const grpcStatus = headers.get('grpc-status');
        const grpcMessage = headers.get('grpc-message');

        if (grpcStatus) {
          if (grpcStatus !== '0') {
            throw new Error(`gRPC error ${grpcStatus}: ${grpcMessage || 'Unknown error'}`);
          }
          // grpc-status: 0 means success, return empty message
          return new Uint8Array(0);
        }
      }

      throw new Error('Invalid gRPC-Web response: empty response (0 bytes). This usually indicates an authentication failure - check your session ID.');
    }
    throw new Error(`Invalid gRPC-Web response: too short (got ${data.length} bytes, need at least 5)`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const compressed = data[0];
  if (compressed !== 0) {
    throw new Error('Compressed gRPC-Web payloads are not supported');
  }

  const messageLength = view.getUint32(1, false);
  if (data.length < 5 + messageLength) {
    throw new Error('Invalid gRPC-Web response: message length exceeds payload');
  }

  const message = data.slice(5, 5 + messageLength);
  const trailerStart = 5 + messageLength;

  if (trailerStart < data.length) {
    const trailerFlag = data[trailerStart];
    if (trailerFlag === 0x80) {
      if (data.length < trailerStart + 5) {
        throw new Error('Invalid gRPC-Web response: truncated trailer frame');
      }
      const trailerLength = view.getUint32(trailerStart + 1, false);
      const trailerEnd = trailerStart + 5 + trailerLength;
      if (trailerEnd > data.length) {
        throw new Error('Invalid gRPC-Web response: incomplete trailers');
      }
      const trailerData = data.slice(trailerStart + 5, trailerEnd);
      const trailerText = new TextDecoder().decode(trailerData);
      const statusMatch = trailerText.match(/grpc-status:\s*(\d+)/);
      if (statusMatch && statusMatch[1] !== '0') {
        const messageMatch = trailerText.match(/grpc-message:\s*([^\r\n]+)/);
        throw new Error(`gRPC error ${statusMatch[1]}: ${messageMatch ? messageMatch[1] : 'Unknown error'}`);
      }
    }
  }

  return message;
}

function cloneStringValue(value: unknown): { value: string } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as { value?: unknown };
  if (typeof candidate.value === 'string') {
    return { value: candidate.value };
  }

  return undefined;
}

/**
 * Recursively convert all Buffer-like objects to Uint8Array for protobuf compatibility
 */
function ensureUint8Arrays(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Check for Buffer or Uint8Array - need to check Buffer first (Node.js specific)
  if (Buffer.isBuffer(obj)) {
    // Convert Buffer to Uint8Array
    return new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength);
  }

  if (obj instanceof Uint8Array) {
    return obj;
  }

  // If it's an array-like object with byteLength, try to convert it
  if (obj && typeof obj === 'object' && 'length' in obj && 'byteLength' in obj) {
    try {
      return new Uint8Array(obj as ArrayLike<number>);
    } catch (e) {
      // If conversion fails, fall through to object handling
    }
  }

  // If it's a plain object or array, recurse into it
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(item => ensureUint8Arrays(item));
    }

    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = ensureUint8Arrays(obj[key]);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Deep clone function that preserves Buffers and Uint8Arrays
 */
function deepClone(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Preserve Buffer and Uint8Array
  if (Buffer.isBuffer(obj)) {
    return Buffer.from(obj);
  }

  if (obj instanceof Uint8Array) {
    return new Uint8Array(obj);
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }

  // Handle plain objects
  if (typeof obj === 'object') {
    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  // Primitive types
  return obj;
}

/**
 * Helper class to simplify modifying play elements with a fluent API
 */
class PlayElementModifier {
  private response: PlayElementResponse;

  constructor(response: PlayElementResponse) {
    // Deep clone to avoid modifying the original (preserves Buffers/Uint8Arrays)
    this.response = deepClone(response);
  }

  /**
   * Set the name of the play element
   */
  setName(name: string): this {
    if (!this.response.playElement) {
      this.response.playElement = {};
    }
    this.response.playElement.name = name;
    return this;
  }

  /**
   * Set the description of the play element
   */
  setDescription(description: string): this {
    if (!this.response.playElement) {
      this.response.playElement = {};
    }
    this.response.playElement.description = { value: description };
    return this;
  }

  /**
   * Set the script content (finds and updates the Type 1 SPATIAL attachment)
   * Note: Type 1 attachments contain JSON format spatial data, not executable code
   */
  setScript(script: string): this {
    if (!this.response.playElementDesign) {
      throw new Error('PlayElementDesign is missing from response');
    }

    const attachments = this.response.playElementDesign.attachments ?? [];
    const scriptAttachment = attachments.find(
      att => att.attachmentType === 'ATTACHMENT_TYPE_SPATIAL' || att.attachmentType === AttachmentType.SPATIAL
    );

    if (!scriptAttachment) {
      throw new Error('Spatial attachment not found on the play element');
    }

    if (!scriptAttachment.attachmentData) {
      scriptAttachment.attachmentData = {};
    }

    // Update the original content
    scriptAttachment.attachmentData.original = Buffer.from(script, 'utf8');

    // CRITICAL: Remove compiled data entirely to force server recompilation
    // The web UI completely omits the compiled field for updated attachments
    delete scriptAttachment.attachmentData.compiled;

    // Set processing status to PENDING to trigger recompilation
    scriptAttachment.processingStatus = ProcessingStatus.PENDING;

    return this;
  }

  /**
   * Set the TypeScript/JavaScript code (finds and updates the Type 2 SCRIPT attachment)
   * Automatically detects the existing TypeScript file, preferring 'Script.ts' (the web UI default)
   *
   * @param code - The TypeScript/JavaScript code content
   */
  setTypeScriptCode(code: string): this {
    if (!this.response.playElementDesign) {
      throw new Error('PlayElementDesign is missing from response');
    }

    const attachments = this.response.playElementDesign.attachments ?? [];

    // Find all TypeScript attachments (Type 2, ends with .ts)
    const tsAttachments = attachments.filter(att => {
      const attType = att.attachmentType === 'ATTACHMENT_TYPE_SCRIPT' || att.attachmentType === AttachmentType.SCRIPT;
      const filenameValue = (att.filename as any)?.value ?? att.filename;
      const isTsFile = typeof filenameValue === 'string' && filenameValue.toLowerCase().endsWith('.ts');
      return attType && isTsFile;
    });

    let spatialAttachment;

    if (tsAttachments.length === 0) {
      throw new Error('No TypeScript attachment (Type 2, .ts file) found on the play element');
    } else if (tsAttachments.length === 1) {
      // Only one TS file, use it
      spatialAttachment = tsAttachments[0];
    } else {
      // Multiple TS files - prefer 'Script.ts' (web UI default)
      spatialAttachment = tsAttachments.find(att => {
        const filenameValue = (att.filename as any)?.value ?? att.filename;
        return filenameValue === 'Script.ts';
      }) ?? tsAttachments[0]; // Fallback to first if Script.ts not found
    }

    if (!spatialAttachment.attachmentData) {
      spatialAttachment.attachmentData = {};
    }

    // Update the original content
    spatialAttachment.attachmentData.original = Buffer.from(code, 'utf8');

    // CRITICAL: Remove compiled data entirely to force server recompilation
    delete spatialAttachment.attachmentData.compiled;

    // Set processing status to PENDING to trigger recompilation
    spatialAttachment.processingStatus = ProcessingStatus.PENDING;

    return this;
  }

  /**
   * Set the thumbnail URL
   */
  setThumbnailUrl(url: string): this {
    if (!this.response.playElement) {
      this.response.playElement = {};
    }
    this.response.playElement.thumbnailUrl = { value: url };
    return this;
  }

  /**
   * Set publish state
   */
  setPublishState(state: number): this {
    if (!this.response.playElement) {
      this.response.playElement = {};
    }
    this.response.playElement.publishStateType = state;
    return this;
  }

  /**
   * Set the map rotation for the play element
   * Automatically creates spatial attachments for maps with spatialData
   *
   * @param maps - Array of map entries with configuration
   * @param rotationBehavior - How the server should cycle through maps (default: LOOP)
   *
   * @example
   * ```typescript
   * // Simple usage with type inference
   * modifier.setMapRotation([
   *   {
   *     levelName: 'MP_Battery',
   *     rounds: 2,
   *     teamComposition: createTeams([32, 32], BalancingMethod.SKILL)
   *   },
   *   {
   *     levelName: 'MP_Dumbo',
   *     rounds: 1
   *   }
   * ], RotationBehavior.LOOP);
   *
   * // With spatial data
   * const rotation = new MapRotationBuilder()
   *   .addMap('MP_Battery', {
   *     rounds: 2,
   *     spatialData: batterySpatialJson,
   *     spatialFilename: 'MP_Battery_BR6.spatial.json'
   *   })
   *   .addMap('MP_Dumbo', {
   *     spatialData: dumboSpatialJson
   *   })
   *   .build();
   * modifier.setMapRotation(rotation.maps, rotation.rotationBehavior);
   * ```
   */
  setMapRotation(maps: MapEntry[], rotationBehavior: RotationBehavior = RotationBehavior.LOOP): this {
    if (!this.response.playElementDesign) {
      throw new Error('PlayElementDesign is missing from response');
    }

    // Set the map rotation configuration (excluding spatial data fields)
    this.response.playElementDesign.mapRotation = {
      maps: maps.map(map => ({
        mutators: map.mutators ?? [],
        levelName: map.levelName,
        levelLocation: map.levelLocation ?? 'ModBuilderCustom0',
        rounds: map.rounds ?? 1,
        allowedSpectators: map.allowedSpectators ?? 4,
        teamComposition: map.teamComposition ?? {
          teams: [
            { teamId: 1, capacity: 16 },
            { teamId: 2, capacity: 16 }
          ],
          internalTeams: [],
          balancingMethod: 0
        },
        blazeGameSettings: map.blazeGameSettings ?? null,
        gameServerJoinabilitySettings: map.gameServerJoinabilitySettings ?? null
      })),
      attributes: {
        rotationBehavior
      }
    };

    // Create spatial attachments for maps that have spatialData
    maps.forEach((map, mapIndex) => {
      if (map.spatialData) {
        const filename = map.spatialFilename ?? `${map.levelName}_map${mapIndex}.spatial.json`;
        this.setSpatialAttachment(mapIndex, map.spatialData, filename);
      }
    });

    return this;
  }

  /**
   * Internal method to add or update a spatial attachment (Type 1) with proper mapIdx metadata
   * Called automatically by setMapRotation when maps have spatialData
   *
   * @param mapIndex - Index in the map rotation this spatial data corresponds to
   * @param spatialData - JSON string or object containing the spatial data
   * @param filename - Filename for the attachment (e.g., 'MP_Battery_BR6.spatial.json')
   */
  private setSpatialAttachment(mapIndex: number, spatialData: string | object, filename: string): this {
    if (!this.response.playElementDesign) {
      throw new Error('PlayElementDesign is missing from response');
    }

    // Ensure attachments array exists
    if (!this.response.playElementDesign.attachments) {
      this.response.playElementDesign.attachments = [];
    }

    // Convert object to JSON string if needed
    const jsonContent = typeof spatialData === 'string' ? spatialData : JSON.stringify(spatialData);

    // Check if an attachment with this mapIdx already exists
    const existingIdx = this.response.playElementDesign.attachments.findIndex((att: any) => {
      return att.metadata?.value === `mapIdx=${mapIndex}` && att.attachmentType === AttachmentType.SPATIAL;
    });

    // Build attachment data - generate UUID for new attachments
    const attachmentData: any = {
      filename: { value: filename },
      isProcessable: true,
      processingStatus: ProcessingStatus.PENDING,
      attachmentData: {
        original: Buffer.from(jsonContent, 'utf8')
      },
      attachmentType: AttachmentType.SPATIAL,
      metadata: { value: `mapIdx=${mapIndex}` },
      errors: []
    };

    if (existingIdx >= 0) {
      // Update existing attachment - preserve id and version
      attachmentData.id = (this.response.playElementDesign.attachments[existingIdx] as any).id;
      attachmentData.version = (this.response.playElementDesign.attachments[existingIdx] as any).version;
      this.response.playElementDesign.attachments[existingIdx] = attachmentData;
    } else {
      // Add new attachment - generate client-side UUID and version
      attachmentData.id = crypto.randomUUID();
      attachmentData.version = '1'; // Start with version 1 for new attachments
      this.response.playElementDesign.attachments.push(attachmentData);
    }

    return this;
  }

  /**
   * Remove all spatial attachments (Type 1) to start fresh
   *
   * Useful when you want to completely rebuild the map rotation and its spatial data.
   * Call this before setMapRotation to ensure old spatial attachments are removed.
   *
   * Note: This preserves TypeScript script attachments (Type 2) and other attachment types
   *
   * @example
   * ```typescript
   * modifier
   *   .clearSpatialAttachments()  // Remove all existing spatial data
   *   .setMapRotation([...]);      // Set new rotation with spatial data
   * ```
   */
  clearSpatialAttachments(): this {
    if (!this.response.playElementDesign) {
      throw new Error('PlayElementDesign is missing from response');
    }

    if (this.response.playElementDesign.attachments) {
      this.response.playElementDesign.attachments = this.response.playElementDesign.attachments.filter(
        (att: any) => att.attachmentType !== AttachmentType.SPATIAL
      );
    }

    return this;
  }

  /**
   * Set the strings/localization data (finds or creates a Type 4 STRINGS attachment)
   *
   * Strings are stored as JSON with localization strings for UI text and translations.
   * Unlike Type 1 and Type 2 attachments, Type 4 strings are not compiled - they're used as-is.
   *
   * @param strings - The JSON string or object containing localization strings
   * @param filename - Optional filename for the attachment (default: 'Strings.json')
   *
   * @example
   * ```typescript
   * // Simple usage with JSON object
   * modifier.setStrings({
   *   "en": { "title": "My Experience" },
   *   "es": { "title": "Mi Experiencia" }
   * });
   *
   * // Or with JSON string
   * modifier.setStrings(JSON.stringify({ "0": "Message", "1": "Another message" }));
   * ```
   */
  setStrings(strings: string | object, filename: string = 'Strings.json'): this {
    if (!this.response.playElementDesign) {
      throw new Error('PlayElementDesign is missing from response');
    }

    // Ensure attachments array exists
    if (!this.response.playElementDesign.attachments) {
      this.response.playElementDesign.attachments = [];
    }

    // Convert object to JSON string if needed
    const jsonContent = typeof strings === 'string' ? strings : JSON.stringify(strings);

    // Validate that it's valid JSON
    try {
      JSON.parse(jsonContent);
    } catch (e) {
      throw new Error(`Strings.json content must be valid JSON: ${(e as Error).message}`);
    }

    // Find existing Type 4 STRINGS attachment
    const existingIdx = this.response.playElementDesign.attachments.findIndex(
      (att: any) => att.attachmentType === AttachmentType.STRINGS || att.attachmentType === 'ATTACHMENT_TYPE_STRINGS'
    );

    // Build attachment data
    const attachmentData: any = {
      filename: { value: filename },
      isProcessable: true,
      processingStatus: ProcessingStatus.PROCESSED, // Strings are not compiled, so use PROCESSED
      attachmentData: {
        original: Buffer.from(jsonContent, 'utf8')
      },
      attachmentType: AttachmentType.STRINGS,
      errors: []
    };

    if (existingIdx >= 0) {
      // Update existing attachment - preserve id and version
      attachmentData.id = (this.response.playElementDesign.attachments[existingIdx] as any).id;
      attachmentData.version = (this.response.playElementDesign.attachments[existingIdx] as any).version;
      this.response.playElementDesign.attachments[existingIdx] = attachmentData;
    } else {
      // Add new attachment - generate client-side UUID and version
      attachmentData.id = crypto.randomUUID();
      attachmentData.version = '1'; // Start with version 1 for new attachments
      this.response.playElementDesign.attachments.push(attachmentData);
    }

    return this;
  }

  /**
   * Direct access to the response for custom modifications
   */
  getResponse(): PlayElementResponse {
    return this.response;
  }

  /**
   * Get the modified play element and design for updating
   */
  build(): { playElement: PlayElement; playElementDesign: PlayElementDesign } {
    if (!this.response.playElement || !this.response.playElementDesign) {
      throw new Error('Response is missing required playElement or playElementDesign');
    }

    return {
      playElement: this.response.playElement,
      playElementDesign: this.response.playElementDesign,
    };
  }
}

// GetPlayElementRequest message encoder (from grpcfunctions.js)
export interface GetPlayElementRequest {
  id: string;
  includeDenied?: boolean;
}

export interface UpdatePlayElementScriptOptions {
  id: string;
  script: string;
  includeDenied?: boolean;
}

// ============================================================================
// Enums
// ============================================================================

/**
 * Attachment type enum - identifies the type of attachment
 */
export enum AttachmentType {
  UNSPECIFIED = 0,
  /** JSON document representing spatial data of 3D objects in a level */
  SPATIAL = 1,
  /** TypeScript source files (e.g., Script.ts, output.ts) */
  SCRIPT = 2,
  SCRIPT_DATA = 3,
  /** Localization files (e.g., Strings.json) */
  STRINGS = 4,
  MP_DATA = 5,
  UNRECOGNIZED = -1,
}

/**
 * Processing status for attachments
 */
export enum ProcessingStatus {
  UNSPECIFIED = 0,
  PENDING = 1,
  PROCESSED = 2,
  NEEDS_RECOMPILE = 3,
  ERROR = 4,
}

/**
 * Publish state for play elements
 */
export enum PublishState {
  INVALID = 0,
  DRAFT = 1,
  PUBLISHED = 2,
  ARCHIVED = 3,
  ERROR = 4,
}

/**
 * Moderation state for play elements
 */
export enum ModerationState {
  UNDEFINED = 0,
  IN_REVIEW = 1,
  APPROVED = 2,
  DENIED = 3,
}

/**
 * Attachment compilation status
 */
export enum AttachmentCompileStatus {
  UNSPECIFIED = 0,
  OK = 1,
  ERROR = 2,
  INCOMPATIBLE_VERSION = 3,
}

// ============================================================================
// Interfaces
// ============================================================================

// TypeScript interfaces for better type safety
export interface StringValue {
  value: string;
}

export interface AttachmentData {
  original?: Uint8Array | Buffer;
  compiled?: Uint8Array | Buffer | { value?: Uint8Array | Buffer };
  [key: string]: unknown;
}

export interface Attachment {
  id?: string;
  version?: string;
  filename?: StringValue | string;
  isProcessable?: boolean;
  processingStatus?: ProcessingStatus | number;
  attachmentData?: AttachmentData;
  attachmentType?: AttachmentType | number | string;
  metadata?: StringValue;
  errors?: string[];
  [key: string]: unknown;
}

export interface GameServerMessage {
  kind?: string;
  text?: string;
}

export interface PlayElementSettings {
  secret?: StringValue;
  messages?: GameServerMessage[];
  allowCopies?: boolean;
}

export interface FirstPartyMetadata {
  psnMetadata?: {
    activityId?: string;
  };
}

export interface DesignMetadata {
  progressionMode?: StringValue;
  firstPartyMetadata?: FirstPartyMetadata[];
  [key: string]: unknown;
}

export interface MapRotationAttributes {
  rotationBehavior?: RotationBehavior;
  [key: string]: unknown;
}

export interface MapRotation {
  maps?: MapEntry[];
  attributes?: MapRotationAttributes;
  [key: string]: unknown;
}

export interface MutatorKind {
  mutatorBoolean?: { value?: boolean };
  mutatorString?: { value?: string };
  mutatorFloat?: { value?: number; behaviour?: number };
  mutatorInt?: { value?: number; behaviour?: number };
  mutatorSparseBoolean?: {
    defaultValue?: boolean;
    size?: number;
    sparseValues?: Array<{ index?: number; value?: boolean }>;
  };
  mutatorSparseInt?: {
    defaultValue?: number;
    size?: number;
    sparseValues?: Array<{ index?: number; value?: number }>;
  };
  mutatorSparseFloat?: {
    defaultValue?: number;
    size?: number;
    sparseValues?: Array<{ index?: number; value?: number }>;
  };
}

export interface Mutator {
  name?: string;
  category?: string;
  kind?: MutatorKind;
  id?: string;
  [key: string]: unknown;
}

export interface AssetCategoryTagBooleanOverride {
  assetCategoryTags?: string[];
  value?: boolean;
}

export interface AssetCategoryTagBooleanTeamOverride {
  assetCategoryTags?: string[];
  value?: boolean;
  teamId?: number;
}

export interface AssetCategoryBoolean {
  defaultValue?: boolean;
  overrides?: AssetCategoryTagBooleanOverride;
  teamOverrides?: AssetCategoryTagBooleanTeamOverride[];
}

export interface AssetCategory {
  tagId?: string;
  boolean?: AssetCategoryBoolean;
  [key: string]: unknown;
}

export interface BlazeGameSettings {
  /** 0 = unspecified, 1 = enabled, 2 = disabled */
  joinInProgress?: number;
  /** 0 = unspecified, 1 = enabled, 2 = disabled */
  openToJoinByPlayer?: number;
  /** 0 = unspecified, 1 = enabled, 2 = disabled */
  openToInvites?: number;
}

export interface GameServerJoinabilitySettings {
  /** 0 = unspecified, 1 = enabled, 2 = disabled */
  matchmakingInProgress?: number;
}

export interface ModRules {
  compatibleRules?: {
    original?: Uint8Array | Buffer;
    rulesVersion?: number;
    compiled?: {
      uncompressed?: {
        compiledModRules?: Uint8Array | Buffer;
        rulesVersion?: number;
      };
      compressed?: {
        compiledModRules?: Uint8Array | Buffer;
        rulesVersion?: number;
        inflatedSize?: number;
      };
    };
  };
  incompatibleRules?: Record<string, unknown>;
  errorRules?: Record<string, unknown>;
}

export interface PlayElementDesign {
  designId?: string;
  designName?: string;
  attachments?: Attachment[];
  designMetadata?: DesignMetadata;
  mapRotation?: MapRotation;
  mutators?: Mutator[];
  assetCategories?: AssetCategory[];
  licenseRequirements?: string[];
  modRules?: ModRules;
  modLevelDataId?: StringValue;
  groupLicenses?: string[];
  attachmentCompileStatus?: AttachmentCompileStatus | number;
  serverHostLicenseRequirements?: string[];
  [key: string]: unknown;
}

export interface PlayElement {
  id?: string;
  designId?: string;
  creator?: unknown;
  name?: string;
  description?: StringValue;
  thumbnailUrl?: StringValue;
  playElementSettings?: PlayElementSettings;
  publishStateType?: PublishState | number;
  likes?: number;
  shortCode?: StringValue;
  moderationState?: ModerationState | number;
  [key: string]: unknown;
}

export interface PlayElementResponse {
  playElement?: PlayElement;
  playElementDesign?: PlayElementDesign;
  [key: string]: unknown;
}

export interface UpdatePlayElementOptions {
  id: string;
  playElement: PlayElement;
  playElementDesign: PlayElementDesign;
  /** Optional: current play element state to avoid re-fetching. If not provided, will be fetched. */
  current?: PlayElementResponse;
}

// ============================================================================
// Map Rotation Type Definitions
// ============================================================================

/**
 * Team balancing method
 */
enum BalancingMethod {
  /** No balancing */
  NONE = 0,
  /** Skill-based balancing */
  SKILL = 1,
  /** Squad-based balancing */
  SQUAD = 2,
}

/**
 * Map rotation behavior - controls how the server cycles through maps
 */
enum RotationBehavior {
  /** Loop through maps continuously */
  LOOP = 0,
  /** End of round map voting */
  EORMM = 1,
  /** Play one map only */
  ONE_MAP = 2,
}

/**
 * Individual team configuration
 */
export interface Team {
  /** Team ID (1-based) */
  teamId: number;
  /** Maximum number of players on this team */
  capacity: number;
}

/**
 * Internal team (bot/AI) configuration
 */
export interface InternalTeam {
  /** Team ID (1-based) */
  teamId: number;
  /** Maximum number of bot slots for this team */
  capacity: number;
  /**
   * Capacity type - controls bot spawn behavior:
   * 0 = UNSPECIFIED (default behavior)
   * 1 = FILL (bots fill empty slots)
   * 2 = FIXED (always spawn this many bots)
   */
  capacityType?: number;
}

/**
 * Team composition and balancing settings
 */
export interface TeamComposition {
  /** List of teams with their capacities */
  teams: Team[];
  /** Internal teams (bots/AI) - use InternalTeam for bot configuration */
  internalTeams?: InternalTeam[];
  /** Team balancing method */
  balancingMethod?: BalancingMethod;
}

/**
 * Configuration for a single map in the rotation
 */
export interface MapEntry {
  /** Map code name (e.g., 'MP_Battery', 'MP_Dumbo') */
  levelName: string;

  /**
   * Level location - use 'ModBuilderCustom0' for custom spatial data
   * For vanilla maps without custom spatial data, use the map's default location
   */
  levelLocation?: string;

  /** Number of rounds to play on this map */
  rounds?: number;

  /** Maximum number of spectators allowed */
  allowedSpectators?: number;

  /** Team composition and balancing settings */
  teamComposition?: TeamComposition;

  /** Mutators to apply to this map */
  mutators?: Mutator[];

  /** Blaze game settings - controls join-in-progress, invites, etc. */
  blazeGameSettings?: BlazeGameSettings | null;

  /** Game server joinability settings - controls matchmaking behavior */
  gameServerJoinabilitySettings?: GameServerJoinabilitySettings | null;

  /**
   * Optional spatial data for this map (JSON string or object)
   * Will be automatically converted to a Type 1 (SPATIAL) attachment
   */
  spatialData?: string | Record<string, unknown>;

  /**
   * Optional filename for the spatial attachment (defaults to auto-generated name)
   * Only used if spatialData is provided
   */
  spatialFilename?: string;
}

/**
 * Complete map rotation configuration
 */
export interface MapRotationConfig {
  /** List of maps in the rotation */
  maps: MapEntry[];

  /** Rotation behavior (how the server cycles through maps) */
  rotationBehavior?: RotationBehavior;
}

/**
 * Builder class for creating map rotation configurations with a fluent API.
 *
 * This provides a clean, type-safe way to build map rotations with sensible defaults.
 *
 * @example
 * ```typescript
 * const rotation = new MapRotationBuilder()
 *   .addMap('MP_Battery', { rounds: 2 })
 *   .addMap('MP_Dumbo', { rounds: 1, allowedSpectators: 8 })
 *   .setRotationBehavior(RotationBehavior.LOOP)
 *   .build();
 *
 * modifier.setMapRotation(rotation.maps, rotation.rotationBehavior);
 * ```
 */
class MapRotationBuilder {
  private maps: MapEntry[] = [];
  private rotationBehavior: RotationBehavior = RotationBehavior.LOOP;

  /**
   * Add a map to the rotation
   *
   * @param levelName - Map code name (e.g., 'MP_Battery', 'MP_Dumbo')
   * @param options - Optional configuration for this map entry
   *
   * @example
   * ```typescript
   * builder.addMap('MP_Battery', {
   *   rounds: 2,
   *   allowedSpectators: 4,
   *   teamComposition: {
   *     teams: [
   *       { teamId: 1, capacity: 32 },
   *       { teamId: 2, capacity: 32 }
   *     ],
   *     balancingMethod: BalancingMethod.SKILL
   *   }
   * });
   * ```
   */
  addMap(levelName: string, options?: Partial<Omit<MapEntry, 'levelName'>>): this {
    this.maps.push({
      levelName,
      levelLocation: options?.levelLocation ?? 'ModBuilderCustom0',
      rounds: options?.rounds ?? 1,
      allowedSpectators: options?.allowedSpectators ?? 4,
      teamComposition: options?.teamComposition ?? {
        teams: [
          { teamId: 1, capacity: 16 },
          { teamId: 2, capacity: 16 }
        ],
        internalTeams: [],
        balancingMethod: BalancingMethod.NONE
      },
      mutators: options?.mutators ?? [],
      blazeGameSettings: options?.blazeGameSettings ?? null,
      gameServerJoinabilitySettings: options?.gameServerJoinabilitySettings ?? null,
    });
    return this;
  }

  /**
   * Set the rotation behavior
   *
   * @param behavior - How the server should cycle through maps
   */
  setRotationBehavior(behavior: RotationBehavior): this {
    this.rotationBehavior = behavior;
    return this;
  }

  /**
   * Build the final map rotation configuration
   */
  build(): MapRotationConfig {
    return {
      maps: [...this.maps],
      rotationBehavior: this.rotationBehavior,
    };
  }

  /**
   * Get the number of maps currently in the rotation
   */
  get count(): number {
    return this.maps.length;
  }
}

/**
 * Common mutator names for Battlefield Portal
 *
 * These constants provide type-safe access to mutator names discovered from the Portal API.
 * Use these instead of hardcoding strings to avoid typos and enable autocomplete.
 *
 * @example
 * ```typescript
 * {
 *   mutators: [
 *     { name: Mutators.FRIENDLY_FIRE, value: false },
 *     { name: Mutators.PROJECTILE_SPEED, value: 2.0 },
 *   ]
 * }
 * ```
 */
export const Mutators = {
  // === GLOBAL GAMEPLAY SETTINGS ===
  // Friendly Fire
  FRIENDLY_FIRE: 'FriendlyFireDamageReflectionEnabled',
  FRIENDLY_FIRE_MAX_KILLS: 'FriendlyFireDamageReflectionMaxTeamKills',

  // Aim Assist
  AIM_ASSIST_SLOWDOWN: 'AimAssistSlowdownEnabled',
  AIM_ASSIST_SNAP_ZOOM: 'AimAssistSnapZoomEnabled',
  AIM_ASSIST_SNAP_RADIUS: 'AimAssistSnapCapsuleRadiusMultiplier',

  // Weapons & Combat
  PROJECTILE_SPEED: 'ProjectileSpeedMultiplier',
  RELOAD_WHOLE_MAGAZINE: 'ReloadWholeWeaponMagazines',

  // Gameplay Features
  SPOTTING_ALLOWED: 'SpottingAllowed',
  STATIONARY_EMPLACEMENTS_ALLOWED: 'StationaryEmplacementsAllowed',
  DISABLE_VEHICLE_3P: 'DisableVehicle3p',
  PORTAL_RESTRICTED_FEEDBACK: 'bPortalRestrictedGameFeedback',

  // === TEAM SETTINGS ===
  MAX_PLAYERS_PER_TEAM: 'MaxPlayerCount_PerTeam',
  MAX_TEAM_COUNT: 'MaxTeamCount',
  AI_MAX_COUNT_PER_TEAM: 'AiMaxCount_PerTeam',
  FRIENDLY_FIRE_ALLOWED_PER_TEAM: 'FriendlyFireAllowed_PerTeam',
  SQUAD_REVIVE_ALLOWED_PER_TEAM: 'SquadReviveAllowed_PerTeam',
  SQUAD_SIZE_PER_TEAM: 'SquadSize_PerTeam',
  SQUAD_SPAWN_MODE_PER_TEAM: 'SquadSpawnMode_PerTeam',
  FACTION_ID_PER_TEAM: 'FactionID_PerTeam',
  DAMAGE_MULTIPLIER_PER_TEAM: 'DamageMultiplier_PerTeam',

  // === SOLDIER/PLAYER SETTINGS ===
  // Global
  AI_SPAWN_TYPE: 'AiSpawnType',

  // Per-Team
  SOLDIER_MAX_HEALTH_PER_TEAM: 'SoldierMaxHealthMultiplier_PerTeam',
  SOLDIER_MOVEMENT_SPEED_PER_TEAM: 'SoldierMovementSpeedMultiplier_PerTeam',
  SOLDIER_REGEN_RATE_PER_TEAM: 'SoldierRegenRateMultiplier_PerTeam',
  SOLDIER_REGEN_ALLOWED_PER_TEAM: 'SoldierHealthRegenAllowed_PerTeam',
  SOLDIER_RESPAWN_DELAY_PER_TEAM: 'SoldierRespawnDelayMultiplier_PerTeam',
  MAN_DOWN_EXPERIENCE_TYPE_PER_TEAM: 'ManDownExperienceType_PerTeam',
  FALL_DAMAGE_HEIGHT_PER_TEAM: 'FallDamageHeightMultiplier_PerTeam',
  PRONE_ALLOWED_PER_TEAM: 'ProneAllowed_PerTeam',
  SLIDE_ALLOWED_PER_TEAM: 'SlideAllowed_PerTeam',
  SPRINT_ALLOWED_PER_TEAM: 'SprintAllowed_PerTeam',
  SPRINT_STRAFE_ALLOWED_PER_TEAM: 'SprintStrafeAllowed_PerTeam',
  ON_FOOT_SPAWN_ALLOWED_PER_TEAM: 'OnFootSpawnAllowed_PerTeam',
  INFINITE_WEAPON_AMMO_PER_TEAM: 'InfiniteWeaponAmmo_PerTeam',
  INFINITE_WEAPON_MAGAZINES_PER_TEAM: 'InfiniteWeaponMagazines_PerTeam',

  // === DAMAGE MULTIPLIERS ===
  BODYSHOT_MULTIPLIER_PER_TEAM: 'BodyshotMultiplier_PerTeam',
  HEADSHOT_MULTIPLIER_PER_TEAM: 'HeadshotMultiplier_PerTeam',

  // === VEHICLE SETTINGS ===
  VEHICLE_ALLOW_PASSENGERS: 'Vehicle_AllowPassengers',
  VEHICLE_HEALTH_REGEN_ALLOWED_PER_TEAM: 'VehicleHealthRegenAllowed_PerTeam',
  VEHICLE_MAX_HEALTH_PER_TEAM: 'VehicleMaxHealthMultiplier_PerTeam',
  VEHICLE_REGEN_RATE_PER_TEAM: 'VehicleRegenRateMultiplier_PerTeam',
  VEHICLE_DAMAGE_MULTIPLIER_PER_TEAM: 'VehicleDamageMultiplier_PerTeam',
  VEHICLE_SPAWN_DELAY_PER_TEAM: 'VehicleSpawnDelayMultiplier_PerTeam',
  EXIT_VEHICLES_ALLOWED_PER_TEAM: 'ExitVehiclesAllowed_PerTeam',

  // === AI/BOT SETTINGS ===
  AI_VEHICLE_ALLOW_PASSENGERS: 'AI_Vehicle_AllowAiInPassengerSeats',
  AI_MAN_DOWN_TYPE: 'AI_ManDownExperienceType_PerTeam',
  AI_MAN_DOWN_TYPE_PER_TEAM: 'AI_ManDownExperienceType_PerTeam',
  AI_DAMAGE_MULTIPLIER_PER_TEAM: 'AI_DamageMultiplier_PerTeam',
  AI_SOLDIER_MAX_HEALTH_PER_TEAM: 'AI_SoldierMaxHealthMultiplier_PerTeam',
  AI_SOLDIER_MOVEMENT_SPEED_PER_TEAM: 'AI_SoldierMovementSpeedMultiplier_PerTeam',
  AI_SOLDIER_REGEN_RATE_PER_TEAM: 'AI_SoldierRegenRateMultiplier_PerTeam',
  AI_SOLDIER_REGEN_ALLOWED_PER_TEAM: 'AI_SoldierHealthRegenAllowed_PerTeam',
  AI_SOLDIER_RESPAWN_DELAY_PER_TEAM: 'AI_SoldierRespawnDelayMultiplier_PerTeam',
  AI_VEHICLE_DAMAGE_MULTIPLIER_PER_TEAM: 'AI_VehicleDamageMultiplier_PerTeam',
  AI_ON_FOOT_SPAWN_ALLOWED_PER_TEAM: 'AI_OnFootSpawnAllowed_PerTeam',
  AI_EXIT_VEHICLES_ALLOWED_PER_TEAM: 'AI_ExitVehiclesAllowed_PerTeam',
  AI_SPRINT_ALLOWED_PER_TEAM: 'AI_SprintAllowed_PerTeam',
  AI_SQUAD_SPAWN_MODE_PER_TEAM: 'AI_SquadSpawnMode_PerTeam',

  // === UI & DISPLAY SETTINGS ===
  SCOREBOARD_TYPE: 'ScoreboardType',
  COMPASS_ALLOWED_PER_TEAM: 'CompassAllowed_PerTeam',
  CROSSHAIRS_ALLOWED_PER_TEAM: 'CrosshairsAllowed_PerTeam',
  HUD_ALLOWED_PER_TEAM: 'HUDAllowed_PerTeam',
  MINIMAP_ALLOWED_PER_TEAM: 'MinimapAllowed_PerTeam',
  FRIENDLY_IDENTIFICATION_ALLOWED_PER_TEAM: 'FriendlyIdentificationAllowed_PerTeam',
  PING_BEHAVIOR_PER_TEAM: 'PingBehavior_PerTeam',
  HUD_INVENTORY_AUTO_HIDE_PER_TEAM: 'HUDInventoryAutoHide_PerTeam',
  HEALTH_BAR_ALLOWED_PER_TEAM: 'HealthBarAllowed_PerTeam',
  HIDE_DAMAGE_NUMBERS_PER_TEAM: 'HideDamageNumbers_PerTeam',
  HIT_INDICATOR_ALLOWED_PER_TEAM: 'HitIndicatorAllowed_PerTeam',
  KILL_FEED_ALLOWED_PER_TEAM: 'KillFeedAllowed_PerTeam',
  SQUAD_LIST_ALLOWED_PER_TEAM: 'SquadListAllowed_PerTeam',

  // Additional UI
  UI_IMAGE_TYPE: 'UIImageType',
  ALPHA_DISABLED: 'AlphaDisabled',
  COLOR_DISABLED: 'ColorDisabled',
  CAPTURE_POINT_SCALE_ALLOWED: 'CapturePointScaleAllowed',
  USE_REDUCED_FRIENDLY_WORLD_ICON: 'UseReducedFriendlyWorldIcon',
  RESTRICT_COMMUNICATION_UI: 'bRestrictCommunicationUI',
  RESTRICT_COMMUNICATION_VO: 'bRestrictCommunicationVO',

  // === SPAWN SETTINGS ===
  SPAWN_BALANCE_START_TIMER: 'SpawnBalancing_GamemodeStartTimer',
  SPAWN_BALANCE_RATIO: 'SpawnBalancing_GamemodePlayerCountRatio',
  HQ_SPAWN: 'HQ_PlayerSpawn',
  INFANTRY_SPAWN: 'InfantrySpawn',

  // === GAME MODE SETTINGS ===
  GAME_TIME: 'fPortalExperienceGameTime',
  MODIFIER_GAME_MODE: 'ModBuilder_GameMode',
  GENERATE_NAV_MESH: 'Portal_GenerateNavMesh',
  ENABLE_CLASS_LOCKED_WEAPON_LOADOUTS: 'EnableClassLockedWeaponLoadouts',

  // === PORTAL SETTINGS ===
  PORTAL_EXPERIENCE: 'Portal_Experience',
} as const;

/**
 * Common mutator categories
 */
export const MutatorCategories = {
  GAMEPLAY: 'WA_ST_Gameplay',
  TEAMS: 'WA_ST_Teams',
  SOLDIER: 'WA_ST_Soldier',
  AI: 'WA_ST_AI',
  UI: 'WA_ST_UI',
  VEHICLE: 'WA_ST_Vehicle',
  SETTINGS: 'WA_ST_Settings',
  EXTRA_SETTINGS: 'WA_ST_ExtraSettings',
  GAME_MODE_CUSTOM: 'WA_GM_Custom',
  GAME_MODE_RUSH: 'WA_GM_Rush',
  GAME_MODE_CONQUEST: 'WA_GM_Conquest',
  GAME_MODE_BREAKTHROUGH: 'WA_GM_Breakthrough',
} as const;

/**
 * Helper to create a mutator object
 *
 * @example
 * ```typescript
 * mutator(Mutators.FRIENDLY_FIRE, false)
 * mutator(Mutators.PROJECTILE_SPEED, 2.0, MutatorCategories.GAMEPLAY)
 * ```
 */
export function mutator(name: string, value: boolean | number | string, category?: string): Mutator {
  const kind: MutatorKind = {};

  if (typeof value === 'boolean') {
    kind.mutatorBoolean = { value };
  } else if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      kind.mutatorInt = { value };
    } else {
      kind.mutatorFloat = { value };
    }
  } else if (typeof value === 'string') {
    kind.mutatorString = { value };
  }

  return { name, category, kind };
}

/**
 * Helper to create a per-team (sparse) mutator object.
 *
 * Creates a sparse mutator that can have different values per team.
 * The sparse format only stores values that differ from the default.
 *
 * @param name - Mutator name (e.g., Mutators.SOLDIER_MAX_HEALTH_PER_TEAM)
 * @param teamValues - Array of values, indexed by team ID (1-based). Can use numbers, booleans, or mixed array.
 * @param defaultValue - Default value for teams not in the array (auto-detected if not provided)
 * @param category - Optional mutator category
 *
 * @example
 * ```typescript
 * // Boolean per-team setting - team 3 and 4 disabled, others enabled
 * sparseMutator(Mutators.SPRINT_ALLOWED_PER_TEAM, [
 *   true,  // team 1
 *   true,  // team 2
 *   false, // team 3
 *   false, // team 4
 *   true,  // team 5
 * ], true)
 *
 * // Float multipliers - different health for different teams
 * sparseMutator(Mutators.SOLDIER_MAX_HEALTH_PER_TEAM, [
 *   1.0,   // team 1
 *   1.0,   // team 2
 *   1.5,   // team 3 - boosted
 *   1.0,   // team 4
 * ], 1.0)
 *
 * // Integer values
 * sparseMutator(Mutators.MAX_PLAYERS_PER_TEAM, [
 *   32, 32, 16, 16, 8, 8
 * ])
 * ```
 */
export function sparseMutator(
  name: string,
  teamValues: Array<boolean | number>,
  defaultValue?: boolean | number,
  category?: string
): Mutator {
  const kind: MutatorKind = {};

  // Determine value type from teamValues
  let valueType: 'boolean' | 'int' | 'float' = 'int';
  let actualDefaultValue = defaultValue;

  // Find first non-undefined value to determine type
  for (const val of teamValues) {
    if (val !== undefined) {
      if (typeof val === 'boolean') {
        valueType = 'boolean';
      } else if (typeof val === 'number') {
        valueType = Number.isInteger(val) ? 'int' : 'float';
      }
      break;
    }
  }

  // If default not provided, use first value as default
  if (actualDefaultValue === undefined && teamValues.length > 0) {
    actualDefaultValue = teamValues[0];
  }

  // Build sparse values array - include all values since we need complete team mapping
  const sparseValues: Array<{ index: number; value?: boolean | number }> = [];
  for (let i = 0; i < teamValues.length; i++) {
    const teamId = i + 1; // Team IDs are 1-based
    const value = teamValues[i];

    if (valueType === 'boolean' || typeof value === 'boolean') {
      // For booleans, only include if different from default
      if (actualDefaultValue !== value) {
        sparseValues.push({ index: teamId, value: value as boolean });
      } else {
        sparseValues.push({ index: teamId }); // Include entry without value
      }
    } else {
      sparseValues.push({ index: teamId, value: value as number });
    }
  }

  // Create the appropriate sparse mutator type
  if (valueType === 'boolean') {
    kind.mutatorSparseBoolean = {
      defaultValue: (actualDefaultValue as boolean) ?? true,
      size: teamValues.length,
      sparseValues: sparseValues as Array<{ index: number; value?: boolean }>,
    };
  } else if (valueType === 'float') {
    kind.mutatorSparseFloat = {
      defaultValue: (actualDefaultValue as number) ?? 1.0,
      size: teamValues.length,
      sparseValues: sparseValues as Array<{ index: number; value?: number }>,
    };
  } else {
    // int
    kind.mutatorSparseInt = {
      defaultValue: (actualDefaultValue as number) ?? 0,
      size: teamValues.length,
      sparseValues: sparseValues as Array<{ index: number; value?: number }>,
    };
  }

  return { name, category, kind };
}

/**
 * Create a team composition from an array of team sizes
 *
 * @param teams - Array of team capacities (e.g., [32, 32] for 32v32, [16, 16, 16] for 16v16v16)
 * @param balancing - Team balancing method (default: NONE)
 *
 * @example
 * ```typescript
 * // Standard 32v32
 * createTeams([32, 32], BalancingMethod.SKILL);
 *
 * // 16v16
 * createTeams([16, 16]);
 *
 * // 3-team battle
 * createTeams([20, 20, 20], BalancingMethod.NONE);
 * ```
 */
export function createTeams(
  teams: number[],
  balancing: BalancingMethod = BalancingMethod.NONE
): TeamComposition {
  return {
    teams: teams.map((capacity, index) => ({
      teamId: index + 1,
      capacity,
    })),
    internalTeams: [],
    balancingMethod: balancing,
  };
}

function encodeGetPlayElementRequest(request: GetPlayElementRequest): Uint8Array {
  const writer = new BinaryWriter();

  // Field 1: id (string)
  if (request.id !== '') {
    writer.uint32(10); // Field 1, wire type 2 (length-delimited): (1 << 3) | 2 = 10
    writer.string(request.id);
  }

  // Field 2: includeDenied (bool)
  if (request.includeDenied !== false && request.includeDenied !== undefined) {
    writer.uint32(16); // Field 2, wire type 0 (varint): (2 << 3) | 0 = 16
    writer.bool(request.includeDenied);
  }

  return writer.finish();
}

export const DEFAULT_SANTIAGO_HOST = 'santiago-prod-wgw-envoy.ops.dice.se';
export const DEFAULT_SANTIAGO_TENANCY = 'prod_default-prod_default-santiago-common';

// gRPC-Web client configuration
export interface GrpcWebClientConfig {
  host?: string;
  tenancy?: string;
  sessionId: string;
}

/**
 * Client for interacting with the Santiago WebPlay gRPC service.
 *
 * ## Usage - Modifier API
 *
 * The recommended way to update play elements is using the PlayElementModifier:
 *
 * ```typescript
 * const client = new SantiagoWebPlayClient({
 *   sessionId: 'your-session-id'
 * });
 *
 * // Fetch the element
 * const response = await client.getPlayElementDecoded({ id: 'element-id' });
 *
 * // Make changes using the fluent API
 * const modifier = new PlayElementModifier(response)
 *   .setName('New Name')
 *   .setDescription('New description')
 *   .setTypeScriptCode('console.log("Updated!");')
 *   .setPublishState(2); // 1=DRAFT, 2=PUBLISHED
 *
 * // Send the update - errors are automatically handled
 * await client.updatePlayElementFromModifier('element-id', modifier);
 * // or: await client.updatePlayElement({ id: 'element-id', ...modifier.build() });
 * ```
 *
 * ## Automatic Error Recovery
 *
 * The `updatePlayElement` method automatically handles error recovery:
 * - Clears errors from attachments being updated
 * - Resets ERROR publish state to DRAFT
 * - Ensures clean updates after compilation failures
 */
class SantiagoWebPlayClient {
  private config: Required<GrpcWebClientConfig>;

  constructor({
    host = DEFAULT_SANTIAGO_HOST,
    tenancy = DEFAULT_SANTIAGO_TENANCY,
    sessionId,
  }: GrpcWebClientConfig) {
    this.config = { host, tenancy, sessionId };
  }

  private buildHeaders(): Record<string, string> {
    return {
      'content-type': 'application/grpc-web+proto',
      'x-dice-tenancy': this.config.tenancy,
      'x-gateway-session-id': this.config.sessionId,
      'x-grpc-web': '1',
      origin: 'https://portal.battlefield.com',
      referer: 'https://portal.battlefield.com/',
    };
  }

  private async invokeGrpc(method: string, payload: Uint8Array): Promise<Uint8Array> {
    const frame = encodeGrpcWebFrame(payload);
    const url = `https://${this.config.host}/santiago.web.play.WebPlay/${method}`;

    console.log(`[DEBUG] POST ${method}: body ${payload.length} bytes (frame ${frame.length} bytes)`);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: frame as any,
    });

    console.log(`[DEBUG] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.log('[DEBUG] Error body:', errorBody);
      throw new Error(`gRPC-Web request failed: ${response.status} ${response.statusText}`);
    }

    const responseData = new Uint8Array(await response.arrayBuffer());
    console.log(`[DEBUG] Response frame size: ${responseData.length} bytes`);

    // Debug: log gRPC trailers in response headers
    const grpcStatus = response.headers.get('grpc-status');
    const grpcMessage = response.headers.get('grpc-message');
    if (grpcStatus || grpcMessage) {
      console.log(`[DEBUG] gRPC trailers:`, { grpcStatus, grpcMessage });
    }

    return unwrapGrpcWebMessage(responseData, response.headers);
  }

  /**
   * Call getPlayElement RPC and return the raw protobuf payload (without gRPC-Web framing)
   */
  async getPlayElement(request: GetPlayElementRequest): Promise<Uint8Array> {
    const requestBody = encodeGetPlayElementRequest(request);

    const message = await this.invokeGrpc('getPlayElement', requestBody);

    console.log('[DEBUG] getPlayElement response size:', message.length, 'bytes');
    if (message.length > 0) {
      const preview = Array.from(message.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log('[DEBUG] getPlayElement response preview:', preview, '...');
    }

    return message;
  }

  /**
   * Convenience helper that returns a decoded PlayElementResponse as plain JSON-friendly data
   */
  async getPlayElementDecoded(request: GetPlayElementRequest): Promise<PlayElementResponse> {
    const message = await this.getPlayElement(request);
    const root = await loadProtoRoot();
    const PlayElementResponse = root.lookupType('battlefield.portal.PlayElementResponse');
    const decoded = PlayElementResponse.decode(message);
    // Use TO_OBJECT_OPTIONS to keep enums as numbers for round-trip compatibility
    return PlayElementResponse.toObject(decoded, PLAY_ELEMENT_TO_OBJECT_OPTIONS) as PlayElementResponse;
  }

  /**
   * Delete specific attachments from a play element
   *
   * @param designId - The play element design ID
   * @param attachmentIds - Array of attachment IDs to delete
   */
  async deleteAttachments(designId: string, attachmentIds: string[]): Promise<void> {
    if (attachmentIds.length === 0) {
      return; // Nothing to delete
    }

    const root = await loadProtoRoot();
    const DeleteAttachmentsRequest = root.lookupType('battlefield.portal.DeleteAttachmentsRequest');

    const requestData = {
      playElementDesignId: designId,
      attachmentIds: attachmentIds
    };

    const errMsg = DeleteAttachmentsRequest.verify(requestData);
    if (errMsg) {
      throw new Error(`Invalid DeleteAttachmentsRequest: ${errMsg}`);
    }

    const message = DeleteAttachmentsRequest.create(requestData);
    const buffer = DeleteAttachmentsRequest.encode(message).finish();

    console.log(`[DEBUG] Deleting ${attachmentIds.length} attachment(s) from design ${designId}`);
    await this.invokeGrpc('DeleteAttachments', buffer);
  }

  /**
   * Generic method to update a play element with modified data.
   * This follows the read-modify-write pattern.
   *
   * Automatically handles:
   * - Error recovery: Clears errors from attachments, resets ERROR publish state to DRAFT
   * - Attachment cleanup: Deletes attachments not referenced in the new map rotation or TypeScript
   *
   * @param options - Object containing id, playElement, and playElementDesign
   * @returns The updated PlayElementResponse
   *
   * @example
   * ```typescript
   * // Fetch the element
   * const response = await client.getPlayElementDecoded({ id: 'your-id' });
   *
   * // Modify using the modifier API
   * const modifier = new PlayElementModifier(response)
   *   .setName('New Name')
   *   .setTypeScriptCode('console.log("Updated!");');
   *
   * // Update it - errors and unused attachments are automatically handled
   * const updated = await client.updatePlayElement({
   *   id: 'your-id',
   *   ...modifier.build()
   * });
   * ```
   */
  async updatePlayElement(options: UpdatePlayElementOptions): Promise<PlayElementResponse> {
    let { id, playElement, playElementDesign, current: providedCurrent } = options;

    // Early validation
    if (!playElement || !playElementDesign) {
      throw new Error('Both playElement and playElementDesign are required for update.');
    }

    // Step 1: Get current state to determine which attachments to delete
    // Use provided current state or fetch if not available
    let current = providedCurrent;
    if (!current) {
      current = await this.getPlayElementDecoded({ id, includeDenied: true });
    }

    // Step 2: Determine which attachments to delete
    // Attachments to keep: those referenced in new map rotation + TypeScript attachment
    const newAttachmentIds = new Set<string>();

    // Add all new attachment IDs from the update
    if (playElementDesign.attachments) {
      playElementDesign.attachments.forEach((att: any) => {
        if (att.id) {
          newAttachmentIds.add(att.id);
        }
      });
    }

    // Find attachments to delete (in current but not in new)
    const attachmentsToDelete: string[] = [];
    if (current.playElementDesign?.attachments) {
      current.playElementDesign.attachments.forEach((att: any) => {
        if (att.id && !newAttachmentIds.has(att.id)) {
          attachmentsToDelete.push(att.id);
          console.log(`[DEBUG] Marking attachment for deletion: ${att.filename?.value ?? att.filename ?? att.id} (${att.id})`);
        }
      });
    }

    // Step 3: Delete unused attachments if any
    if (attachmentsToDelete.length > 0 && current.playElementDesign?.designId) {
      await this.deleteAttachments(current.playElementDesign.designId, attachmentsToDelete);
    }

    // Step 4: Prepare for update: filter out attachments with errors and reset ERROR state
    let hadErrors = false;
    if (playElementDesign.attachments) {
      const originalCount = playElementDesign.attachments.length;
      const cleanedAttachments = playElementDesign.attachments
        .map((att: any) => {
          const hasErrors = att.errors && att.errors.length > 0;

          if (hasErrors) {
            hadErrors = true;
            // Clear errors from attachments that are being updated
            console.log(`[DEBUG] Clearing errors from attachment: ${att.filename?.value ?? att.id}`);
            return { ...att, errors: [] };
          }

          return att;
        })
        .filter(Boolean);

      playElementDesign = {
        ...playElementDesign,
        attachments: cleanedAttachments
      };

      if (cleanedAttachments.length < originalCount) {
        console.log(`[DEBUG] Removed ${originalCount - cleanedAttachments.length} attachment(s)`);
      }
    }

    // Reset ERROR state to DRAFT if we had errors
    if (hadErrors && playElement.publishStateType === PublishState.ERROR) {
      console.log(`[DEBUG] Resetting publish state from ERROR to DRAFT`);
      playElement = {
        ...playElement,
        publishStateType: PublishState.DRAFT
      };
    }

    // Step 5: Proceed with normal update process
    const root = await loadProtoRoot();
    const UpdatePlayElementRequest = root.lookupType('battlefield.portal.UpdatePlayElementRequest');
    const PlayElementResponse = root.lookupType('battlefield.portal.PlayElementResponse');

    // Extract mod rules and ensure it's a proper Uint8Array
    let originalModRules = playElementDesign.modRules?.compatibleRules?.original ?? new Uint8Array();
    // Convert to Uint8Array if it's a Buffer or other array-like object
    if (originalModRules && !(originalModRules instanceof Uint8Array)) {
      originalModRules = new Uint8Array(originalModRules as ArrayLike<number>);
    }

    // Filter out null/undefined attachments and ensure proper structure
    const attachments = (playElementDesign.attachments ?? [])
      .filter(Boolean)
      .map(attachment => {
        const cloned: Attachment = { ...attachment };

        if (Array.isArray(attachment.errors)) {
          cloned.errors = [...attachment.errors];
        }

        if (attachment.attachmentData) {
          // Recursively convert all Buffer-like objects to Uint8Array
          cloned.attachmentData = ensureUint8Arrays(attachment.attachmentData);
        }

        return cloned;
      });

    // Build the update payload
    const updatePayload = {
      id: playElement.id ?? id,
      name: playElement.name ?? '',
      description: cloneStringValue(playElement.description),
      designMetadata: playElementDesign.designMetadata ?? undefined,
      mapRotation: playElementDesign.mapRotation ?? undefined,
      mutators: (playElementDesign.mutators ?? []).filter(Boolean),
      assetCategories: (playElementDesign.assetCategories ?? []).filter(Boolean),
      originalModRules,
      playElementSettings: playElement.playElementSettings ?? undefined,
      publishState: playElement.publishStateType ?? 0,
      modLevelDataId: cloneStringValue(playElementDesign.modLevelDataId),
      thumbnailUrl: cloneStringValue(playElement.thumbnailUrl),
      attachments,
    };

    // Verify the payload
    const verificationError = UpdatePlayElementRequest.verify(updatePayload);
    if (verificationError) {
      throw new Error(`Invalid UpdatePlayElementRequest: ${verificationError}`);
    }

    // Encode and send the update
    const updateMessage = UpdatePlayElementRequest.encode(
      UpdatePlayElementRequest.create(updatePayload)
    ).finish();

    const updateResponseBytes = await this.invokeGrpc('updatePlayElement', updateMessage);
    const updateResponse = PlayElementResponse.decode(updateResponseBytes);

    // Use TO_OBJECT_OPTIONS to keep enums as numbers for round-trip compatibility
    return PlayElementResponse.toObject(updateResponse, PLAY_ELEMENT_TO_OBJECT_OPTIONS) as PlayElementResponse;
  }

  /**
   * Update a play element using a PlayElementModifier instance.
   * This is a convenience method that extracts the build() result from the modifier.
   *
   * @param id - The play element ID
   * @param modifier - The PlayElementModifier with the desired changes
   * @returns The updated PlayElementResponse
   *
   * @example
   * ```typescript
   * const response = await client.getPlayElementDecoded({ id: 'element-id' });
   * const modifier = new PlayElementModifier(response)
   *   .setName('New Name')
   *   .setDescription('Updated description');
   *
   * await client.updatePlayElementFromModifier('element-id', modifier);
   * ```
   */
  async updatePlayElementFromModifier(id: string, modifier: PlayElementModifier): Promise<PlayElementResponse> {
    const { playElement, playElementDesign } = modifier.build();
    return this.updatePlayElement({ id, playElement, playElementDesign });
  }

  /**
   * Get raw binary response from updatePlayElement (for debugging/analysis)
   * Returns both the raw protobuf bytes and the decoded response
   */
  async updatePlayElementRaw(options: UpdatePlayElementOptions): Promise<{ raw: Uint8Array; decoded: PlayElementResponse }> {
    const { id, playElement, playElementDesign } = options;

    if (!playElement || !playElementDesign) {
      throw new Error('Both playElement and playElementDesign are required for update.');
    }

    const root = await loadProtoRoot();
    const UpdatePlayElementRequest = root.lookupType('battlefield.portal.UpdatePlayElementRequest');
    const PlayElementResponse = root.lookupType('battlefield.portal.PlayElementResponse');

    // Extract mod rules and ensure it's a proper Uint8Array
    let originalModRules = playElementDesign.modRules?.compatibleRules?.original ?? new Uint8Array();
    if (originalModRules && !(originalModRules instanceof Uint8Array)) {
      originalModRules = new Uint8Array(originalModRules as ArrayLike<number>);
    }

    // Filter out null/undefined attachments and ensure proper structure
    const attachments = (playElementDesign.attachments ?? [])
      .filter(Boolean)
      .map(attachment => {
        const cloned: Attachment = { ...attachment };

        if (Array.isArray(attachment.errors)) {
          cloned.errors = [...attachment.errors];
        }

        if (attachment.attachmentData) {
          cloned.attachmentData = ensureUint8Arrays(attachment.attachmentData);
        }

        return cloned;
      });

    // Build the update payload
    const updatePayload = {
      id: playElement.id ?? id,
      name: playElement.name ?? '',
      description: cloneStringValue(playElement.description),
      designMetadata: playElementDesign.designMetadata ?? undefined,
      mapRotation: playElementDesign.mapRotation ?? undefined,
      mutators: (playElementDesign.mutators ?? []).filter(Boolean),
      assetCategories: (playElementDesign.assetCategories ?? []).filter(Boolean),
      originalModRules,
      playElementSettings: playElement.playElementSettings ?? undefined,
      publishState: playElement.publishStateType ?? 0,
      modLevelDataId: cloneStringValue(playElementDesign.modLevelDataId),
      thumbnailUrl: cloneStringValue(playElement.thumbnailUrl),
      attachments,
    };

    // Verify and encode
    const verificationError = UpdatePlayElementRequest.verify(updatePayload);
    if (verificationError) {
      throw new Error(`Invalid UpdatePlayElementRequest: ${verificationError}`);
    }

    const updateMessage = UpdatePlayElementRequest.encode(
      UpdatePlayElementRequest.create(updatePayload)
    ).finish();

    const updateResponseBytes = await this.invokeGrpc('updatePlayElement', updateMessage);
    const updateResponse = PlayElementResponse.decode(updateResponseBytes);
    const decoded = PlayElementResponse.toObject(updateResponse, PLAY_ELEMENT_TO_OBJECT_OPTIONS) as PlayElementResponse;

    return {
      raw: updateResponseBytes,
      decoded,
    };
  }

}

export {
  SantiagoWebPlayClient,
  PlayElementModifier,
  encodeGetPlayElementRequest,
  // Map rotation enums, builder, and helpers
  BalancingMethod,
  RotationBehavior,
  MapRotationBuilder,
};

// Note: AttachmentType, ProcessingStatus, PublishState, ModerationState, and AttachmentCompileStatus
// are already exported via the enum declarations above
