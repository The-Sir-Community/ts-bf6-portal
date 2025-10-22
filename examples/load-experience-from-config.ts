#!/usr/bin/env ts-node

/**
 * CLI Example: Load and Apply Experience Configuration
 *
 * This script demonstrates how to use the loadExperienceFromConfig() library function
 * to load and apply a complete Battlefield Portal experience from a JSON configuration file.
 *
 * Usage:
 *   ts-node examples/load-experience-from-config.ts <config-file> [play-element-id] [session-id]
 *
 * Environment Variables:
 *   BF_PORTAL_SESSION_ID - Session ID for authentication (optional, can be provided via CLI)
 *
 * Examples:
 *   # Load from config with session ID in environment
 *   BF_PORTAL_SESSION_ID=web-xxx ts-node examples/load-experience-from-config.ts examples/example-experience.json
 *
 *   # Override experience ID from config
 *   ts-node examples/load-experience-from-config.ts examples/example-experience.json 00000000-0000-0000-0000-000000000000
 *
 *   # Specify both ID and session ID
 *   ts-node examples/load-experience-from-config.ts \
 *     examples/example-experience.json \
 *     00000000-0000-0000-0000-000000000000 \
 *     web-00000000-0000-0000-0000-000000000000
 */

import { loadExperienceFromConfig, validateExperienceConfig } from '../src';

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

  const [configFile, playElementId, sessionId] = args;

  // Validate configuration file exists and is readable
  try {
    const validation = validateExperienceConfig(configFile);
    if (!validation.isValid) {
      console.error('\n❌ Configuration validation failed:');
      validation.errors.forEach(err => console.error(`   - ${err}`));
      process.exit(1);
    }

    if (validation.warnings.length > 0) {
      console.warn('\n⚠️  Configuration warnings:');
      validation.warnings.forEach(warn => console.warn(`   - ${warn}`));
    }
  } catch (error) {
    console.error(`\n❌ Error reading configuration: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Load and apply the configuration
  try {
    await loadExperienceFromConfig(configFile, {
      playElementId,
      sessionId,
      logLevel: 'verbose',
    });
  } catch (error) {
    process.exit(1);
  }
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.error(`Usage: ts-node load-experience-from-config.ts <config-file> [play-element-id] [session-id]\n`);
  console.error('Arguments:');
  console.error('  <config-file>     Path to JSON configuration file (required)');
  console.error('  [play-element-id] Playground/experience ID (overrides config file, optional)');
  console.error('  [session-id]      Session ID for authentication (overrides env var, optional)\n');
  console.error('Environment Variables:');
  console.error('  BF_PORTAL_SESSION_ID - Default session ID if not provided via arguments\n');
  console.error('Examples:');
  console.error('  # Load from config with session ID in environment');
  console.error('  BF_PORTAL_SESSION_ID=web-xxx ts-node examples/load-experience-from-config.ts examples/example-experience.json\n');
  console.error('  # Override experience ID from config');
  console.error(
    '  ts-node examples/load-experience-from-config.ts examples/example-experience.json 00000000-0000-0000-0000-000000000000\n'
  );
  console.error('  # Specify both ID and session ID');
  console.error(
    '  ts-node examples/load-experience-from-config.ts examples/example-experience.json 00000000-0000-0000-0000-000000000000 web-xxx'
  );
}

// Run the CLI
main().catch(error => {
  console.error(`\n❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
