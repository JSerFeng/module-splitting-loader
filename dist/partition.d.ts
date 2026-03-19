import type { ModuleAnalysis, SCC, Part } from './types.js';
/**
 * Group SCCs into parts based on their export dependency sets.
 * SCCs depended on by the same set of exports go into the same part.
 * Returns null if splitting is not beneficial (≤1 part would result).
 */
export declare function partitionModule(analysis: ModuleAnalysis, sccs: SCC[], exportDeps: Map<number, Set<string>>): Part[] | null;
