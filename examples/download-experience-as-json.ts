#!/usr/bin/env ts-node

/**
 * CLI Example: Download Play Experience as JSON Configuration
 *
 * This script demonstrates how to use the downloadExperienceAsJSON() library function
 * to download a published play experience from the server and save it as a JSON
 * configuration file that can be edited locally and imported back using
 * loadExperienceFromConfig().
 *
 * This is useful for:
 * - Downloading and backing up experience configurations
 * - Making bulk edits to multiple experiences offline
 * - Version control of experience definitions
 * - Sharing experience configurations with team members
 * - Cloning and adapting existing experiences
 *
 * Workflow:
 *   1. Download: Use this script to download an experience as JSON
 *   2. Edit: Make changes to the JSON file locally
 *   3. Import: Use load-experience-from-config.ts to import the modified experience
 *
 * Usage:
 *   ts-node examples/download-experience-as-json.ts <play-element-id> [output-file] [session-id]
 *
 * Environment Variables:
 *   BF_PORTAL_SESSION_ID - Session ID for authentication (optional, can be provided via CLI)
 *
 * Examples:
 *   # Download with session ID in environment
 *   BF_PORTAL_SESSION_ID=web-xxx ts-node examples/download-experience-as-json.ts \
 *     00000000-0000-0000-0000-000000000000
 *
 *   # Download to specific file
 *   ts-node examples/download-experience-as-json.ts \
 *     00000000-0000-0000-0000-000000000000 \
 *     ./my-experience-config.json
 *
 *   # Specify both output file and session ID
 *   ts-node examples/download-experience-as-json.ts \
 *     00000000-0000-0000-0000-000000000000 \
 *     ./my-experience-config.json \
 *     web-00000000-0000-0000-0000-000000000000
 */

import { downloadExperienceAsJSON } from '../src';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command-line arguments
  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const [playElementId, outputFile, sessionId] = args;

  // Validate play element ID format (basic check)
  if (!playElementId || playElementId.length < 8) {
    console.error(`\n❌ Invalid play element ID: ${playElementId}`);
    console.error('   Play element IDs should be UUIDs or experience names\n');
    process.exit(1);
  }

  // Determine output file path
  let finalOutputFile = outputFile || `${playElementId}-experience.json`;
  if (!finalOutputFile.endsWith('.json')) {
    finalOutputFile += '.json';
  }

  const absoluteOutputPath = path.resolve(finalOutputFile);

  // Ensure output directory exists
  const outputDir = path.dirname(absoluteOutputPath);
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      console.error(`\n❌ Error creating output directory: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  // Create attachments directory
  const filenameWithoutExt = path.basename(absoluteOutputPath, '.json');
  const attachmentsDir = path.join(outputDir, `${filenameWithoutExt}-attachments`);
  if (!fs.existsSync(attachmentsDir)) {
    try {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    } catch (error) {
      console.error(`\n❌ Error creating attachments directory: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  // Resolve session ID
  const finalSessionId = sessionId || process.env.BF_PORTAL_SESSION_ID;
  if (!finalSessionId) {
    console.error('\n❌ Session ID required');
    console.error('   Provide via:');
    console.error('   1. Third command-line argument');
    console.error('   2. BF_PORTAL_SESSION_ID environment variable\n');
    process.exit(1);
  }

  // Download the experience
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  Battlefield Portal Experience Configuration Downloader      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const config = await downloadExperienceAsJSON(playElementId, {
      sessionId: finalSessionId,
      logLevel: 'verbose',
      attachmentsDir: attachmentsDir,
      downloadAttachments: true,
    });

    // Write to file
    console.log(`\n💾 Writing to file: ${absoluteOutputPath}`);
    fs.writeFileSync(absoluteOutputPath, JSON.stringify(config, null, 2));

    // Display success message
    console.log(`\n✅ Experience downloaded successfully!`);
    console.log(`\n📝 Summary:`);
    console.log(`   Experience: ${config.name}`);
    console.log(`   Maps: ${config.maps.length}`);
    console.log(`   Attachments: ${config.attachments?.length || 0}`);
    console.log(`   JSON: ${absoluteOutputPath}`);
    if (config.attachments && config.attachments.length > 0) {
      console.log(`   Attachments dir: ${attachmentsDir}`);
    }
    console.log();

    // Show next steps
    console.log(`📋 Next steps:`);
    console.log(`   1. Review and edit the JSON file as needed`);
    if (config.attachments && config.attachments.length > 0) {
      console.log(`   2. Review attachment files in ${attachmentsDir}`);
      console.log(`   3. Modify attachment references in JSON if needed`);
      console.log(`   4. Import it back to the server:\n`);
    } else {
      console.log(`   2. Import it back to the server:\n`);
    }
    console.log(
      `   ts-node examples/load-experience-from-config.ts ${absoluteOutputPath} ${config.id}`
    );
    console.log();
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.error(
    `Usage: ts-node download-experience-as-json.ts <play-element-id> [output-file] [session-id]\n`
  );
  console.error('Arguments:');
  console.error('  <play-element-id> Play element ID to download (required, UUID or name)');
  console.error(
    '  [output-file]     Output JSON file path (optional, defaults to <id>-experience.json)'
  );
  console.error('  [session-id]      Session ID for authentication (overrides env var, optional)\n');
  console.error('Environment Variables:');
  console.error('  BF_PORTAL_SESSION_ID - Session ID for authentication\n');
  console.error('Examples:');
  console.error('  # Download with session ID in environment');
  console.error('  BF_PORTAL_SESSION_ID=web-xxx ts-node examples/download-experience-as-json.ts \\');
  console.error('    00000000-0000-0000-0000-000000000000\n');
  console.error('  # Download to specific file');
  console.error('  ts-node examples/download-experience-as-json.ts \\');
  console.error('    00000000-0000-0000-0000-000000000000 \\');
  console.error('    ./my-experience-config.json\n');
  console.error('  # Specify both output and session ID');
  console.error('  ts-node examples/download-experience-as-json.ts \\');
  console.error('    00000000-0000-0000-0000-000000000000 \\');
  console.error('    ./my-experience-config.json \\');
  console.error('    web-00000000-0000-0000-0000-000000000000');
}

// Run the CLI
main().catch(error => {
  console.error(`\n❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
