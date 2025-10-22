#!/usr/bin/env ts-node

/**
 * Asset Category UUID Discovery Helper
 *
 * This script helps you discover asset category UUID mappings by:
 * 1. Downloading an experience
 * 2. Collecting all unmapped UUIDs
 * 3. Outputting them in a format you can add to ASSET_CATEGORY_UUID_MAP
 *
 * Usage:
 *   ts-node examples/discover-asset-categories.ts <play-element-id> [session-id]
 */

import { downloadExperienceAsJSON, ASSET_CATEGORY_UUID_MAP } from '../src';

async function discoverAssetCategories() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: ts-node discover-asset-categories.ts <play-element-id> [session-id]');
    console.error('       Set BF_PORTAL_SESSION_ID environment variable for session ID');
    process.exit(1);
  }

  const [playElementId, sessionId] = args;
  const finalSessionId = sessionId || process.env.BF_PORTAL_SESSION_ID;

  if (!finalSessionId) {
    console.error('❌ Session ID required');
    process.exit(1);
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Asset Category UUID Discovery                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Collect unmapped UUIDs
    const unmappedUuids = new Set<string>();

    // Monkey-patch console.log to capture unmapped UUID messages
    const originalLog = console.log;
    console.log = function(...args: any[]) {
      const message = args.join(' ');
      const match = message.match(/Unmapped asset category UUID: ([0-9a-f\-]+)/i);
      if (match) {
        unmappedUuids.add(match[1].toLowerCase());
      }
      originalLog.apply(console, args);
    };

    // Download experience (will log unmapped UUIDs)
    console.log('📥 Downloading experience...\n');
    const config = await downloadExperienceAsJSON(playElementId, {
      sessionId: finalSessionId,
      logLevel: 'verbose',
    });

    // Restore console.log
    console.log = originalLog;

    // Output discovered UUIDs
    if (unmappedUuids.size > 0) {
      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║  Discovered Unmapped UUIDs                              ║');
      console.log('╚═══════════════════════════════════════════════════════════╝\n');

      console.log('Add these to ASSET_CATEGORY_UUID_MAP in src/experience-loader.ts:\n');
      console.log('export const ASSET_CATEGORY_UUID_MAP: Record<string, string> = {');

      for (const uuid of Array.from(unmappedUuids).sort()) {
        console.log(`  '${uuid}': 'CHANGE_ME_TO_READABLE_NAME',`);
      }

      console.log('};\n');

      console.log('Instructions:');
      console.log('1. Research what each UUID represents (check Battlefield Portal data/API)');
      console.log('2. Replace "CHANGE_ME_TO_READABLE_NAME" with the actual category name');
      console.log('3. Use lowercase with underscores for compound names (e.g., "weapon_assault")');
      console.log('4. After adding mappings, re-download the experience');
      console.log('5. Downloaded JSON will then use readable names instead of UUIDs\n');

      console.log('Known Categories:');
      console.log('- weapon_* (different weapon types)');
      console.log('- vehicle_* (different vehicle types)');
      console.log('- gadget_* (different gadget types)');
      console.log('- melee (melee weapons)');
      console.log('- equipment_* (equipment types)');
      console.log('- class_* (class types)\n');
    } else {
      console.log('\n✅ No unmapped UUIDs found!');
      console.log('All asset categories in this experience are already mapped.\n');
    }

    // Show current mappings
    if (Object.keys(ASSET_CATEGORY_UUID_MAP).length > 0) {
      console.log('Current Mappings:');
      for (const [uuid, name] of Object.entries(ASSET_CATEGORY_UUID_MAP)) {
        console.log(`  ${uuid}: ${name}`);
      }
      console.log();
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

discoverAssetCategories();
