import { parse } from '@swc/core';
import type {
  ModuleAnalysis,
  StatementInfo,
  ImportInfo,
  ExportInfo,
  ExportedName,
  ReExport,
} from './types.js';

function extractBindingsFromPattern(pattern: any): string[] {
  if (!pattern) return [];
  switch (pattern.type) {
    case 'Identifier':
      return [pattern.value];
    case 'ArrayPattern':
      return (pattern.elements ?? []).flatMap((el: any) =>
        el ? extractBindingsFromPattern(el) : [],
      );
    case 'ObjectPattern':
      return (pattern.properties ?? []).flatMap((prop: any) => {
        if (prop.type === 'AssignmentPatternProperty') {
          return extractBindingsFromPattern(prop.key);
        }
        if (prop.type === 'KeyValuePatternProperty') {
          return extractBindingsFromPattern(prop.value);
        }
        if (prop.type === 'RestElement') {
          return extractBindingsFromPattern(prop.argument);
        }
        return [];
      });
    case 'AssignmentPattern':
      return extractBindingsFromPattern(pattern.left);
    case 'RestElement':
      return extractBindingsFromPattern(pattern.argument);
    default:
      return [];
  }
}

function extractBindingsFromDeclaration(decl: any): string[] {
  switch (decl.type) {
    case 'VariableDeclaration':
      return decl.declarations.flatMap((d: any) =>
        extractBindingsFromPattern(d.id),
      );
    case 'FunctionDeclaration':
      return decl.identifier ? [decl.identifier.value] : [];
    case 'ClassDeclaration':
      return decl.identifier ? [decl.identifier.value] : [];
    default:
      return [];
  }
}

export async function analyzeModule(source: string): Promise<ModuleAnalysis> {
  const ast = await parse(source, {
    syntax: 'ecmascript',
    target: 'es2022',
  });

  // SWC spans are 1-indexed; subtract the module's base offset
  const baseOffset = ast.span.start;
  const slice = (span: { start: number; end: number }) =>
    source.slice(span.start - baseOffset, span.end - baseOffset);

  const statements: StatementInfo[] = [];
  const bindingToStmt = new Map<string, number>();
  const exports: ExportedName[] = [];
  const reExports: ReExport[] = [];
  const bareImports: string[] = [];

  for (let i = 0; i < ast.body.length; i++) {
    const item = ast.body[i];
    const code = slice(item.span);

    const stmt: StatementInfo = {
      index: i,
      code,
      declaredBindings: [],
      references: new Set(),
      isSideEffect: false,
      astNode: item,
    };

    switch (item.type) {
      case 'ImportDeclaration': {
        const specifiers = item.specifiers ?? [];
        if (specifiers.length === 0) {
          bareImports.push(item.source.value);
          stmt.importInfo = {
            source: item.source.value,
            specifiers: [],
            isBareImport: true,
          };
        } else {
          const importedBindings = specifiers.map((spec: any) => {
            let importedName: string;
            if (spec.type === 'ImportDefaultSpecifier') {
              importedName = 'default';
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              importedName = '*';
            } else {
              // ImportSpecifier (named)
              importedName = spec.imported?.value ?? spec.local.value;
            }
            return {
              localName: spec.local.value,
              importedName,
            };
          });
          stmt.importInfo = {
            source: item.source.value,
            specifiers: importedBindings,
            isBareImport: false,
          };
          stmt.declaredBindings = importedBindings.map((b) => b.localName);
        }
        break;
      }

      case 'ExportDeclaration': {
        const decl = item.declaration;
        const bindings = extractBindingsFromDeclaration(decl);
        stmt.declaredBindings = bindings;
        // Use the inner declaration's span for code (without 'export ')
        stmt.code = slice(decl.span);
        stmt.astNode = decl;
        const exportedNames = bindings.map((b) => ({
          localName: b,
          exportedAs: b,
        }));
        stmt.exportInfo = {
          kind: 'declaration',
          exportedNames,
        };
        exports.push(...exportedNames);
        break;
      }

      case 'ExportDefaultDeclaration': {
        const decl = item.decl as any;
        const name =
          decl.identifier?.value ?? '__default__';
        stmt.declaredBindings = [name];
        // Strip 'export default ' from the code
        stmt.code = slice(decl.span);
        stmt.astNode = decl;
        const exportedName = { localName: name, exportedAs: 'default' };
        stmt.exportInfo = {
          kind: 'default-decl',
          exportedNames: [exportedName],
        };
        exports.push(exportedName);
        break;
      }

      case 'ExportDefaultExpression': {
        const name = '__default__';
        stmt.declaredBindings = [name];
        stmt.astNode = item.expression;
        // Store just the expression code; codegen will wrap it
        stmt.code = slice((item.expression as any).span);
        const exportedName = { localName: name, exportedAs: 'default' };
        stmt.exportInfo = {
          kind: 'default-expr',
          exportedNames: [exportedName],
        };
        exports.push(exportedName);
        break;
      }

      case 'ExportNamedDeclaration': {
        if (item.source) {
          // Re-export: export { x } from 'mod'
          reExports.push({ code });
        } else {
          // Named export: export { a, b as c }
          const exportedNames = (item.specifiers ?? []).map((spec: any) => {
            const orig =
              spec.orig?.value ?? spec.orig?.value;
            const exported =
              spec.exported?.value ?? orig;
            return { localName: orig, exportedAs: exported };
          });
          stmt.exportInfo = {
            kind: 'named',
            exportedNames,
          };
          exports.push(...exportedNames);
        }
        break;
      }

      case 'ExportAllDeclaration': {
        reExports.push({ code });
        break;
      }

      default: {
        // Could be a declaration or a side-effect statement
        const isDecl = [
          'VariableDeclaration',
          'FunctionDeclaration',
          'ClassDeclaration',
        ].includes(item.type);
        if (isDecl) {
          stmt.declaredBindings = extractBindingsFromDeclaration(item);
        } else {
          stmt.isSideEffect = true;
        }
        break;
      }
    }

    statements.push(stmt);
    for (const b of stmt.declaredBindings) {
      bindingToStmt.set(b, i);
    }
  }

  return {
    statements,
    bindingToStmt,
    exports,
    reExports,
    bareImports,
    source,
  };
}
