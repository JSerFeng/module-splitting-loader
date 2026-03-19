import { analyzeModule } from './analyze.js';
import { collectReferences, buildDependencyGraph } from './graph.js';
import { findSCCs, buildCondensedDAG, computeExportDeps } from './scc.js';
import { partitionModule } from './partition.js';
import { generateFacade, generatePartSource } from './codegen.js';
import type { SplitResult } from './types.js';

/**
 * Core splitting function. Analyzes an ES module and splits it into
 * multiple parts for better tree-shaking.
 *
 * Returns null if splitting is not beneficial.
 */
export function splitModule(
  source: string,
  resourcePath: string,
): SplitResult | null {
  const analysis = analyzeModule(source);

  // Skip splitting if ≤1 export
  if (analysis.exports.length <= 1) {
    return null;
  }

  // Collect references for all statements
  collectReferences(analysis.statements, analysis.bindingToStmt);

  // Build dependency graph (only between declaration statements)
  const adjList = buildDependencyGraph(analysis.statements, analysis.bindingToStmt);

  // Find SCCs
  const nodeIds = [...adjList.keys()];
  const sccs = findSCCs(adjList, nodeIds);

  if (sccs.length === 0) {
    return null;
  }

  // Build condensed DAG
  const condensedDAG = buildCondensedDAG(sccs, adjList);

  // Compute export dependencies for each SCC
  const exportDeps = computeExportDeps(
    sccs,
    condensedDAG,
    analysis.exports,
    analysis.bindingToStmt,
  );

  // Partition SCCs into parts
  const parts = partitionModule(analysis, sccs, exportDeps);
  if (!parts) {
    return null;
  }

  // Generate code
  const facade = generateFacade(analysis, parts, resourcePath);
  const partSources = parts.map((p) =>
    generatePartSource(analysis, p, parts, resourcePath),
  );

  return { facade, partSources };
}

// Cache for loader: resourcePath → SplitResult | null
const cache = new Map<string, SplitResult | null>();

/**
 * Webpack/Rspack loader entry point.
 *
 * First invocation (no query): returns facade that re-exports from parts.
 * Subsequent invocations (?module-splitting-part=N): returns the Nth part.
 */
export default function moduleSplittingLoader(source: string): string {
  // @ts-expect-error -- loader context is provided by webpack/rspack
  const ctx = this as { resourcePath: string; resourceQuery: string };
  const resourcePath = ctx.resourcePath;
  const resourceQuery = ctx.resourceQuery || '';

  // Check if this is a part request
  const params = new URLSearchParams(
    resourceQuery.startsWith('?') ? resourceQuery.slice(1) : resourceQuery,
  );
  const partParam = params.get('module-splitting-part');

  if (partParam !== null) {
    // Part request: return cached part source
    const cached = cache.get(resourcePath);
    if (cached) {
      const idx = parseInt(partParam, 10);
      return cached.partSources[idx] ?? source;
    }
    // If not cached, analyze on the fly
    const result = splitModule(source, resourcePath);
    if (result) {
      cache.set(resourcePath, result);
      const idx = parseInt(partParam, 10);
      return result.partSources[idx] ?? source;
    }
    return source;
  }

  // First invocation: analyze and return facade
  const result = splitModule(source, resourcePath);
  cache.set(resourcePath, result);

  if (!result) {
    return source;
  }

  return result.facade;
}
