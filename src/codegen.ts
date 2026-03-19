import type { ModuleAnalysis, Part } from './types.js';

function generateImportSpec(importedName: string, localName: string): string {
  if (importedName === 'default') {
    return localName;
  }
  if (importedName === '*') {
    return `* as ${localName}`;
  }
  if (importedName === localName) {
    return localName;
  }
  return `${importedName} as ${localName}`;
}

/**
 * Generate the facade module that re-exports from parts.
 */
export function generateFacade(
  analysis: ModuleAnalysis,
  parts: Part[],
  resourcePath: string,
): string {
  const lines: string[] = [];

  // Re-export from each part that has exports
  // Note: bare imports and side-effect part imports are NOT placed here.
  // They are emitted in each content part instead, so the facade remains
  // a pure re-export module that bundlers can fully inline via scope hoisting.
  // Build a map: partIndex → export entries for that part
  const partExportMap = new Map<number, { localName: string; exportedAs: string }[]>();

  for (const exp of analysis.exports) {
    // Find which part contains the statement that declares this export's local binding
    const stmtIdx = analysis.bindingToStmt.get(exp.localName);
    if (stmtIdx === undefined) continue;

    for (const part of parts) {
      if (part.stmtIndices.includes(stmtIdx)) {
        if (!partExportMap.has(part.index)) {
          partExportMap.set(part.index, []);
        }
        partExportMap.get(part.index)!.push(exp);
        break;
      }
    }
  }

  for (const part of parts) {
    const exportedNames = partExportMap.get(part.index);
    if (!exportedNames || exportedNames.length === 0) continue;

    const specifiers = exportedNames.map((e) => {
      if (e.localName === e.exportedAs) return e.exportedAs;
      return `${e.localName} as ${e.exportedAs}`;
    });

    lines.push(
      `export { ${specifiers.join(', ')} } from ${JSON.stringify(resourcePath + '?module-splitting-part=' + part.index)};`,
    );
  }

  // Re-exports pass through unchanged
  for (const re of analysis.reExports) {
    lines.push(re.code);
  }

  return lines.join('\n');
}

/**
 * Generate the source code for a single part module.
 */
export function generatePartSource(
  analysis: ModuleAnalysis,
  part: Part,
  allParts: Part[],
  resourcePath: string,
): string {
  const lines: string[] = [];

  const isSideEffectPart =
    part.exportDepSet.size === 0 && part.stmtIndices.length > 0;

  // 1. Bare imports (from the original module)
  for (const src of analysis.bareImports) {
    lines.push(`import ${JSON.stringify(src)};`);
  }

  // 2. Import side-effect parts (only for content parts, not for side-effect parts themselves)
  if (!isSideEffectPart) {
    for (const other of allParts) {
      if (
        other.index !== part.index &&
        other.exportDepSet.size === 0 &&
        other.stmtIndices.length > 0
      ) {
        lines.push(
          `import ${JSON.stringify(resourcePath + '?module-splitting-part=' + other.index)};`,
        );
      }
    }
  }

  // 3. External imports this part needs
  for (const imp of part.externalImports) {
    if (imp.isBareImport) {
      lines.push(`import ${JSON.stringify(imp.source)};`);
    } else {
      const defaultSpec = imp.specifiers.find(
        (s) => s.importedName === 'default',
      );
      const nsSpec = imp.specifiers.find((s) => s.importedName === '*');
      const namedSpecs = imp.specifiers.filter(
        (s) => s.importedName !== 'default' && s.importedName !== '*',
      );

      if (nsSpec) {
        lines.push(
          `import * as ${nsSpec.localName} from ${JSON.stringify(imp.source)};`,
        );
      }

      if (defaultSpec || namedSpecs.length > 0) {
        const parts: string[] = [];
        if (defaultSpec) {
          parts.push(defaultSpec.localName);
        }
        if (namedSpecs.length > 0) {
          const specs = namedSpecs.map((s) =>
            generateImportSpec(s.importedName, s.localName),
          );
          parts.push(`{ ${specs.join(', ')} }`);
        }
        lines.push(
          `import ${parts.join(', ')} from ${JSON.stringify(imp.source)};`,
        );
      }
    }
  }

  // 4. Inter-part imports
  const partImports = new Map<number, string[]>();
  for (const [binding, partIdx] of part.requiredBindings) {
    if (!partImports.has(partIdx)) partImports.set(partIdx, []);
    partImports.get(partIdx)!.push(binding);
  }
  for (const [partIdx, bindings] of partImports) {
    const sorted = [...bindings].sort();
    lines.push(
      `import { ${sorted.join(', ')} } from ${JSON.stringify(resourcePath + '?module-splitting-part=' + partIdx)};`,
    );
  }

  // 5. Declaration code (in original order)
  const sortedIndices = [...part.stmtIndices].sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    const stmt = analysis.statements[idx];
    let code = stmt.code;

    if (stmt.exportInfo?.kind === 'default-expr') {
      // export default <expr> → const __default__ = <expr>;
      // stmt.code already contains just the expression (set in analyze)
      code = `const __default__ = ${stmt.code};`;
    }

    lines.push(code);
  }

  // 6. Compute which bindings to export from this part
  // Export bindings that are: (a) original module exports, or (b) needed by other parts
  const bindingsToExport = new Set<string>();
  for (const b of part.providedBindings) {
    // Check if it's an original export
    if (analysis.exports.some((e) => e.localName === b)) {
      bindingsToExport.add(b);
    }
    // Check if another part needs it
    for (const other of allParts) {
      if (other.index === part.index) continue;
      if (other.requiredBindings.has(b)) {
        bindingsToExport.add(b);
      }
    }
  }

  if (bindingsToExport.size > 0) {
    const sorted = [...bindingsToExport].sort();
    lines.push(`export { ${sorted.join(', ')} };`);
  }

  return lines.join('\n');
}
