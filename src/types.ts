export interface ImportedBinding {
  localName: string;
  importedName: string; // "default" | "*" | named
}

export interface ImportInfo {
  source: string;
  specifiers: ImportedBinding[];
  isBareImport: boolean; // import './polyfill' (no specifiers)
}

export interface ExportedName {
  localName: string;
  exportedAs: string;
}

export interface ExportInfo {
  kind: 'declaration' | 'named' | 'default-decl' | 'default-expr';
  exportedNames: ExportedName[];
}

export interface ReExport {
  code: string;
}

export interface StatementInfo {
  index: number;
  code: string;
  declaredBindings: string[];
  references: Set<string>;
  isSideEffect: boolean;
  importInfo?: ImportInfo;
  exportInfo?: ExportInfo;
  astNode: any; // retained SWC AST node for reference walking
}

export interface ModuleAnalysis {
  statements: StatementInfo[];
  bindingToStmt: Map<string, number>;
  exports: ExportedName[];
  reExports: ReExport[];
  bareImports: string[];
  source: string;
}

export interface SCC {
  id: number;
  stmtIndices: number[];
}

export interface Part {
  index: number;
  stmtIndices: number[];
  exportDepSet: Set<string>;
  providedBindings: string[];
  requiredBindings: Map<string, number>; // binding name → part index
  externalImports: ImportInfo[];
}

export interface SplitResult {
  facade: string;
  partSources: string[];
}
