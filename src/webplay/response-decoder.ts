import * as path from 'path';
import protobufjs from 'protobufjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PlayElementResponse } from './playweb-client.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, '../../../battlefield_portal.proto');
let protoRootPromise: Promise<protobufjs.Root> | null = null;

const DECODE_OPTIONS: protobufjs.IConversionOptions = {
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

/**
 * Decode a raw PlayElementResponse from binary protobuf data
 * This is the response format returned by both getPlayElement and updatePlayElement
 */
export async function decodePlayElementResponse(data: Uint8Array): Promise<PlayElementResponse> {
  const root = await loadProtoRoot();
  const PlayElementResponseType = root.lookupType('battlefield.portal.PlayElementResponse');

  const decoded = PlayElementResponseType.decode(data);
  return PlayElementResponseType.toObject(decoded, DECODE_OPTIONS) as PlayElementResponse;
}

/**
 * Decode a PlayElementResponse and return a human-readable summary
 */
export async function summarizePlayElementResponse(data: Uint8Array): Promise<string> {
  const response = await decodePlayElementResponse(data);
  const lines: string[] = [];

  lines.push('=== PlayElementResponse Summary ===');
  lines.push('');

  // PlayElement info
  if (response.playElement) {
    lines.push('PlayElement:');
    lines.push(`  ID: ${response.playElement.id ?? '<none>'}`);
    lines.push(`  Name: ${response.playElement.name ?? '<none>'}`);
    lines.push(`  Design ID: ${response.playElement.designId ?? '<none>'}`);
    lines.push(`  Description: ${response.playElement.description?.value ?? '<none>'}`);
    lines.push(`  Publish State: ${response.playElement.publishStateType ?? 0}`);
    lines.push(`  Short Code: ${(response.playElement.shortCode as any)?.value ?? '<none>'}`);
    lines.push(`  Thumbnail URL: ${(response.playElement.thumbnailUrl as any)?.value ?? '<none>'}`);
    lines.push(`  Likes: ${(response.playElement.likes as any)?.value ?? 0}`);

    if (response.playElement.creator) {
      const creator = response.playElement.creator as any;
      if (creator.playerCreator) {
        lines.push(`  Creator: Player (nucleus_id: ${creator.playerCreator.player?.nucleusId ?? '?'})`);
      } else if (creator.internalCreator) {
        lines.push('  Creator: Internal');
      } else if (creator.trustedCreator) {
        lines.push('  Creator: Trusted Player');
      }
    }
  }

  lines.push('');

  // PlayElementDesign info
  if (response.playElementDesign) {
    lines.push('PlayElementDesign:');
    lines.push(`  Design ID: ${response.playElementDesign.designId ?? '<none>'}`);
    lines.push(`  Design Name: ${response.playElementDesign.designName ?? '<none>'}`);

    const attachments = response.playElementDesign.attachments ?? [];
    lines.push(`  Attachments: ${attachments.length}`);
    attachments.forEach((att: any, idx: number) => {
      lines.push(`    [${idx}] Type: ${att.attachmentType ?? '?'}, ID: ${att.id ?? '?'}`);
      if (att.attachmentData?.original) {
        const size = att.attachmentData.original.length ?? 0;
        lines.push(`        Original size: ${size} bytes`);
      }
      if (att.attachmentData?.compiled) {
        const size = att.attachmentData.compiled.value?.length ?? 0;
        lines.push(`        Compiled size: ${size} bytes`);
      }
      if (att.errors && att.errors.length > 0) {
        lines.push(`        Errors: ${att.errors.join(', ')}`);
      }
    });

    const mutators = response.playElementDesign.mutators ?? [];
    lines.push(`  Mutators: ${mutators.length}`);

    const assetCategories = response.playElementDesign.assetCategories ?? [];
    lines.push(`  Asset Categories: ${assetCategories.length}`);

    if (response.playElementDesign.modRules) {
      const modRules = response.playElementDesign.modRules as any;
      if (modRules.compatibleRules?.original) {
        lines.push(`  Mod Rules (compatible): ${modRules.compatibleRules.original.length} bytes`);
      }
    }

    if (response.playElementDesign.mapRotation) {
      const mapRotation = response.playElementDesign.mapRotation as any;
      const maps = mapRotation.maps ?? [];
      lines.push(`  Map Rotation: ${maps.length} maps`);
    }
  }

  lines.push('');
  lines.push(`Progression Mode: ${response.progressionMode ?? '<none>'}`);

  return lines.join('\n');
}

/**
 * Extract the script content from a PlayElementResponse
 */
export async function extractScript(data: Uint8Array): Promise<string | null> {
  const response = await decodePlayElementResponse(data);

  const attachments = response.playElementDesign?.attachments ?? [];
  const scriptAttachment = attachments.find(
    (att: any) => att.attachmentType === 1 || att.attachmentType === 'ATTACHMENT_TYPE_SCRIPT'
  );

  if (!scriptAttachment || !(scriptAttachment as any).attachmentData?.original) {
    return null;
  }

  const originalBytes = (scriptAttachment as any).attachmentData.original;
  const buffer = Buffer.isBuffer(originalBytes) ? originalBytes : Buffer.from(originalBytes);
  return buffer.toString('utf8');
}

/**
 * Check if a PlayElementResponse has compilation errors
 */
export function hasCompilationErrors(response: PlayElementResponse): boolean {
  // Check if the play element is in ERROR state
  if (response.playElement?.publishStateType === 4) {
    return true;
  }

  // Check if any attachment has errors
  const attachments = response.playElementDesign?.attachments ?? [];
  return attachments.some((att: any) => {
    return att.processingStatus === 4 || (att.errors && att.errors.length > 0);
  });
}

/**
 * Get all compilation errors from a PlayElementResponse
 */
export function getCompilationErrors(response: PlayElementResponse): Array<{ attachment: string; errors: string[] }> {
  const result: Array<{ attachment: string; errors: string[] }> = [];

  const attachments = response.playElementDesign?.attachments ?? [];
  attachments.forEach((att: any) => {
    if (att.errors && att.errors.length > 0) {
      result.push({
        attachment: att.filename?.value ?? att.id ?? 'unknown',
        errors: att.errors,
      });
    }
  });

  return result;
}
