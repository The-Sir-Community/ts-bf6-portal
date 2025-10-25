#!/usr/bin/env node

import { SantiagoWebPlayClient } from '../dist/webplay/playweb-client.js';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function showHelp() {
  console.log(`
🎮 Battlefield Portal - Validate Experience Config

Usage: ts-bf6-validate-config [config-file] [options]

Arguments:
  config-file         Path to ts-bf6-portal.config.json (default: ts-bf6-portal.config.json)

Options:
  --session <id>      Session ID (or set BF_PORTAL_SESSION_ID env var)
  --help              Show this help message

Examples:
  ts-bf6-validate-config                          # Validate default config file
  ts-bf6-validate-config custom-config.json       # Validate custom config file
  ts-bf6-validate-config config.json --session abc123  # Validate with explicit session
`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  let configFile = 'ts-bf6-portal.config.json';
  let sessionId = process.env.BF_PORTAL_SESSION_ID;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      showHelp();
    } else if (args[i] === '--session' && i + 1 < args.length) {
      sessionId = args[++i];
    } else if (!args[i].startsWith('--')) {
      configFile = args[i];
    }
  }

  if (!path.isAbsolute(configFile)) {
    configFile = path.resolve(configFile);
  }

  if (!fs.existsSync(configFile)) {
    console.error(`❌ Config file not found: ${configFile}`);
    process.exit(1);
  }

  console.log(`\n🎮 Validating Battlefield Portal Experience Config\n`);
  console.log(`📂 Config file: ${configFile}\n`);

  // Load SESSION_ID from .env if not provided
  if (!sessionId && fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    const match = envContent.match(/(?:SESSION_ID|BF_PORTAL_SESSION_ID)\s*=\s*(.+)/);
    if (match) {
      sessionId = match[1].trim();
    }
  }

  if (!sessionId) {
    console.error('❌ SESSION_ID not found - set BF_PORTAL_SESSION_ID environment variable or add to .env file');
    process.exit(1);
  }

  const client = new SantiagoWebPlayClient({ sessionId });

  try {
    // Load config
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    console.log(`✅ Config loaded successfully\n`);

    // Collect all mutators from config
    const mutatorsToValidate = [];

    // Check globalRules
    if (config.globalRules && Array.isArray(config.globalRules)) {
      console.log(`📋 Found ${config.globalRules.length} global rule(s)`);
      for (const rule of config.globalRules) {
        mutatorsToValidate.push(rule);
      }
    }

    // Check map-specific mutators
    let mapMutatorCount = 0;
    if (config.mapRotation && Array.isArray(config.mapRotation)) {
      for (const map of config.mapRotation) {
        if (map.mutators && Array.isArray(map.mutators)) {
          mapMutatorCount += map.mutators.length;
          for (const mutator of map.mutators) {
            mutatorsToValidate.push({ ...mutator, _map: map.name });
          }
        }
      }
    }
    if (mapMutatorCount > 0) {
      console.log(`📋 Found ${mapMutatorCount} map-specific mutator(s)`);
    }

    console.log(`\n🔍 Validating ${mutatorsToValidate.length} total mutator(s)...`);
    console.log('═'.repeat(80) + '\n');

    // Validate mutators
    const result = await client.validateMutatorsAgainstBlueprint(mutatorsToValidate);

    // Display results
    if (result.errors.length > 0) {
      console.log('❌ ERRORS:');
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
      console.log();
    }

    if (result.warnings.length > 0) {
      console.log('⚠️  WARNINGS:');
      result.warnings.forEach((warn, i) => {
        console.log(`   ${i + 1}. ${warn}`);
      });
      console.log();
    }

    console.log('═'.repeat(80));
    console.log(`\n${result.summary}\n`);

    if (!result.valid) {
      process.exit(1);
    }

    // Display additional info
    if (config.globalRules && config.globalRules.length > 0) {
      console.log('📝 Global Rules Summary:');
      for (const rule of config.globalRules) {
        const mutator = await client.getMutatorByName(rule.name);
        if (mutator) {
          console.log(`\n   • ${rule.name}`);
          console.log(`     ID: ${mutator.id}`);
          console.log(`     Type: ${mutator.kind}`);
        }
      }
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
