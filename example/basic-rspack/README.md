# basic-rspack

This example shows the sync/async case where the initial chunk uses export `a`, an async chunk uses export `b`, and `module-splitting-loader` keeps `b` out of the initial chunk.

## Files

- `src/lib.js`: one module that exports both the initial-path code and the async-only code
- `src/index.js`: uses `renderAboveTheFold` in the initial chunk and dynamically imports `async-panel.js`
- `src/async-panel.js`: uses `renderBelowTheFold` in the async chunk
- `rspack.config.mjs`: enables the loader in `module.rules`
- `rspack.no-loader.config.mjs`: same build without the loader
- `build.mjs`: runs the build through the `@rspack/core` Node API
- `compare.mjs`: rebuilds both variants and checks the generated bundles

## Run

First, build the loader from the repository root:

```bash
pnpm build
```

Then run the example from this directory:

```bash
pnpm build
node dist/main.cjs
```

Expected output:

```text
main:ABOVE_THE_FOLD_OK
async:ASYNC_ONLY_B_MARKER:cyan:lime:amber
```

## What The Split Changes

`src/lib.js` contains:

- `renderAboveTheFold`, which is needed by the initial chunk
- `renderBelowTheFold`, which is only needed by the async chunk
- an `asyncOnlyPayload` constant that belongs only to `renderBelowTheFold`

With `module-splitting-loader` enabled:

- Rspack rewrites `lib.js` into a facade plus split parts
- the config marks `?module-splitting-part=` requests as `sideEffects: false` for this pure example, so Rspack can drop an unused split part from the initial graph
- the part for `renderAboveTheFold` stays in `main.cjs`
- the part for `renderBelowTheFold` moves to `async-panel.chunk.cjs`
- the initial chunk no longer carries the `ASYNC_ONLY_B_MARKER` payload

Without the loader:

- Rspack still treats `lib.js` as one module
- because the initial chunk already needs export `a`, the whole `lib.js` module ends up in the initial chunk
- the async-only payload for export `b` therefore appears in `main.cjs` too

This is the key point: normal tree shaking can mark exports as used or unused, but it still works at module granularity. If one sync path and one async path share the same `lib.js`, the sync chunk can end up paying for async-only code. Module splitting changes the module graph so that `a` and `b` become independently chunkable parts.

To verify the difference end-to-end:

```bash
pnpm compare
```

The comparison checks:

- `dist/main.cjs` does not contain `ASYNC_ONLY_B_MARKER`
- `dist/async-panel.chunk.cjs` does contain `ASYNC_ONLY_B_MARKER`
- `dist-no-loader/main.cjs` does contain `ASYNC_ONLY_B_MARKER`
- the split build makes the initial chunk smaller than the no-loader build

If you only want the integration snippet, the key part is in `rspack.config.mjs`:

```js
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
}
```

Here, `loaderPath` points to the built loader at the repository root: `dist/index.js`.
