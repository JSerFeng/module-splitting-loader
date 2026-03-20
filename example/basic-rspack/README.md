# basic-rspack

This example shows how to use `module-splitting-loader` in Rspack.

## Files

- `src/features.js`: an ES module that will be split by the loader
- `src/index.js`: imports and uses only one export from `features.js`
- `rspack.config.mjs`: enables the loader in `module.rules`
- `build.mjs`: runs the build through the `@rspack/core` Node API

## Run

First, build the loader from the repository root:

```bash
pnpm build
```

Then run the example from this directory:

```bash
pnpm build
node dist/main.js
```

Expected output:

```text
Hello, Rspack!
```

## What The Split Changes

In this example, `src/features.js` exports both `greet` and `farewell`, but the entry only imports `greet`.

With `module-splitting-loader` enabled:

- Rspack loads a generated split part such as `./src/features.js?module-splitting-part=0`
- the final bundle keeps only the part that contains `greet`
- the unused `farewell` export is not emitted into `dist/main.js`

Without the loader:

- Rspack still bundles the original `./src/features.js` as a single module
- because `minimize` is disabled in this example, the unused `farewell` function still appears in `dist-no-loader/main.js`
- this makes the output larger and shows the exact problem that the loader is solving here

You can verify the difference directly:

```bash
rg "UNUSED_EXAMPLE_EXPORT" dist/main.js
pnpm build:no-loader
rg "UNUSED_EXAMPLE_EXPORT" dist-no-loader/main.js
```

Expected result:

- `dist/main.js`: no match
- `dist-no-loader/main.js`: contains `UNUSED_EXAMPLE_EXPORT`

In the current build, the split bundle is also smaller:

- `dist/main.js`: 564 bytes
- `dist-no-loader/main.js`: 622 bytes

If you only want the integration snippet, the key part is in `rspack.config.mjs`:

```js
module: {
  rules: [
    {
      test: /features\.js$/,
      use: [loaderPath],
    },
  ],
}
```

Here, `loaderPath` points to the built loader at the repository root: `dist/index.js`.
