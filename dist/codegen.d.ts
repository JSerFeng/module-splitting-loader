import type { ModuleAnalysis, Part } from './types.js';
/**
 * Generate the facade module that re-exports from parts.
 */
export declare function generateFacade(analysis: ModuleAnalysis, parts: Part[], resourcePath: string): string;
/**
 * Generate the source code for a single part module.
 */
export declare function generatePartSource(analysis: ModuleAnalysis, part: Part, allParts: Part[], resourcePath: string): string;
