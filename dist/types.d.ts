export interface ImportedBinding {
    localName: string;
    importedName: string;
}
export interface ImportInfo {
    source: string;
    specifiers: ImportedBinding[];
    isBareImport: boolean;
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
    astNode: any;
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
    requiredBindings: Map<string, number>;
    externalImports: ImportInfo[];
}
export interface SplitResult {
    facade: string;
    partSources: string[];
}
