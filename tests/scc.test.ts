import { describe, test, expect } from '@rstest/core';
import { findSCCs, buildCondensedDAG, computeExportDeps } from '../src/scc.js';

describe('findSCCs', () => {
  test('no edges — each node is its own SCC', () => {
    const adj = new Map<number, Set<number>>([
      [0, new Set()],
      [1, new Set()],
      [2, new Set()],
    ]);
    const sccs = findSCCs(adj, [0, 1, 2]);
    expect(sccs.length).toBe(3);
    for (const scc of sccs) {
      expect(scc.stmtIndices.length).toBe(1);
    }
  });

  test('linear chain — each node is its own SCC', () => {
    // 0 → 1 → 2
    const adj = new Map<number, Set<number>>([
      [0, new Set([1])],
      [1, new Set([2])],
      [2, new Set()],
    ]);
    const sccs = findSCCs(adj, [0, 1, 2]);
    expect(sccs.length).toBe(3);
  });

  test('simple cycle — two nodes form one SCC', () => {
    // 0 ↔ 1
    const adj = new Map<number, Set<number>>([
      [0, new Set([1])],
      [1, new Set([0])],
    ]);
    const sccs = findSCCs(adj, [0, 1]);
    expect(sccs.length).toBe(1);
    expect(sccs[0].stmtIndices.sort()).toEqual([0, 1]);
  });

  test('three-node cycle', () => {
    // 0 → 1 → 2 → 0
    const adj = new Map<number, Set<number>>([
      [0, new Set([1])],
      [1, new Set([2])],
      [2, new Set([0])],
    ]);
    const sccs = findSCCs(adj, [0, 1, 2]);
    expect(sccs.length).toBe(1);
    expect(sccs[0].stmtIndices.sort()).toEqual([0, 1, 2]);
  });

  test('mixed — cycle plus independent node', () => {
    // 0 ↔ 1, 2 independent
    const adj = new Map<number, Set<number>>([
      [0, new Set([1])],
      [1, new Set([0])],
      [2, new Set()],
    ]);
    const sccs = findSCCs(adj, [0, 1, 2]);
    expect(sccs.length).toBe(2);
    const sizes = sccs.map((s) => s.stmtIndices.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  test('diamond — no cycle', () => {
    // 0 → 1, 0 → 2, 1 → 3, 2 → 3
    const adj = new Map<number, Set<number>>([
      [0, new Set([1, 2])],
      [1, new Set([3])],
      [2, new Set([3])],
      [3, new Set()],
    ]);
    const sccs = findSCCs(adj, [0, 1, 2, 3]);
    expect(sccs.length).toBe(4);
  });
});

describe('buildCondensedDAG', () => {
  test('builds correct DAG from SCCs', () => {
    // Original: 0 ↔ 1, both → 2
    const adj = new Map<number, Set<number>>([
      [0, new Set([1, 2])],
      [1, new Set([0, 2])],
      [2, new Set()],
    ]);
    const sccs = findSCCs(adj, [0, 1, 2]);
    const dag = buildCondensedDAG(sccs, adj);

    // Should have 2 SCC nodes
    expect(dag.size).toBe(2);

    // The cycle SCC should depend on the SCC containing node 2
    const cycleSCC = sccs.find((s) => s.stmtIndices.length === 2)!;
    const singleSCC = sccs.find((s) => s.stmtIndices.includes(2))!;
    expect(dag.get(cycleSCC.id)!.has(singleSCC.id)).toBe(true);
    expect(dag.get(singleSCC.id)!.size).toBe(0);
  });
});

describe('computeExportDeps', () => {
  test('transitive export dependencies', () => {
    // SCC0 = {0} (declares "a"), SCC1 = {1} (declares "shared")
    // 0 depends on 1 (a depends on shared)
    // Export "a" depends transitively on both SCC0 and SCC1
    // Export "b" (in SCC2 = {2}) depends only on SCC2
    const adj = new Map<number, Set<number>>([
      [0, new Set([1])],
      [1, new Set()],
      [2, new Set()],
    ]);
    const sccs = findSCCs(adj, [0, 1, 2]);
    const dag = buildCondensedDAG(sccs, adj);

    const bindingToStmt = new Map([
      ['a', 0],
      ['shared', 1],
      ['b', 2],
    ]);
    const exports = [
      { localName: 'a', exportedAs: 'a' },
      { localName: 'b', exportedAs: 'b' },
    ];

    const deps = computeExportDeps(sccs, dag, exports, bindingToStmt);

    // SCC containing stmt 0: depended on by export "a"
    const scc0 = sccs.find((s) => s.stmtIndices.includes(0))!;
    expect(deps.get(scc0.id)!.has('a')).toBe(true);
    expect(deps.get(scc0.id)!.has('b')).toBe(false);

    // SCC containing stmt 1 (shared): depended on by export "a" (transitively)
    const scc1 = sccs.find((s) => s.stmtIndices.includes(1))!;
    expect(deps.get(scc1.id)!.has('a')).toBe(true);

    // SCC containing stmt 2: depended on by export "b"
    const scc2 = sccs.find((s) => s.stmtIndices.includes(2))!;
    expect(deps.get(scc2.id)!.has('b')).toBe(true);
    expect(deps.get(scc2.id)!.has('a')).toBe(false);
  });
});
