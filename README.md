# ts-bf6-portal

TypeScript helpers and Portal runtime declaration files extracted from The Sir. Community Battlefield 2042 tooling. This package packages the generated `mod` runtime definitions alongside a curated set of helper utilities that were formerly shipped inside the `battleracer6` project.

## Installation

```bash
npm install ts-bf6-portal
```

## Usage

Import helpers directly from the package:

```ts
import { And, getPlayersInTeam } from 'ts-bf6-portal';

if (And(playerIsAlive(), playerHasObjective())) {
  const teammates = getPlayersInTeam(team);
  // ...
}
```

The Portal runtime (`mod` namespace) is exposed as global declarations. Ensure they are available to the TypeScript compiler by adding the package globals to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": [
      "ts-bf6-portal/globals"
    ]
  }
}
```

## Development

```bash
npm install
npm run build
```

The build step emits ESM JavaScript and declaration files into `dist/` and ensures the generated module declarations reference the global Portal typings.

## Publishing

`npm publish` will automatically run the build to guarantee fresh artifacts.

## License

The original Portal declarations remain subject to their upstream terms. All additional code is © The Sir. Community.
