# module-splitting-loader

## Description

`module-splitting-loader` is a Webpack/Rspack loader that splits one ES module into smaller per-export parts.

The main goal is to improve chunking for cases like this:

- the initial chunk uses export `a` from `lib.js`
- an async chunk uses export `b` from the same `lib.js`

Without module splitting, the initial chunk can still include the code for `b`, because bundlers usually work at module granularity.

With module splitting, `a` and `b` become independently reachable parts, so async-only code can stay in the async chunk.

This repository includes a runnable example in [`example/basic-rspack`](./example/basic-rspack).

## Quick Start

Install dependencies and build the loader:

```bash
pnpm install
pnpm build
```

Run the example:

```bash
cd example/basic-rspack
pnpm compare
pnpm build
node dist/main.cjs
```

What the example shows:

- `src/index.js` uses `renderAboveTheFold` in the initial chunk
- `src/async-panel.js` uses `renderBelowTheFold` in the async chunk
- without the loader, `ASYNC_ONLY_B_MARKER` appears in `dist-no-loader/main.cjs`
- with the loader, `ASYNC_ONLY_B_MARKER` moves to `dist/async-panel.chunk.cjs` and is no longer in `dist/main.cjs`

Minimal Rspack config:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const loaderPath = path.resolve(__dirname, '../../dist/index.js');

export default {
  module: {
    rules: [
      {
        resourceQuery: /module-splitting-part=/,
        sideEffects: false,
      },
      {
        test: /lib\.js$/,
        use: [loaderPath],
      },
    ],
  },
};
```

For the full runnable setup, see [`example/basic-rspack/README.md`](./example/basic-rspack/README.md).
