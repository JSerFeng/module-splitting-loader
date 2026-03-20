import { describe, test, expect } from '@rstest/core';
import { splitModule } from '../src/index.js';

describe('splitModule', () => {
  test('splits two independent exports into separate parts', async () => {
    const source = `export const a = 1;\nexport const b = 2;`;
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();
    expect(result!.partSources.length).toBeGreaterThanOrEqual(2);

    // Facade should re-export both
    expect(result!.facade).toContain('export');
    expect(result!.facade).toContain('module-splitting-part=');

    // Each part should contain its declaration
    const allParts = result!.partSources.join('\n');
    expect(allParts).toContain('const a = 1');
    expect(allParts).toContain('const b = 2');
  });

  test('splits shared dependency into its own part', async () => {
    const source = [
      `import { helper } from 'lib';`,
      `const shared = helper();`,
      `const a = shared + 1;`,
      `const b = shared + 2;`,
      `export { a, b };`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();
    // Should have 3 parts: shared, a (imports shared), b (imports shared)
    expect(result!.partSources.length).toBe(3);

    // Part containing 'shared' should import from 'lib'
    const sharedPart = result!.partSources.find((p) =>
      p.includes('const shared'),
    );
    expect(sharedPart).toBeDefined();
    expect(sharedPart).toContain('from "lib"');
    expect(sharedPart).toContain('export { shared }');

    // Part containing 'a' should import shared from another part
    const partA = result!.partSources.find((p) => p.includes('const a'));
    expect(partA).toBeDefined();
    expect(partA).toContain('import { shared }');
    expect(partA).toContain('module-splitting-part=');

    // Part containing 'b' should also import shared
    const partB = result!.partSources.find((p) => p.includes('const b'));
    expect(partB).toBeDefined();
    expect(partB).toContain('import { shared }');
  });

  test('returns null for single export (no splitting needed)', async () => {
    const source = `export const x = 1;`;
    const result = await splitModule(source, '/test/mod.js');
    expect(result).toBeNull();
  });

  test('returns null for no exports', async () => {
    const source = `const x = 1;`;
    const result = await splitModule(source, '/test/mod.js');
    expect(result).toBeNull();
  });

  test('handles mutual recursion (SCC) — all in one part', async () => {
    const source = [
      `function a() { return b() + 1; }`,
      `function b() { return a() + 1; }`,
      `export { a, b };`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    // a and b form a cycle — they must stay in the same SCC.
    // Both exports depend on the same SCC → only 1 part → no split.
    expect(result).toBeNull();
  });

  test('preserves re-exports in facade', async () => {
    const source = [
      `export * from './other';`,
      `export const a = 1;`,
      `export const b = 2;`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();
    expect(result!.facade).toContain("export * from './other'");
  });

  test('handles default export + named export', async () => {
    const source = [
      `export default function greet() { return 'hi'; }`,
      `export const x = 1;`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();
    // Facade should re-export both default and named
    expect(result!.facade).toContain('default');
    expect(result!.facade).toContain('x');
  });

  test('handles side-effect statements', async () => {
    const source = [
      `console.log('init');`,
      `export const a = 1;`,
      `export const b = 2;`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();
    // Facade should be pure re-exports (no side-effect imports)
    const facade = result!.facade;
    const facadeImports = facade
      .split('\n')
      .filter((l) => l.startsWith('import') && !l.includes('export'));
    expect(facadeImports.length).toBe(0);

    // Side-effect part imports should be in content parts instead
    const contentParts = result!.partSources.filter(
      (p) => p.includes('export {'),
    );
    for (const part of contentParts) {
      const sideEffectImports = part
        .split('\n')
        .filter((l) => l.startsWith('import') && !l.includes('export'));
      expect(sideEffectImports.length).toBeGreaterThan(0);
    }
  });

  test('avoids circular import when side-effect references exported binding', async () => {
    const source = [
      `export const a = 1;`,
      `console.log(a);`,
      `export const b = 2;`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();
    // The side-effect part references `a`, so it imports from part containing `a`.
    // Part containing `a` must NOT import the side-effect part back (would cycle).
    const partWithA = result!.partSources.find(
      (p) => p.includes('const a') && p.includes('export {'),
    );
    expect(partWithA).toBeDefined();
    // partWithA should NOT have a bare import of the side-effect part
    const bareImports = partWithA!
      .split('\n')
      .filter(
        (l) =>
          l.startsWith('import "') || l.startsWith("import '"),
      );
    expect(bareImports.length).toBe(0);
  });

  test('distributes external imports to correct parts', async () => {
    const source = [
      `import { foo } from 'lib-a';`,
      `import { bar } from 'lib-b';`,
      `export const a = foo();`,
      `export const b = bar();`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();

    const partA = result!.partSources.find((p) => p.includes('const a'));
    const partB = result!.partSources.find((p) => p.includes('const b'));

    // Part a should import from lib-a but not lib-b
    expect(partA).toContain('from "lib-a"');
    expect(partA).not.toContain('from "lib-b"');

    // Part b should import from lib-b but not lib-a
    expect(partB).toContain('from "lib-b"');
    expect(partB).not.toContain('from "lib-a"');
  });

  test('complex: diamond dependency', async () => {
    const source = [
      `const base = 1;`,
      `const left = base + 1;`,
      `const right = base + 2;`,
      `const a = left + right;`,
      `export const expA = a;`,
      `export const expB = base;`,
    ].join('\n');
    const result = await splitModule(source, '/test/mod.js');

    expect(result).not.toBeNull();
    // All parts together should contain all declarations
    const allParts = result!.partSources.join('\n');
    expect(allParts).toContain('const base');
    expect(allParts).toContain('const left');
    expect(allParts).toContain('const right');

    // Facade should re-export expA and expB
    expect(result!.facade).toContain('expA');
    expect(result!.facade).toContain('expB');
  });
});
