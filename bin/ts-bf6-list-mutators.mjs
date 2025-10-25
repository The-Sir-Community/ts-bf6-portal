#!/usr/bin/env node

import { SantiagoWebPlayClient } from '../dist/webplay/playweb-client.js';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function showHelp() {
  console.log(`
🎮 Battlefield Portal - List Available Mutators

Usage: ts-bf6-list-mutators [options]

Options:
  --search <text>      Search for mutators by name (case-insensitive)
  --category <name>    Filter by category
  --type <type>        Filter by type: sparse, global, boolean, integer, float, string
  --sort <field>       Sort by: name (default), id, category, type
  --json               Output as JSON
  --session <id>       Session ID (or set BF_PORTAL_SESSION_ID env var)
  --help               Show this help message

Examples:
  ts-bf6-list-mutators --search sprint          # Find all sprint-related mutators
  ts-bf6-list-mutators --category WA_ST_Soldier  # Show all soldier settings
  ts-bf6-list-mutators --type sparse             # Show all per-team mutators
  ts-bf6-list-mutators --type float --sort name  # Show float values, sorted by name
  ts-bf6-list-mutators --search health --json    # Output health-related mutators as JSON
`);
  process.exit(0);
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    search: null,
    category: null,
    type: null,
    sort: 'name',
    json: false,
    sessionId: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--search' && i + 1 < args.length) {
      options.search = args[++i].toLowerCase();
    } else if (args[i] === '--category' && i + 1 < args.length) {
      options.category = args[++i];
    } else if (args[i] === '--type' && i + 1 < args.length) {
      options.type = args[++i].toLowerCase();
    } else if (args[i] === '--sort' && i + 1 < args.length) {
      options.sort = args[++i];
    } else if (args[i] === '--session' && i + 1 < args.length) {
      options.sessionId = args[++i];
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--help') {
      showHelp();
    }
  }

  // Load SESSION_ID from environment or .env file
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

  if (!options.json) {
    console.log('\n🎮 Battlefield Portal - List Available Mutators\n');
  }

  const client = new SantiagoWebPlayClient({ sessionId });

  try {
    const allMutators = await client.listAvailableMutators();

    // Filter mutators based on options
    let filtered = Array.from(allMutators.entries());

    if (options.search) {
      filtered = filtered.filter(([name, info]) =>
        name.toLowerCase().includes(options.search) ||
        (info.category && info.category.toLowerCase().includes(options.search))
      );
    }

    if (options.category) {
      filtered = filtered.filter(([name, info]) =>
        info.category && info.category.includes(options.category)
      );
    }

    if (options.type) {
      const typeMap = {
        'sparse': 'sparse',
        'global': m => !m.kind.includes('sparse'),
        'boolean': m => m.kind.includes('boolean'),
        'integer': m => m.kind.includes('integer'),
        'float': m => m.kind.includes('float'),
        'string': m => m.kind.includes('string')
      };

      const typeFilter = typeMap[options.type];
      if (typeFilter) {
        if (typeof typeFilter === 'string') {
          filtered = filtered.filter(([name, info]) => info.kind.includes(typeFilter));
        } else {
          filtered = filtered.filter(([name, info]) => typeFilter(info));
        }
      }
    }

    // Sort mutators
    const sortMap = {
      'name': (a, b) => a[0].localeCompare(b[0]),
      'id': (a, b) => a[1].id.localeCompare(b[1].id),
      'category': (a, b) => (a[1].category || '').localeCompare(b[1].category || ''),
      'type': (a, b) => a[1].kind.localeCompare(b[1].kind)
    };

    if (sortMap[options.sort]) {
      filtered.sort(sortMap[options.sort]);
    }

    // Output results
    if (options.json) {
      const jsonOutput = {};
      filtered.forEach(([name, info]) => {
        jsonOutput[name] = {
          id: info.id,
          category: info.category,
          type: info.kind
        };
      });
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      console.log(`📊 Results: ${filtered.length} of ${allMutators.size} mutators\n`);

      if (filtered.length === 0) {
        console.log('❌ No mutators match your filters');
        process.exit(0);
      }

      const sparse = [];
      const global_ = [];

      filtered.forEach(([name, info]) => {
        if (info.kind.includes('sparse')) {
          sparse.push({ name, info });
        } else {
          global_.push({ name, info });
        }
      });

      if (global_.length > 0) {
        console.log('🌍 Global Mutators:');
        global_.forEach(({ name, info }) => {
          console.log(`  • ${name}`);
          console.log(`    ID: ${info.id}`);
          console.log(`    Category: ${info.category || '(no category)'}`);
          console.log(`    Type: ${info.kind}`);
        });
      }

      if (sparse.length > 0) {
        if (global_.length > 0) console.log();
        console.log('👥 Per-Team (Sparse) Mutators:');
        sparse.forEach(({ name, info }) => {
          console.log(`  • ${name}`);
          console.log(`    ID: ${info.id}`);
          console.log(`    Category: ${info.category || '(no category)'}`);
          console.log(`    Type: ${info.kind}`);
        });
      }
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
