import type { SCC } from './types.js';
/**
 * Tarjan's strongly connected components algorithm.
 * Returns SCCs in reverse topological order (dependencies come after dependents).
 */
export declare function findSCCs(adjList: Map<number, Set<number>>, nodeIds: number[]): SCC[];
/**
 * Build a condensed DAG from SCCs + original adjacency list.
 * Returns adjacency list of SCC ids (sccA depends on sccB).
 */
export declare function buildCondensedDAG(sccs: SCC[], adjList: Map<number, Set<number>>): Map<number, Set<number>>;
/**
 * For each SCC, compute which export names transitively depend on it.
 * An export depends on an SCC if its declaring statement is in that SCC
 * or in any SCC reachable through the condensed DAG.
 */
export declare function computeExportDeps(sccs: SCC[], condensedDAG: Map<number, Set<number>>, exports: {
    localName: string;
    exportedAs: string;
}[], bindingToStmt: Map<string, number>): Map<number, Set<string>>;
