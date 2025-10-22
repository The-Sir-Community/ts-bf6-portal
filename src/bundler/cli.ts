#!/usr/bin/env node
import { bundle } from "./bundler.js";

const args = process.argv.slice(2);

if (args.length < 2) {
    console.error("Usage: ts-portal-bundle <entryFile> <outFile> [tsConfigPath]");
    console.error("\nExample:");
    console.error("  ts-portal-bundle src/index.ts dist/output.ts");
    console.error("  ts-portal-bundle src/index.ts dist/output.ts tsconfig.json");
    process.exit(1);
}

const [entryFile, outFile, tsConfigPath] = args;

try {
    bundle({ entryFile, outFile, tsConfigPath });
    console.log(`Bundle generated at ${outFile}`);
} catch (error) {
    if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
    } else {
        console.error("An unknown error occurred");
    }
    process.exit(1);
}
