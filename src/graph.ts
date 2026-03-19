import type { StatementInfo } from './types.js';

/**
 * Recursively walk an AST node and collect all Identifier values.
 * Conservative: collects ALL identifiers including property keys.
 * False positives only reduce splitting aggressiveness, never produce incorrect code.
 */
function collectAllIdentifiers(node: any, result: Set<string>): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectAllIdentifiers(item, result);
    }
    return;
  }

  if (node.type === 'Identifier' && typeof node.value === 'string') {
    result.add(node.value);
  }

  // Skip non-reference identifier positions to reduce false positives
  if (node.type === 'MemberExpression' && !node.computed) {
    // Only walk the object, not the property (obj.prop — prop is not a reference)
    collectAllIdentifiers(node.object, result);
    return;
  }

  if (
    node.type === 'KeyValueProperty' ||
    node.type === 'KeyValuePatternProperty'
  ) {
    // Skip non-computed keys, walk value
    if (node.computed) {
      collectAllIdentifiers(node.key, result);
    }
    collectAllIdentifiers(node.value, result);
    return;
  }

  if (node.type === 'MethodProperty' || node.type === 'GetterProperty' || node.type === 'SetterProperty') {
    // Skip method name, walk params and body
    if (node.computed) {
      collectAllIdentifiers(node.key, result);
    }
    collectAllIdentifiers(node.params, result);
    collectAllIdentifiers(node.body, result);
    return;
  }

  for (const key of Object.keys(node)) {
    if (key === 'span' || key === 'type') continue;
    collectAllIdentifiers(node[key], result);
  }
}

/**
 * For each non-import statement, collect identifier references
 * and intersect with known top-level bindings.
 * Mutates stmt.references in place.
 */
export function collectReferences(
  statements: StatementInfo[],
  bindingToStmt: Map<string, number>,
): void {
  const topLevelBindings = new Set(bindingToStmt.keys());

  for (const stmt of statements) {
    if (stmt.importInfo) continue; // skip imports

    const allIds = new Set<string>();
    collectAllIdentifiers(stmt.astNode, allIds);

    const ownBindings = new Set(stmt.declaredBindings);
    for (const id of allIds) {
      if (topLevelBindings.has(id) && !ownBindings.has(id)) {
        stmt.references.add(id);
      }
    }
  }
}

/**
 * Build a dependency graph (adjacency list) between declaration statements.
 * Only edges between non-import declaration statements are included.
 */
export function buildDependencyGraph(
  statements: StatementInfo[],
  bindingToStmt: Map<string, number>,
): Map<number, Set<number>> {
  const adjList = new Map<number, Set<number>>();

  // Initialize adjacency list for all declaration statements
  for (const stmt of statements) {
    if (stmt.importInfo || (stmt.exportInfo?.kind === 'named' && stmt.declaredBindings.length === 0)) {
      continue;
    }
    if (!stmt.isSideEffect) {
      adjList.set(stmt.index, new Set());
    }
  }

  for (const stmt of statements) {
    if (!adjList.has(stmt.index)) continue;

    for (const ref of stmt.references) {
      const depIdx = bindingToStmt.get(ref);
      if (depIdx === undefined) continue;
      // Only add edges to other declaration statements (not imports)
      const depStmt = statements[depIdx];
      if (depStmt.importInfo) continue;
      if (depIdx !== stmt.index) {
        adjList.get(stmt.index)!.add(depIdx);
      }
    }
  }

  return adjList;
}
