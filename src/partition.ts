import type {
  ModuleAnalysis,
  SCC,
  Part,
  ImportInfo,
  ImportedBinding,
} from './types.js';

function setKey(s: Set<string>): string {
  return [...s].sort().join('\0');
}

/**
 * Group SCCs into parts based on their export dependency sets.
 * SCCs depended on by the same set of exports go into the same part.
 * Returns null if splitting is not beneficial (≤1 part would result).
 */
export function partitionModule(
  analysis: ModuleAnalysis,
  sccs: SCC[],
  exportDeps: Map<number, Set<string>>,
): Part[] | null {
  // Group SCCs by export dependency set
  const groups = new Map<string, SCC[]>();
  for (const scc of sccs) {
    const deps = exportDeps.get(scc.id) ?? new Set();
    const key = setKey(deps);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(scc);
  }

  // Collect side-effect statements (not in any SCC)
  const sccStmts = new Set<number>();
  for (const scc of sccs) {
    for (const idx of scc.stmtIndices) {
      sccStmts.add(idx);
    }
  }
  const sideEffectStmts = analysis.statements
    .filter((s) => s.isSideEffect && !sccStmts.has(s.index))
    .map((s) => s.index);

  const hasSideEffects = sideEffectStmts.length > 0;
  const totalParts = groups.size + (hasSideEffects ? 1 : 0);

  if (totalParts <= 1) return null;

  // Build parts
  const parts: Part[] = [];
  let partIndex = 0;

  // Side-effect part comes first (index 0 if it exists)
  if (hasSideEffects) {
    parts.push({
      index: partIndex++,
      stmtIndices: sideEffectStmts,
      exportDepSet: new Set(), // empty = always imported
      providedBindings: [],
      requiredBindings: new Map(),
      externalImports: [],
    });
  }

  // Export parts
  for (const [, groupSCCs] of groups) {
    const stmtIndices = groupSCCs.flatMap((scc) => scc.stmtIndices);
    const exportDepSet = exportDeps.get(groupSCCs[0].id) ?? new Set();

    const providedBindings: string[] = [];
    for (const idx of stmtIndices) {
      providedBindings.push(...analysis.statements[idx].declaredBindings);
    }

    parts.push({
      index: partIndex++,
      stmtIndices,
      exportDepSet,
      providedBindings,
      requiredBindings: new Map(),
      externalImports: [],
    });
  }

  // Build a map: binding → part index (which part provides it)
  const bindingToPartIndex = new Map<string, number>();
  for (const part of parts) {
    for (const b of part.providedBindings) {
      bindingToPartIndex.set(b, part.index);
    }
  }

  // Compute inter-part dependencies and external imports for each part
  for (const part of parts) {
    const neededImportBindings = new Map<string, Set<string>>(); // source → set of importedName

    for (const stmtIdx of part.stmtIndices) {
      const stmt = analysis.statements[stmtIdx];
      for (const ref of stmt.references) {
        const declStmtIdx = analysis.bindingToStmt.get(ref);
        if (declStmtIdx === undefined) continue;

        const declStmt = analysis.statements[declStmtIdx];

        if (declStmt.importInfo && !declStmt.importInfo.isBareImport) {
          // External import: find the specific specifier for this binding
          const spec = declStmt.importInfo.specifiers.find(
            (s) => s.localName === ref,
          );
          if (spec) {
            const src = declStmt.importInfo.source;
            if (!neededImportBindings.has(src)) {
              neededImportBindings.set(src, new Set());
            }
            // Store as localName:importedName
            neededImportBindings.get(src)!.add(`${ref}:${spec.importedName}`);
          }
        } else {
          // Inter-part dependency
          const otherPartIdx = bindingToPartIndex.get(ref);
          if (otherPartIdx !== undefined && otherPartIdx !== part.index) {
            part.requiredBindings.set(ref, otherPartIdx);
          }
        }
      }
    }

    // Build external import infos
    for (const [source, specStrs] of neededImportBindings) {
      const specifiers: ImportedBinding[] = [];
      for (const s of specStrs) {
        const [localName, importedName] = s.split(':');
        specifiers.push({ localName, importedName });
      }
      part.externalImports.push({
        source,
        specifiers,
        isBareImport: false,
      });
    }
  }

  return parts;
}
