# ts-bf6-portal

Tooling to simplify BF6 Portal custom experiences (modding). Portal APIs themselves are property of EA.

## Features

:warning: EXPERIMENTAL :warning: 

## Quick Start

1. Obtain your Portal session ID from https://portal.battlefield.com/. Set it via one of:

   Option A: Create a `.env` file
   ```
   BF_PORTAL_SESSION_ID=your-session-id
   ```

   Option B: Export as environment variable
   ```bash
   export BF_PORTAL_SESSION_ID=your-session-id
   ```

2. Create a `ts-bf6-portal.config.json` configuration file

3. Deploy with:
   ```bash
   npx ts-bf6-deploy [--config <path>] [--strings <path>]
   ```

## Configuration File

Create `ts-bf6-portal.config.json` in your project:

```json
{
  "id": "your-experience-uuid",
  "name": "Experience Name",
  "description": "Optional description",
  "published": false,
  "script": {
    "file": "src/index.ts"
  },
  "maps": [
    {
      "map": "MP_Battery",
      "teams": [32, 32],
      "balancing": "skill",
      "rules": [
        { "name": "FriendlyFireDamageReflectionEnabled", "value": false }
      ]
    }
  ],
  "rotation": "loop"
}
```

### Configuration Fields

- `id` - Experience UUID (required for deployment)
- `name` - Experience name (required)
- `description` - Experience description (optional)
- `published` - Boolean, set to true to publish (optional, defaults to false)
- `script` - TypeScript code:
  - `file`: Path to TypeScript file
  - `code` or `inline`: Inline code string
- `bundle` - Alternative to `script`, bundles an entry point:
  - `entry`: Entry file path
  - `outFile`: Output path (optional, defaults to `dest/portal-bundle.ts`)
  - `tsconfig`: Path to tsconfig.json (optional)
- `maps` - Array of map configurations:
  - `map`: Map code (e.g., `MP_Battery`, `MP_Dumbo`)
  - `teams`: Array of team sizes (e.g., `[32, 32]`)
  - `rounds`: Number of rounds (default: 1)
  - `balancing`: `none`, `skill`, or `squad` (default: `skill`)
  - `bots`: Bot configuration with `team`, `count`, `type` (`fill` or `fixed`)
  - `rules`: Mutator rules with `name` and `value`
  - `joinability`: Join settings (`joinInProgress`, `openJoin`, `invites`)
  - `matchmaking`: Boolean (default: false)
  - `spatial`: Spatial data from file or inline
- `globalRules` - Experience-wide mutators (optional)
- `restrictions` - Asset restrictions (weapons, vehicles, etc.) (optional)
- `rotation` - Map rotation: `loop`, `shuffle`, or `once` (default: `loop`)
- `strings` - Localization strings:
  - `file`: Path to strings JSON file
  - `data`: Inline strings object

## Bundler

The bundler compiles TypeScript entry points into deployable scripts:

```bash
npx ts-portal-bundle --entry src/index.ts --out dist/bundle.ts [--tsconfig tsconfig.json]
```

Or configure in `ts-bf6-portal.config.json`:

```json
{
  "bundle": {
    "entry": "src/index.ts",
    "outFile": "dist/portal-bundle.ts",
    "tsconfig": "tsconfig.json"
  }
}
```

## Strings (Localization)

Bundle localization strings via:

```bash
npx ts-bf6-deploy --strings dist/strings.json
```

The `--strings` flag loads a JSON file and attaches it to the experience. Use `--no-strings` to skip automatic loading.

## CLI Tools for Asset Discovery

### List Available Mutators

```bash
npx ts-bf6-list-mutators
```

Returns all mutators available in the Portal, with their names and valid value ranges. Use these names in the `rules` field of your config.

### List Available Asset Categories

```bash
npx ts-bf6-list-asset-categories
```

Returns asset categories (weapons, vehicles, gadgets, etc.) for use in the `restrictions` field.

## Deploy CLI

```bash
npx ts-bf6-deploy [options]
```

Options:
- `--config <path>` - Path to config file (default: `ts-bf6-portal.config.json`)
- `--env-file <path>` - Path to .env file (default: `.env` if present)
- `--strings <path>` - Attach Strings.json file
- `--no-strings` - Disable automatic strings loading
