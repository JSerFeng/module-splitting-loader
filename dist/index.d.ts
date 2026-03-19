import type { SplitResult } from './types.js';
/**
 * Core splitting function. Analyzes an ES module and splits it into
 * multiple parts for better tree-shaking.
 *
 * Returns null if splitting is not beneficial.
 */
export declare function splitModule(source: string, resourcePath: string): SplitResult | null;
/**
 * Webpack/Rspack loader entry point.
 *
 * First invocation (no query): returns facade that re-exports from parts.
 * Subsequent invocations (?module-splitting-part=N): returns the Nth part.
 */
export default function moduleSplittingLoader(source: string): string;
