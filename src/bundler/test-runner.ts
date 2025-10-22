import * as fs from "fs";
import * as path from "path";
import { bundle } from "./bundler.js";

interface TestCase {
    name: string;
    entry: string;
    shouldFail?: boolean;
    expectedError?: string;
}

const testCases: TestCase[] = [
    { name: "Basic named exports", entry: "tests/bundler/basic-named-exports/index.ts" },
    { name: "Default export - named function", entry: "tests/bundler/default-named-function/index.ts" },
    { name: "Default export - anonymous function", entry: "tests/bundler/default-anonymous-function/index.ts" },
    { name: "Default export - named class", entry: "tests/bundler/default-named-class/index.ts" },
    { name: "Default export - anonymous class", entry: "tests/bundler/default-anonymous-class/index.ts" },
    { name: "Export star (re-export all)", entry: "tests/bundler/export-star/index.ts" },
    { name: "Re-export named", entry: "tests/bundler/reexport-named/index.ts" },
    { name: "Circular dependencies", entry: "tests/bundler/circular-deps/index.ts" },
    { name: "Live bindings", entry: "tests/bundler/live-bindings/index.ts" },
    { name: "Mixed export types", entry: "tests/bundler/mixed-exports/index.ts" },
    { name: "Namespace imports", entry: "tests/bundler/namespace-imports/index.ts" },
    { name: "TypeScript features", entry: "tests/bundler/typescript-features/index.ts" },
    { name: "Imports as types", entry: "tests/bundler/imports-as-types/index.ts" },
    { name: "Missing file error", entry: "tests/bundler/error-missing-file/index.ts", shouldFail: true, expectedError: "Module not found" },
    { name: "Non-relative import error", entry: "tests/bundler/error-non-relative/index.ts", shouldFail: true, expectedError: "Non-relative imports are not supported" },
];

let passed = 0;
let failed = 0;

console.log("Running bundle tests...\n");

for (const test of testCases) {
    const testPath = path.resolve(test.entry);
    const safeName = test.name.replace(/\s+/g, "-").replace(/[()]/g, "").toLowerCase();
    const outPath = path.resolve(`dist/test-${safeName}.ts`);

    try {
        bundle({ entryFile: testPath, outFile: outPath });

        if (test.shouldFail) {
            console.log(`❌ ${test.name} - Expected failure but succeeded`);
            failed++;
        } else {
            // Check that output file was created
            if (fs.existsSync(outPath)) {
                console.log(`✅ ${test.name}`);
                passed++;
            } else {
                console.log(`❌ ${test.name} - Output file not created`);
                failed++;
            }
        }
    } catch (error: any) {
        if (test.shouldFail) {
            const errorMessage = error.message || String(error);
            if (test.expectedError && errorMessage.includes(test.expectedError)) {
                console.log(`✅ ${test.name} - Failed as expected with: ${test.expectedError}`);
                passed++;
            } else {
                console.log(`❌ ${test.name} - Failed with wrong error: ${errorMessage}`);
                failed++;
            }
        } else {
            console.log(`❌ ${test.name} - Unexpected error: ${error.message}`);
            failed++;
        }
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
