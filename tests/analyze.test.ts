import { describe, test, expect } from '@rstest/core';
import { analyzeModule } from '../src/analyze.js';

describe('analyzeModule', () => {
  test('extracts imports', () => {
    const source = `import { foo, bar as baz } from 'lib';`;
    const result = analyzeModule(source);

    expect(result.statements.length).toBe(1);
    const stmt = result.statements[0];
    expect(stmt.importInfo).toBeDefined();
    expect(stmt.importInfo!.source).toBe('lib');
    expect(stmt.importInfo!.specifiers).toEqual([
      { localName: 'foo', importedName: 'foo' },
      { localName: 'baz', importedName: 'bar' },
    ]);
    expect(stmt.declaredBindings).toEqual(['foo', 'baz']);
    expect(result.bindingToStmt.get('foo')).toBe(0);
    expect(result.bindingToStmt.get('baz')).toBe(0);
  });

  test('extracts default imports', () => {
    const source = `import def from 'mod';`;
    const result = analyzeModule(source);
    const stmt = result.statements[0];
    expect(stmt.importInfo!.specifiers).toEqual([
      { localName: 'def', importedName: 'default' },
    ]);
  });

  test('extracts namespace imports', () => {
    const source = `import * as ns from 'mod';`;
    const result = analyzeModule(source);
    const stmt = result.statements[0];
    expect(stmt.importInfo!.specifiers).toEqual([
      { localName: 'ns', importedName: '*' },
    ]);
  });

  test('detects bare imports', () => {
    const source = `import './polyfill';`;
    const result = analyzeModule(source);
    expect(result.bareImports).toEqual(['./polyfill']);
    expect(result.statements[0].importInfo!.isBareImport).toBe(true);
  });

  test('extracts export declarations', () => {
    const source = `export const a = 1;\nexport function foo() {}`;
    const result = analyzeModule(source);

    expect(result.exports.length).toBe(2);
    expect(result.exports).toEqual([
      { localName: 'a', exportedAs: 'a' },
      { localName: 'foo', exportedAs: 'foo' },
    ]);

    // Code should have export keyword stripped (SWC span includes semicolon)
    expect(result.statements[0].code).toBe('const a = 1;');
    expect(result.statements[0].exportInfo!.kind).toBe('declaration');
  });

  test('extracts named exports (specifier style)', () => {
    const source = `const a = 1;\nconst b = 2;\nexport { a, b as c };`;
    const result = analyzeModule(source);

    expect(result.exports).toEqual([
      { localName: 'a', exportedAs: 'a' },
      { localName: 'b', exportedAs: 'c' },
    ]);
  });

  test('extracts re-exports', () => {
    const source = `export { x } from './mod';\nexport * from './other';`;
    const result = analyzeModule(source);

    expect(result.reExports.length).toBe(2);
    expect(result.exports.length).toBe(0); // re-exports are not in exports list
  });

  test('extracts default export declaration', () => {
    const source = `export default function greet() { return 'hi'; }`;
    const result = analyzeModule(source);

    expect(result.exports).toEqual([
      { localName: 'greet', exportedAs: 'default' },
    ]);
    expect(result.statements[0].exportInfo!.kind).toBe('default-decl');
  });

  test('extracts default export expression', () => {
    const source = `export default 42;`;
    const result = analyzeModule(source);

    expect(result.exports).toEqual([
      { localName: '__default__', exportedAs: 'default' },
    ]);
    expect(result.statements[0].exportInfo!.kind).toBe('default-expr');
  });

  test('detects side-effect statements', () => {
    const source = `console.log('init');\nexport const a = 1;\nexport const b = 2;`;
    const result = analyzeModule(source);

    expect(result.statements[0].isSideEffect).toBe(true);
    expect(result.statements[1].isSideEffect).toBe(false);
  });

  test('extracts plain declarations', () => {
    const source = `const x = 1;\nfunction helper() {}\nexport { x, helper };`;
    const result = analyzeModule(source);

    expect(result.bindingToStmt.get('x')).toBe(0);
    expect(result.bindingToStmt.get('helper')).toBe(1);
    expect(result.statements[0].declaredBindings).toEqual(['x']);
    expect(result.statements[1].declaredBindings).toEqual(['helper']);
  });
});
