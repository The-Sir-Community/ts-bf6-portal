import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distTypesPath = join(__dirname, '..', 'dist', 'src', 'portal', 'index.d.ts');
const referenceLine = '/// <reference path="../../index.d.ts" />';

if (!existsSync(distTypesPath)) {
  console.warn('[post-build] Skipping type patch; dist/src/portal/index.d.ts not found.');
  process.exit(0);
}

const current = readFileSync(distTypesPath, 'utf8');
if (!current.includes(referenceLine)) {
  writeFileSync(distTypesPath, `${referenceLine}\n${current}`);
}
