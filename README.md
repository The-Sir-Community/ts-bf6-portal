# ts-bf6-portal

Tooling to simplify BF6 Portal custom experiences (modding). Portal APIs themselves are property of EA.

## Features

:warning: EXPERIMENTAL :warning: 

The package exposes a `ts-bf6-deploy` CLI that bundles your script and uploads it to a Portal experience.

1. Create a `ts-bf6-portal.config.json` in your project (copy `ts-bf6-portal.config.sample.json` to get started):

   **Basic Example (Script Only):**
   ```json
   {
     "id": "your-experience-uuid",
     "bundle": {
       "entry": "src/index.ts",
       "outFile": "dist/portal-bundle.ts",
       "tsconfig": "tsconfig.json"
     }
   }
   ```

   **Full Featured Example (with Maps, Rules, and Settings):**
   ```json
   {
     "id": "your-experience-uuid",
     "name": "My Custom Game Mode",
     "description": "A custom Battlefield Portal experience",
     "published": false,
     "script": {
       "file": "src/index.ts"
     },
     "maps": [
       {
         "map": "MP_Battery",
         "name": "Iberian Offensive",
         "rounds": 2,
         "teams": [32, 32],
         "spectators": 4,
         "balancing": "skill",
         "bots": [
           { "team": 1, "count": 16, "type": "fill" },
           { "team": 2, "count": 16, "type": "fill" }
         ],
         "rules": [
           { "name": "FriendlyFireDamageReflectionEnabled", "value": false },
           { "name": "ProjectileSpeedMultiplier", "value": 1.5 },
           { "name": "MaxPlayerCount_PerTeam", "value": 32 }
         ],
         "joinability": {
           "joinInProgress": true,
           "openJoin": true,
           "invites": true
         },
         "matchmaking": false,
         "spatial": {
           "file": "spatial/MP_Battery_objects.json"
         }
       },
       {
         "map": "MP_Dumbo",
         "name": "High Speed Manhattan",
         "rounds": 1,
         "teams": [32, 32],
         "balancing": "skill",
         "bots": [
           { "team": 1, "count": 12 },
           { "team": 2, "count": 12 }
         ],
         "rules": [
           { "name": "ProjectileSpeedMultiplier", "value": 2.5 }
         ]
       }
     ],
     "rotation": "loop"
   }
   ```

   **Configuration Notes:**
   - `id` or `experienceId` (old) - Your experience UUID (required)
   - `name` - Experience name (optional)
   - `description` - Experience description (optional)
   - `published` - Set to `true` to publish, `false` for draft (optional)
   - `script` - Inline TypeScript code via `file`, `code`, or `inline` (optional if `bundle` is used)
   - `bundle` - Bundler configuration (optional if `script.file` is used)
     - `entry` - Entry point for bundling
     - `outFile` - Output path (defaults to `dist/portal-bundle.ts`)
     - `tsconfig` - tsconfig.json path (optional)
   - `maps` - Array of map configurations (optional)
     - `map` - Map code like `MP_Battery`, `MP_Dumbo`, etc.
     - `rounds` - Number of rounds (default: 1)
     - `teams` - Array of team sizes, e.g., `[32, 32]` for 32v32 (default: [32, 32])
     - `balancing` - `none`, `skill`, or `squad` (default: skill)
     - `bots` - Bot configuration with team, count, and type (`fill` or `fixed`)
     - `rules` - Game rules/mutators with name and value
     - `joinability` - Join settings (joinInProgress, openJoin, invites)
     - `matchmaking` - Enable/disable matchmaking (default: false)
     - `spatial` - Custom 3D object placement from file
   - `rotation` - Map rotation: `loop`, `shuffle`, or `once` (default: loop)
   - `includeDenied` - Set to `true` to access unpublished experiences (optional)

2. Obtain your `x-gateway-session-id` from https://portal.battlefield.com/ and export it:

   ```bash
   export TS_BF6_GATEWAY_SESSION_ID=your-session-id
   ```

3. Run the deploy script from your project root:

   ```bash
   npx ts-bf6-deploy
   ```

   Use `--config <path>` if your configuration lives elsewhere.
