import { Project, SyntaxKind } from "ts-morph";
import * as path from "path";
import * as fs from "fs";

export interface BundleOptions {
    entryFile: string;
    outFile: string;
    tsConfigPath?: string;
}

export function bundle(options: BundleOptions): void {
    const { entryFile, outFile, tsConfigPath } = options;

    const entryFilePath = path.resolve(entryFile);
    const outFilePath = path.resolve(outFile);

    // Validate entry file exists
    if (!fs.existsSync(entryFilePath)) {
        throw new Error(`Entry file not found: ${entryFilePath}`);
    }

    const project = new Project({
        tsConfigFilePath: tsConfigPath || "tsconfig.json",
        skipAddingFilesFromTsConfig: true,
    });

    project.addSourceFileAtPath(entryFilePath);

    const visited = new Set<string>();
    const orderedModules: string[] = [];

    // Collect modules in dependency order (dependencies first)
    function collectModules(filePath: string) {
        if (visited.has(filePath)) return;
        visited.add(filePath);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`Module not found: ${filePath}`);
        }

        const source = project.addSourceFileAtPath(filePath);

        // First, recursively collect dependencies
        source.getImportDeclarations().forEach((imp) => {
            const spec = imp.getModuleSpecifierValue();
            if (spec.startsWith("./") || spec.startsWith("../")) {
                let resolved = path.resolve(path.dirname(filePath), spec);
                if (!resolved.endsWith(".ts")) resolved += ".ts";
                collectModules(resolved);
            } else {
                // Non-relative import detected
                throw new Error(
                    `Non-relative imports are not supported: "${spec}" in ${filePath}. ` +
                    `Only relative imports (starting with ./ or ../) are allowed.`
                );
            }
        });

        // Also collect modules from export declarations with module specifiers
        source.getExportDeclarations().forEach((exp) => {
            const spec = exp.getModuleSpecifierValue();
            if (spec && (spec.startsWith("./") || spec.startsWith("../"))) {
                let resolved = path.resolve(path.dirname(filePath), spec);
                if (!resolved.endsWith(".ts")) resolved += ".ts";
                collectModules(resolved);
            }
        });

        // Add this module after its dependencies
        orderedModules.push(filePath);
    }

    collectModules(entryFilePath);

    // Generate timestamp for bundle
    const now = new Date();
    const timestamp = now.toISOString();
    const readableTime = now.toLocaleString();

    const bundledCode: string[] = [];

    // Add header with generation metadata
    bundledCode.push(`/**
 * Bundle generated: ${timestamp}
 * Entry point: ${path.relative(process.cwd(), entryFilePath)}
 * Modules included: ${orderedModules.length}
 */\n`);

    // Process each module in dependency order
    for (let i = 0; i < orderedModules.length; i++) {
        const filePath = orderedModules[i];
        const source = project.getSourceFileOrThrow(filePath);

        // --- Remove all import declarations (since everything is flattened) ---
        source.getImportDeclarations().forEach((imp) => {
            imp.remove();
        });

        // --- Transform export declarations with module specifiers ---
        source.getExportDeclarations().forEach((exp) => {
            const spec = exp.getModuleSpecifierValue();
            if (spec && (spec.startsWith("./") || spec.startsWith("../"))) {
                // For re-exports from other modules, we just remove them since
                // everything is flattened and the original exports are preserved
                exp.remove();
            }
            // For local re-exports (export { foo }), keep them as-is
        });

        // --- Handle export assignments (export = foo) ---
        // Convert to export default
        source.getExportAssignments().forEach((exp) => {
            exp.replaceWithText(`export default ${exp.getExpression()?.getText()};`);
        });

        // --- Handle default exports ---
        // Keep all default exports as-is (export default is preserved)

        // --- Keep all named exports as-is ---
        // All export keywords are preserved in the flattened bundle

        // Add a comment header for clarity (except for single-file bundles)
        if (orderedModules.length > 1) {
            bundledCode.push(`// --- Module: ${path.relative(process.cwd(), filePath)} ---`);
        }
        bundledCode.push(source.getFullText());
        bundledCode.push("");
    }

    const bundleContent = bundledCode.join("\n");

    fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
    fs.writeFileSync(outFilePath, bundleContent);
}
