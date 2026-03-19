import type { StatementInfo } from './types.js';
/**
 * For each non-import statement, collect identifier references
 * and intersect with known top-level bindings.
 * Mutates stmt.references in place.
 */
export declare function collectReferences(statements: StatementInfo[], bindingToStmt: Map<string, number>): void;
/**
 * Build a dependency graph (adjacency list) between declaration statements.
 * Only edges between non-import declaration statements are included.
 */
export declare function buildDependencyGraph(statements: StatementInfo[], bindingToStmt: Map<string, number>): Map<number, Set<number>>;
