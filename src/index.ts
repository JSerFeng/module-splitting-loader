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
export async function splitModule(
  source: string,
  resourcePath: string,
): Promise<SplitResult | null> {
  const analysis = await analyzeModule(source);

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
export default function moduleSplittingLoader(source: string): void {
  // @ts-expect-error -- loader context is provided by webpack/rspack
  const ctx = this as { resourcePath: string; resourceQuery: string; async: () => (err: Error | null, result?: string) => void; _module?: any };
  const callback = ctx.async();
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
      callback(null, cached.partSources[idx] ?? source);
      return;
    }
    // If not cached, analyze on the fly
    splitModule(source, resourcePath).then((result) => {
      if (result) {
        cache.set(resourcePath, result);
        const idx = parseInt(partParam, 10);
        callback(null, result.partSources[idx] ?? source);
      } else {
        callback(null, source);
      }
    }, (err) => callback(err));
    return;
  }

  // First invocation: analyze and return facade
  splitModule(source, resourcePath).then((result) => {
    cache.set(resourcePath, result);
    if (result && ctx._module) {
      // The facade is a pure re-export module; mark it side-effect-free
      // so the bundler can bypass it and import parts directly.
      ctx._module.factoryMeta.sideEffectFree = true;
      ctx._module.buildMeta.sideEffectFree = true;
    }
    callback(null, result ? result.facade : source);
  }, (err) => callback(err));
}

const QUERY_RE = /module-splitting-part/;

/**
 * Generate module rules that enable optimal tree-shaking with rspack/webpack.
 *
 * The facade module (pure re-exports) is marked `sideEffects: false` so the
 * bundler can bypass it and connect entries directly to the split parts.
 * Part modules retain their side-effect status.
 *
 * Usage:
 * ```js
 * const { createModuleRules } = require('module-splitting-loader');
 * module.exports = {
 *   module: { rules: createModuleRules({ test: /\.js$/ }) },
 * };
 * ```
 */
export function createModuleRules(options: {
  test: RegExp;
  use?: any[];
}): any[] {
  const use = options.use ?? ['module-splitting-loader'];

  return [
    {
      test: options.test,
      resourceQuery: { not: [QUERY_RE] },
      sideEffects: false,
      use,
    },
    {
      test: options.test,
      resourceQuery: QUERY_RE,
      use,
    },
  ];
}
