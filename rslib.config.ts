import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: 'es2021',
      dts: {
        autoExtension: true,
      },
    },
    {
      format: 'cjs',
      syntax: 'es2021',
      dts: {
        autoExtension: true,
      },
    },
  ],
  source: {
    entry: {
      index: './src/index.ts',
    },
  },
  output: {
    target: 'node',
    externals: [/^@swc\//],
  },
});
