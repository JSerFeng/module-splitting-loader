import type { SCC } from './types.js';

/**
 * Tarjan's strongly connected components algorithm.
 * Returns SCCs in reverse topological order (dependencies come after dependents).
 */
export function findSCCs(
  adjList: Map<number, Set<number>>,
  nodeIds: number[],
): SCC[] {
  let index = 0;
  const stack: number[] = [];
  const onStack = new Set<number>();
  const indices = new Map<number, number>();
  const lowlinks = new Map<number, number>();
  const sccs: SCC[] = [];
  let sccId = 0;

  function strongconnect(v: number) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adjList.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const component: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      sccs.push({ id: sccId++, stmtIndices: component });
    }
  }

  for (const v of nodeIds) {
    if (!indices.has(v)) {
      strongconnect(v);
    }
  }

  return sccs;
}

/**
 * Build a condensed DAG from SCCs + original adjacency list.
 * Returns adjacency list of SCC ids (sccA depends on sccB).
 */
export function buildCondensedDAG(
  sccs: SCC[],
  adjList: Map<number, Set<number>>,
): Map<number, Set<number>> {
  const stmtToSCC = new Map<number, number>();
  for (const scc of sccs) {
    for (const idx of scc.stmtIndices) {
      stmtToSCC.set(idx, scc.id);
    }
  }

  const dag = new Map<number, Set<number>>();
  for (const scc of sccs) {
    dag.set(scc.id, new Set());
  }

  for (const scc of sccs) {
    for (const stmtIdx of scc.stmtIndices) {
      for (const dep of adjList.get(stmtIdx) ?? []) {
        const depSCC = stmtToSCC.get(dep);
        if (depSCC !== undefined && depSCC !== scc.id) {
          dag.get(scc.id)!.add(depSCC);
        }
      }
    }
  }

  return dag;
}

/**
 * For each SCC, compute which export names transitively depend on it.
 * An export depends on an SCC if its declaring statement is in that SCC
 * or in any SCC reachable through the condensed DAG.
 */
export function computeExportDeps(
  sccs: SCC[],
  condensedDAG: Map<number, Set<number>>,
  exports: { localName: string; exportedAs: string }[],
  bindingToStmt: Map<string, number>,
): Map<number, Set<string>> {
  const stmtToSCC = new Map<number, number>();
  for (const scc of sccs) {
    for (const idx of scc.stmtIndices) {
      stmtToSCC.set(idx, scc.id);
    }
  }

  // For each SCC, which exports depend on it
  const result = new Map<number, Set<string>>();
  for (const scc of sccs) {
    result.set(scc.id, new Set());
  }

  for (const exp of exports) {
    const stmtIdx = bindingToStmt.get(exp.localName);
    if (stmtIdx === undefined) continue;
    const rootSCC = stmtToSCC.get(stmtIdx);
    if (rootSCC === undefined) continue;

    // BFS to find all SCCs reachable from rootSCC
    const visited = new Set<number>();
    const queue = [rootSCC];
    visited.add(rootSCC);

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.get(current)!.add(exp.exportedAs);

      for (const dep of condensedDAG.get(current) ?? []) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }
  }

  return result;
}
