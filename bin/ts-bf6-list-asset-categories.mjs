#!/usr/bin/env node

import { SantiagoWebPlayClient } from '../dist/webplay/playweb-client.js';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function showHelp() {
  console.log(`
🎮 Battlefield Portal - List Available Asset Categories

Usage: ts-bf6-list-asset-categories [options]

Options:
  --search <text>      Search for categories by name (case-insensitive)
  --json               Output as JSON
  --session <id>       Session ID (or set BF_PORTAL_SESSION_ID env var)
  --help               Show this help message

Examples:
  ts-bf6-list-asset-categories              # List all asset categories
  ts-bf6-list-asset-categories --search class  # Find class-related categories
  ts-bf6-list-asset-categories --json          # Output as JSON
`);
  process.exit(0);
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    search: null,
    json: false,
    sessionId: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--search' && i + 1 < args.length) {
      options.search = args[++i].toLowerCase();
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--session' && i + 1 < args.length) {
      options.sessionId = args[++i];
    } else if (args[i] === '--help') {
      showHelp();
    }
  }

  // Load SESSION_ID from .env if not provided
  let sessionId = options.sessionId || process.env.BF_PORTAL_SESSION_ID;

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
    console.log(`\n📋 Fetching available asset categories...\n`);

    const categories = await client.listAvailableAssetCategories();

    if (categories.size === 0) {
      console.log('No asset categories found in blueprint');
      process.exit(0);
    }

    // Convert to array and sort
    const categoryArray = Array.from(categories.entries()).map(([name, tagId]) => ({
      name,
      tagId
    })).sort((a, b) => a.name.localeCompare(b.name));

    // Filter by search if provided
    let filtered = categoryArray;
    if (options.search) {
      filtered = categoryArray.filter(cat =>
        cat.name.toLowerCase().includes(options.search)
      );
      if (filtered.length === 0) {
        console.log(`No categories matching '${options.search}' found\n`);
        process.exit(0);
      }
    }

    // Output
    if (options.json) {
      console.log(JSON.stringify(filtered, null, 2));
    } else {
      console.log(`✅ Found ${filtered.length} asset categor${filtered.length === 1 ? 'y' : 'ies'}:\n`);
      console.log('═'.repeat(100));
      filtered.forEach((cat, index) => {
        console.log(`\n${index + 1}. ${cat.name}`);
        console.log(`   Tag ID: ${cat.tagId}`);
      });
      console.log('\n' + '═'.repeat(100) + '\n');
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
