#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

// Create directories if they don't exist
const modDir = path.join(distDir, 'portalsdk', 'mod');
const modlibDir = path.join(distDir, 'portalsdk', 'modlib');

fs.mkdirSync(modDir, { recursive: true });
fs.mkdirSync(modlibDir, { recursive: true });

// Copy mod/index.d.ts
const srcModTypes = path.join(srcDir, 'portalsdk', 'mod', 'index.d.ts');
const destModTypes = path.join(modDir, 'index.d.ts');

if (fs.existsSync(srcModTypes)) {
    fs.copyFileSync(srcModTypes, destModTypes);
    console.log(`Copied ${srcModTypes} to ${destModTypes}`);
} else {
    console.warn(`Warning: ${srcModTypes} not found`);
}

console.log('Post-install script completed successfully');
