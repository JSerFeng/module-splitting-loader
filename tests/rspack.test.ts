import { describe, test, expect } from '@rstest/core';
import { rspack } from '@rspack/core';
import type { Stats, RspackOptions } from '@rspack/core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createModuleRules } from '../src/index.js';

const LOADER_PATH = path.resolve(process.cwd(), 'dist', 'index.js');
const _require = createRequire(import.meta.url);

function createFixture(files: Record<string, string>): {
  dir: string;
  outDir: string;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msl-rspack-'));
  const outDir = path.join(dir, 'dist');
  for (const [name, content] of Object.entries(files)) {
    const filepath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content);
  }
  return { dir, outDir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function build(config: RspackOptions): Promise<Stats> {
  return new Promise((resolve, reject) => {
    const compiler = rspack(config);
    compiler.run((err, stats) => {
      if (err) return reject(err);
      compiler.close(() => {});
      resolve(stats!);
    });
  });
}

function loadBundle(filePath: string): any {
  delete _require.cache[filePath];
  return _require(filePath);
}

function makeConfig(
  context: string,
  outDir: string,
  entry: RspackOptions['entry'],
  extra: Partial<RspackOptions> = {},
): RspackOptions {
  return {
    context,
    entry,
    output: {
      path: outDir,
      filename: '[name].js',
      library: { type: 'commonjs2' },
      clean: true,
      ...extra.output,
    },
    module: {
      rules: [{ test: /\.js$/, use: [LOADER_PATH] }],
    },
    optimization: { minimize: false, ...extra.optimization },
    target: 'node',
    ...extra,
    // Ensure nested overrides don't clobber top-level keys
    output: { path: outDir, filename: '[name].js', library: { type: 'commonjs2' }, clean: true, ...extra.output },
    module: { rules: [{ test: /\.js$/, use: [LOADER_PATH] }] },
  };
}

describe('rspack integration', () => {
  test('builds and produces correct exports for independent exports', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'lib.js': [
        'export const a = () => 42;',
        'export const b = () => 99;',
      ].join('\n'),
      'entry.js': "export { a, b } from './lib';",
    });

    try {
      const stats = await build(makeConfig(dir, outDir, './entry.js'));
      expect(stats.hasErrors()).toBe(false);

      const result = loadBundle(path.join(outDir, 'main.js'));
      expect(result.a()).toBe(42);
      expect(result.b()).toBe(99);
    } finally {
      cleanup();
    }
  });

  test('builds source with leading whitespace without parse errors', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'lib.js': '\n\nconsole.log("hello")\n\nexport const a = () => 42\n\nexport const b = () => 42',
      'entry.js': "export { a, b } from './lib';",
    });

    try {
      const stats = await build(makeConfig(dir, outDir, './entry.js'));

      const errors = stats.toJson({ errors: true }).errors;
      expect(errors).toEqual([]);

      const result = loadBundle(path.join(outDir, 'main.js'));
      expect(result.a()).toBe(42);
      expect(result.b()).toBe(42);
    } finally {
      cleanup();
    }
  });

  test('preserves side-effect statements', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'lib.js': [
        'globalThis.__sideEffect = true;',
        'export const a = () => 1;',
        'export const b = () => 2;',
      ].join('\n'),
      'entry.js': "export { a, b } from './lib';",
    });

    try {
      const stats = await build(makeConfig(dir, outDir, './entry.js'));
      expect(stats.hasErrors()).toBe(false);

      const output = fs.readFileSync(path.join(outDir, 'main.js'), 'utf-8');
      expect(output).toContain('__sideEffect');
    } finally {
      cleanup();
    }
  });

  test('handles shared dependencies between exports', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'lib.js': [
        'const shared = 10;',
        'export const a = () => shared + 1;',
        'export const b = () => shared + 2;',
      ].join('\n'),
      'entry.js': "export { a, b } from './lib';",
    });

    try {
      const stats = await build(makeConfig(dir, outDir, './entry.js'));
      expect(stats.hasErrors()).toBe(false);

      const result = loadBundle(path.join(outDir, 'main.js'));
      expect(result.a()).toBe(11);
      expect(result.b()).toBe(12);
    } finally {
      cleanup();
    }
  });

  test('tree-shakes unused exports', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'lib.js': [
        'export const a = () => "USED_EXPORT_A";',
        'export const b = () => "UNUSED_EXPORT_B";',
      ].join('\n'),
      'entry.js': [
        "import { a } from './lib';",
        'export const result = a();',
      ].join('\n'),
    });

    try {
      const stats = await build(
        makeConfig(dir, outDir, './entry.js', {
          optimization: {
            minimize: false,
            usedExports: true,
            providedExports: true,
            sideEffects: true,
          },
        }),
      );
      expect(stats.hasErrors()).toBe(false);

      const output = fs.readFileSync(path.join(outDir, 'main.js'), 'utf-8');
      expect(output).toContain('USED_EXPORT_A');
      expect(output).not.toContain('UNUSED_EXPORT_B');
    } finally {
      cleanup();
    }
  });

  test('handles default export combined with named exports', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'lib.js': [
        'export default function greet() { return "hello"; }',
        'export const x = 42;',
      ].join('\n'),
      'entry.js': [
        "import greet, { x } from './lib';",
        'export const msg = greet();',
        'export const val = x;',
      ].join('\n'),
    });

    try {
      const stats = await build(makeConfig(dir, outDir, './entry.js'));
      expect(stats.hasErrors()).toBe(false);

      const result = loadBundle(path.join(outDir, 'main.js'));
      expect(result.msg).toBe('hello');
      expect(result.val).toBe(42);
    } finally {
      cleanup();
    }
  });

  test('splits parts into separate entry chunks with createModuleRules', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'lib.js': [
        "console.log('side-effect');",
        'export const a = () => "VALUE_A";',
        'export const b = () => "VALUE_B";',
      ].join('\n'),
      'entry1.js': "import { a } from './lib';\na;",
      'entry2.js': "import { b } from './lib';\nb;",
    });

    try {
      const rules = createModuleRules({ test: /\.js$/, use: [LOADER_PATH] });
      const stats = await build({
        context: dir,
        entry: { entry1: './entry1.js', entry2: './entry2.js' },
        output: { path: outDir, filename: '[name].js', clean: true },
        module: { rules },
        optimization: { minimize: false },
        target: 'node',
      });
      expect(stats.hasErrors()).toBe(false);

      const files = fs.readdirSync(outDir).sort();
      const readFile = (name: string) =>
        fs.readFileSync(path.join(outDir, name), 'utf-8');

      // entry1 should contain VALUE_A but NOT VALUE_B
      const entry1 = readFile('entry1.js');
      expect(entry1).toContain('VALUE_A');
      expect(entry1).not.toContain('VALUE_B');

      // entry2 should contain VALUE_B but NOT VALUE_A
      const entry2 = readFile('entry2.js');
      expect(entry2).toContain('VALUE_B');
      expect(entry2).not.toContain('VALUE_A');

      // Side-effect should be in a shared chunk, not removed
      const allContent = files.map((f) => readFile(f)).join('\n');
      expect(allContent).toContain('side-effect');
    } finally {
      cleanup();
    }
  });

  test('handles external imports distributed to correct parts', async () => {
    const { dir, outDir, cleanup } = createFixture({
      'node_modules/lib-a/index.js': 'module.exports.foo = () => "A";',
      'node_modules/lib-a/package.json': '{"name":"lib-a","main":"index.js"}',
      'node_modules/lib-b/index.js': 'module.exports.bar = () => "B";',
      'node_modules/lib-b/package.json': '{"name":"lib-b","main":"index.js"}',
      'lib.js': [
        "import { foo } from 'lib-a';",
        "import { bar } from 'lib-b';",
        'export const a = () => foo();',
        'export const b = () => bar();',
      ].join('\n'),
      'entry.js': "export { a, b } from './lib';",
    });

    try {
      const stats = await build(makeConfig(dir, outDir, './entry.js'));
      expect(stats.hasErrors()).toBe(false);

      const result = loadBundle(path.join(outDir, 'main.js'));
      expect(result.a()).toBe('A');
      expect(result.b()).toBe('B');
    } finally {
      cleanup();
    }
  });
});
