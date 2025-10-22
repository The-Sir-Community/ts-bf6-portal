#!/usr/bin/env ts-node

/**
 * Bulk Populate Asset Categories
 *
 * This script helps you add discovered UUID mappings to ASSET_CATEGORY_UUID_MAP in bulk.
 *
 * Usage:
 *   ts-node examples/bulk-populate-asset-categories.ts
 *
 * Then it will prompt you to enter UUID-to-name mappings interactively.
 *
 * Or programmatically:
 *   ts-node examples/bulk-populate-asset-categories.ts --add <uuid> <name> [<uuid> <name>...]
 *
 * Example:
 *   ts-node examples/bulk-populate-asset-categories.ts --add \
 *     6203ab24-874c-2b00-a6d1-cca10e8f5874 weapon_assault \
 *     f42cdddc-b076-4d60-b2b8-3ce5f31acca5 vehicle_transport
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Read the current ASSET_CATEGORY_UUID_MAP from source file
 */
function readCurrentMappings(): Map<string, string> {
  const srcPath = path.resolve(__dirname, '../src/experience-loader.ts');
  const content = fs.readFileSync(srcPath, 'utf8');

  // Extract the map using regex
  const match = content.match(
    /export const ASSET_CATEGORY_UUID_MAP[^=]*=\s*\{([^}]*)\}/s
  );

  const mappings = new Map<string, string>();

  if (match && match[1]) {
    const mapContent = match[1];

    // Parse each line: '123uuid': 'name',
    const lineRegex = /['"]([0-9a-f\-]+)['"]\s*:\s*['"]([^'"]+)['"]/gi;
    let lineMatch;

    while ((lineMatch = lineRegex.exec(mapContent)) !== null) {
      mappings.set(lineMatch[1].toLowerCase(), lineMatch[2]);
    }
  }

  return mappings;
}

/**
 * Write updated mappings back to source file
 */
function writeMappings(mappings: Map<string, string>): void {
  const srcPath = path.resolve(__dirname, '../src/experience-loader.ts');
  let content = fs.readFileSync(srcPath, 'utf8');

  // Generate the new map object
  const mapLines: string[] = [];
  const sortedUuids = Array.from(mappings.keys()).sort();

  for (const uuid of sortedUuids) {
    const name = mappings.get(uuid);
    if (name) {
      mapLines.push(`  '${uuid}': '${name}',`);
    }
  }

  const newMapContent = `export const ASSET_CATEGORY_UUID_MAP: Record<string, string> = {\n${mapLines.join('\n')}\n};`;

  // Replace the old map with the new one
  content = content.replace(
    /export const ASSET_CATEGORY_UUID_MAP[^=]*=\s*\{[^}]*\};/s,
    newMapContent
  );

  fs.writeFileSync(srcPath, content, 'utf8');
  console.log('✅ Updated ASSET_CATEGORY_UUID_MAP in src/experience-loader.ts');
}

/**
 * Interactive prompt for adding mappings
 */
async function interactiveMode(): Promise<Map<string, string>> {
  const mappings = readCurrentMappings();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(prompt, resolve);
    });
  };

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Add Asset Category UUID Mappings                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`Current mappings: ${mappings.size}\n`);

  let addMore = true;

  while (addMore) {
    const uuid = await question('Enter UUID (or press Enter to finish): ');

    if (!uuid) {
      addMore = false;
      break;
    }

    if (!uuid.match(/^[0-9a-f\-]{36}$/i)) {
      console.log('❌ Invalid UUID format\n');
      continue;
    }

    const name = await question('Enter readable name: ');

    if (!name) {
      console.log('❌ Name is required\n');
      continue;
    }

    mappings.set(uuid.toLowerCase(), name.toLowerCase().replace(/\s+/g, '_'));
    console.log(`✓ Added: ${uuid} → ${name}\n`);
  }

  rl.close();
  return mappings;
}

/**
 * Programmatic mode from command-line args
 */
function programmticMode(args: string[]): Map<string, string> {
  const mappings = readCurrentMappings();

  // Process args in pairs: uuid name uuid name ...
  for (let i = 0; i < args.length - 1; i += 2) {
    const uuid = args[i];
    const name = args[i + 1];

    if (!uuid.match(/^[0-9a-f\-]{36}$/i)) {
      console.error(`❌ Invalid UUID: ${uuid}`);
      continue;
    }

    mappings.set(uuid.toLowerCase(), name.toLowerCase().replace(/\s+/g, '_'));
    console.log(`✓ Added: ${uuid} → ${name}`);
  }

  return mappings;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let mappings: Map<string, string>;

  if (args[0] === '--add' && args.length > 2) {
    // Programmatic mode
    mappings = programmticMode(args.slice(1));
  } else if (args.length === 0) {
    // Interactive mode
    mappings = await interactiveMode();
  } else {
    console.error('Usage:');
    console.error('  Interactive: ts-node bulk-populate-asset-categories.ts');
    console.error('  Programmatic: ts-node bulk-populate-asset-categories.ts --add UUID NAME [UUID NAME...]');
    process.exit(1);
  }

  if (mappings.size === 0) {
    console.log('\nNo mappings to add.');
    process.exit(0);
  }

  // Write mappings
  writeMappings(mappings);

  console.log(`\n📊 Summary:`);
  console.log(`   Total mappings: ${mappings.size}`);
  console.log(`\n💾 Next steps:`);
  console.log(`   1. Review the changes in src/experience-loader.ts`);
  console.log(`   2. Run: npm run build`);
  console.log(`   3. Test with: ts-node examples/download-experience-as-json.ts <experience-id>`);
  console.log();
}

main().catch(error => {
  console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
