# ts-bf6-portal

Tooling to simplify BF6 Portal custom experiences (modding). Portal APIs themselves are property of EA.

## Features

:warning: EXPERIMENTAL :warning: 

The package exposes a `ts-bf6-deploy` CLI that bundles your script and uploads it to a Portal experience.

1. Create a `ts-bf6-portal.config.json` in your project (copy `ts-bf6-portal.config.sample.json` to get started):

   ```json
   {
     "experienceId": "your-experience-id",
     "bundle": {
       "entry": "src/index.ts",
       "outFile": "dist/portal-bundle.ts",
       "tsconfig": "tsconfig.json"
     }
   }
   ```

   `outFile` defaults to `dist/portal-bundle.ts` and `tsconfig` is optional.

   Set `includeDenied` to `true` in the root object if you need to access unpublished experiences.

2. Obtain your `x-gateway-session-id` from https://portal.battlefield.com/ and export it:

   ```bash
   export TS_BF6_GATEWAY_SESSION_ID=your-session-id
   ```

3. Run the deploy script from your project root:

   ```bash
   npx ts-bf6-deploy
   ```

   Use `--config <path>` if your configuration lives elsewhere.
