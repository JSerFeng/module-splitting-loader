import * as __WEBPACK_EXTERNAL_MODULE__swc_core_81ba23c0__ from "@swc/core";
function extractBindingsFromPattern(pattern) {
    if (!pattern) return [];
    switch(pattern.type){
        case 'Identifier':
            return [
                pattern.value
            ];
        case 'ArrayPattern':
            return (pattern.elements ?? []).flatMap((el)=>el ? extractBindingsFromPattern(el) : []);
        case 'ObjectPattern':
            return (pattern.properties ?? []).flatMap((prop)=>{
                if ('AssignmentPatternProperty' === prop.type) return extractBindingsFromPattern(prop.key);
                if ('KeyValuePatternProperty' === prop.type) return extractBindingsFromPattern(prop.value);
                if ('RestElement' === prop.type) return extractBindingsFromPattern(prop.argument);
                return [];
            });
        case 'AssignmentPattern':
            return extractBindingsFromPattern(pattern.left);
        case 'RestElement':
            return extractBindingsFromPattern(pattern.argument);
        default:
            return [];
    }
}
function extractBindingsFromDeclaration(decl) {
    switch(decl.type){
        case 'VariableDeclaration':
            return decl.declarations.flatMap((d)=>extractBindingsFromPattern(d.id));
        case 'FunctionDeclaration':
            return decl.identifier ? [
                decl.identifier.value
            ] : [];
        case 'ClassDeclaration':
            return decl.identifier ? [
                decl.identifier.value
            ] : [];
        default:
            return [];
    }
}
function analyzeModule(source) {
    const ast = (0, __WEBPACK_EXTERNAL_MODULE__swc_core_81ba23c0__.parseSync)(source, {
        syntax: "ecmascript",
        target: 'es2022'
    });
    const baseOffset = ast.span.start;
    const slice = (span)=>source.slice(span.start - baseOffset, span.end - baseOffset);
    const statements = [];
    const bindingToStmt = new Map();
    const exports = [];
    const reExports = [];
    const bareImports = [];
    for(let i = 0; i < ast.body.length; i++){
        const item = ast.body[i];
        const code = slice(item.span);
        const stmt = {
            index: i,
            code,
            declaredBindings: [],
            references: new Set(),
            isSideEffect: false,
            astNode: item
        };
        switch(item.type){
            case 'ImportDeclaration':
                {
                    const specifiers = item.specifiers ?? [];
                    if (0 === specifiers.length) {
                        bareImports.push(item.source.value);
                        stmt.importInfo = {
                            source: item.source.value,
                            specifiers: [],
                            isBareImport: true
                        };
                    } else {
                        const importedBindings = specifiers.map((spec)=>{
                            let importedName;
                            if ('ImportDefaultSpecifier' === spec.type) importedName = 'default';
                            else if ('ImportNamespaceSpecifier' === spec.type) importedName = '*';
                            else {
                                var _spec_imported;
                                importedName = (null == (_spec_imported = spec.imported) ? void 0 : _spec_imported.value) ?? spec.local.value;
                            }
                            return {
                                localName: spec.local.value,
                                importedName
                            };
                        });
                        stmt.importInfo = {
                            source: item.source.value,
                            specifiers: importedBindings,
                            isBareImport: false
                        };
                        stmt.declaredBindings = importedBindings.map((b)=>b.localName);
                    }
                    break;
                }
            case 'ExportDeclaration':
                {
                    const decl = item.declaration;
                    const bindings = extractBindingsFromDeclaration(decl);
                    stmt.declaredBindings = bindings;
                    stmt.code = slice(decl.span);
                    stmt.astNode = decl;
                    const exportedNames = bindings.map((b)=>({
                            localName: b,
                            exportedAs: b
                        }));
                    stmt.exportInfo = {
                        kind: 'declaration',
                        exportedNames
                    };
                    exports.push(...exportedNames);
                    break;
                }
            case 'ExportDefaultDeclaration':
                {
                    var _decl_identifier;
                    const decl = item.decl;
                    const name = (null == (_decl_identifier = decl.identifier) ? void 0 : _decl_identifier.value) ?? '__default__';
                    stmt.declaredBindings = [
                        name
                    ];
                    stmt.code = slice(decl.span);
                    stmt.astNode = decl;
                    const exportedName = {
                        localName: name,
                        exportedAs: 'default'
                    };
                    stmt.exportInfo = {
                        kind: 'default-decl',
                        exportedNames: [
                            exportedName
                        ]
                    };
                    exports.push(exportedName);
                    break;
                }
            case 'ExportDefaultExpression':
                {
                    const name = '__default__';
                    stmt.declaredBindings = [
                        name
                    ];
                    stmt.astNode = item.expression;
                    stmt.code = slice(item.expression.span);
                    const exportedName = {
                        localName: name,
                        exportedAs: 'default'
                    };
                    stmt.exportInfo = {
                        kind: 'default-expr',
                        exportedNames: [
                            exportedName
                        ]
                    };
                    exports.push(exportedName);
                    break;
                }
            case 'ExportNamedDeclaration':
                if (item.source) reExports.push({
                    code
                });
                else {
                    const exportedNames = (item.specifiers ?? []).map((spec)=>{
                        var _spec_orig, _spec_orig1, _spec_exported;
                        const orig = (null == (_spec_orig = spec.orig) ? void 0 : _spec_orig.value) ?? (null == (_spec_orig1 = spec.orig) ? void 0 : _spec_orig1.value);
                        const exported = (null == (_spec_exported = spec.exported) ? void 0 : _spec_exported.value) ?? orig;
                        return {
                            localName: orig,
                            exportedAs: exported
                        };
                    });
                    stmt.exportInfo = {
                        kind: 'named',
                        exportedNames
                    };
                    exports.push(...exportedNames);
                }
                break;
            case 'ExportAllDeclaration':
                reExports.push({
                    code
                });
                break;
            default:
                {
                    const isDecl = [
                        'VariableDeclaration',
                        'FunctionDeclaration',
                        'ClassDeclaration'
                    ].includes(item.type);
                    if (isDecl) stmt.declaredBindings = extractBindingsFromDeclaration(item);
                    else stmt.isSideEffect = true;
                    break;
                }
        }
        statements.push(stmt);
        for (const b of stmt.declaredBindings)bindingToStmt.set(b, i);
    }
    return {
        statements,
        bindingToStmt,
        exports,
        reExports,
        bareImports,
        source
    };
}
function collectAllIdentifiers(node, result) {
    if (!node || 'object' != typeof node) return;
    if (Array.isArray(node)) {
        for (const item of node)collectAllIdentifiers(item, result);
        return;
    }
    if ('Identifier' === node.type && 'string' == typeof node.value) result.add(node.value);
    if ('MemberExpression' === node.type && !node.computed) return void collectAllIdentifiers(node.object, result);
    if ('KeyValueProperty' === node.type || 'KeyValuePatternProperty' === node.type) {
        if (node.computed) collectAllIdentifiers(node.key, result);
        collectAllIdentifiers(node.value, result);
        return;
    }
    if ('MethodProperty' === node.type || 'GetterProperty' === node.type || 'SetterProperty' === node.type) {
        if (node.computed) collectAllIdentifiers(node.key, result);
        collectAllIdentifiers(node.params, result);
        collectAllIdentifiers(node.body, result);
        return;
    }
    for (const key of Object.keys(node))if ('span' !== key && 'type' !== key) collectAllIdentifiers(node[key], result);
}
function collectReferences(statements, bindingToStmt) {
    const topLevelBindings = new Set(bindingToStmt.keys());
    for (const stmt of statements){
        if (stmt.importInfo) continue;
        const allIds = new Set();
        collectAllIdentifiers(stmt.astNode, allIds);
        const ownBindings = new Set(stmt.declaredBindings);
        for (const id of allIds)if (topLevelBindings.has(id) && !ownBindings.has(id)) stmt.references.add(id);
    }
}
function buildDependencyGraph(statements, bindingToStmt) {
    const adjList = new Map();
    for (const stmt of statements){
        var _stmt_exportInfo;
        if (!stmt.importInfo && ((null == (_stmt_exportInfo = stmt.exportInfo) ? void 0 : _stmt_exportInfo.kind) !== 'named' || 0 !== stmt.declaredBindings.length)) {
            if (!stmt.isSideEffect) adjList.set(stmt.index, new Set());
        }
    }
    for (const stmt of statements)if (adjList.has(stmt.index)) for (const ref of stmt.references){
        const depIdx = bindingToStmt.get(ref);
        if (void 0 === depIdx) continue;
        const depStmt = statements[depIdx];
        if (!depStmt.importInfo) {
            if (depIdx !== stmt.index) adjList.get(stmt.index).add(depIdx);
        }
    }
    return adjList;
}
function findSCCs(adjList, nodeIds) {
    let index = 0;
    const stack = [];
    const onStack = new Set();
    const indices = new Map();
    const lowlinks = new Map();
    const sccs = [];
    let sccId = 0;
    function strongconnect(v) {
        indices.set(v, index);
        lowlinks.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
        for (const w of adjList.get(v) ?? [])if (indices.has(w)) {
            if (onStack.has(w)) lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
        } else {
            strongconnect(w);
            lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
        }
        if (lowlinks.get(v) === indices.get(v)) {
            const component = [];
            let w;
            do {
                w = stack.pop();
                onStack.delete(w);
                component.push(w);
            }while (w !== v);
            sccs.push({
                id: sccId++,
                stmtIndices: component
            });
        }
    }
    for (const v of nodeIds)if (!indices.has(v)) strongconnect(v);
    return sccs;
}
function buildCondensedDAG(sccs, adjList) {
    const stmtToSCC = new Map();
    for (const scc of sccs)for (const idx of scc.stmtIndices)stmtToSCC.set(idx, scc.id);
    const dag = new Map();
    for (const scc of sccs)dag.set(scc.id, new Set());
    for (const scc of sccs)for (const stmtIdx of scc.stmtIndices)for (const dep of adjList.get(stmtIdx) ?? []){
        const depSCC = stmtToSCC.get(dep);
        if (void 0 !== depSCC && depSCC !== scc.id) dag.get(scc.id).add(depSCC);
    }
    return dag;
}
function computeExportDeps(sccs, condensedDAG, exports, bindingToStmt) {
    const stmtToSCC = new Map();
    for (const scc of sccs)for (const idx of scc.stmtIndices)stmtToSCC.set(idx, scc.id);
    const result = new Map();
    for (const scc of sccs)result.set(scc.id, new Set());
    for (const exp of exports){
        const stmtIdx = bindingToStmt.get(exp.localName);
        if (void 0 === stmtIdx) continue;
        const rootSCC = stmtToSCC.get(stmtIdx);
        if (void 0 === rootSCC) continue;
        const visited = new Set();
        const queue = [
            rootSCC
        ];
        visited.add(rootSCC);
        while(queue.length > 0){
            const current = queue.shift();
            result.get(current).add(exp.exportedAs);
            for (const dep of condensedDAG.get(current) ?? [])if (!visited.has(dep)) {
                visited.add(dep);
                queue.push(dep);
            }
        }
    }
    return result;
}
function setKey(s) {
    return [
        ...s
    ].sort().join('\0');
}
function partitionModule(analysis, sccs, exportDeps) {
    const groups = new Map();
    for (const scc of sccs){
        const deps = exportDeps.get(scc.id) ?? new Set();
        const key = setKey(deps);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(scc);
    }
    const sccStmts = new Set();
    for (const scc of sccs)for (const idx of scc.stmtIndices)sccStmts.add(idx);
    const sideEffectStmts = analysis.statements.filter((s)=>s.isSideEffect && !sccStmts.has(s.index)).map((s)=>s.index);
    const hasSideEffects = sideEffectStmts.length > 0;
    const totalParts = groups.size + (hasSideEffects ? 1 : 0);
    if (totalParts <= 1) return null;
    const parts = [];
    let partIndex = 0;
    if (hasSideEffects) parts.push({
        index: partIndex++,
        stmtIndices: sideEffectStmts,
        exportDepSet: new Set(),
        providedBindings: [],
        requiredBindings: new Map(),
        externalImports: []
    });
    for (const [, groupSCCs] of groups){
        const stmtIndices = groupSCCs.flatMap((scc)=>scc.stmtIndices);
        const exportDepSet = exportDeps.get(groupSCCs[0].id) ?? new Set();
        const providedBindings = [];
        for (const idx of stmtIndices)providedBindings.push(...analysis.statements[idx].declaredBindings);
        parts.push({
            index: partIndex++,
            stmtIndices,
            exportDepSet,
            providedBindings,
            requiredBindings: new Map(),
            externalImports: []
        });
    }
    const bindingToPartIndex = new Map();
    for (const part of parts)for (const b of part.providedBindings)bindingToPartIndex.set(b, part.index);
    for (const part of parts){
        const neededImportBindings = new Map();
        for (const stmtIdx of part.stmtIndices){
            const stmt = analysis.statements[stmtIdx];
            for (const ref of stmt.references){
                const declStmtIdx = analysis.bindingToStmt.get(ref);
                if (void 0 === declStmtIdx) continue;
                const declStmt = analysis.statements[declStmtIdx];
                if (declStmt.importInfo && !declStmt.importInfo.isBareImport) {
                    const spec = declStmt.importInfo.specifiers.find((s)=>s.localName === ref);
                    if (spec) {
                        const src = declStmt.importInfo.source;
                        if (!neededImportBindings.has(src)) neededImportBindings.set(src, new Set());
                        neededImportBindings.get(src).add(`${ref}:${spec.importedName}`);
                    }
                } else {
                    const otherPartIdx = bindingToPartIndex.get(ref);
                    if (void 0 !== otherPartIdx && otherPartIdx !== part.index) part.requiredBindings.set(ref, otherPartIdx);
                }
            }
        }
        for (const [source, specStrs] of neededImportBindings){
            const specifiers = [];
            for (const s of specStrs){
                const [localName, importedName] = s.split(':');
                specifiers.push({
                    localName,
                    importedName
                });
            }
            part.externalImports.push({
                source,
                specifiers,
                isBareImport: false
            });
        }
    }
    return parts;
}
function generateImportSpec(importedName, localName) {
    if ('default' === importedName) return localName;
    if ('*' === importedName) return `* as ${localName}`;
    if (importedName === localName) return localName;
    return `${importedName} as ${localName}`;
}
function generateFacade(analysis, parts, resourcePath) {
    const lines = [];
    for (const src of analysis.bareImports)lines.push(`import ${JSON.stringify(src)};`);
    for (const part of parts)if (0 === part.exportDepSet.size && part.stmtIndices.length > 0) lines.push(`import ${JSON.stringify(resourcePath + '?module-splitting-part=' + part.index)};`);
    const partExportMap = new Map();
    for (const exp of analysis.exports){
        const stmtIdx = analysis.bindingToStmt.get(exp.localName);
        if (void 0 !== stmtIdx) {
            for (const part of parts)if (part.stmtIndices.includes(stmtIdx)) {
                if (!partExportMap.has(part.index)) partExportMap.set(part.index, []);
                partExportMap.get(part.index).push(exp);
                break;
            }
        }
    }
    for (const part of parts){
        const exportedNames = partExportMap.get(part.index);
        if (!exportedNames || 0 === exportedNames.length) continue;
        const specifiers = exportedNames.map((e)=>{
            if (e.localName === e.exportedAs) return e.exportedAs;
            return `${e.localName} as ${e.exportedAs}`;
        });
        lines.push(`export { ${specifiers.join(', ')} } from ${JSON.stringify(resourcePath + '?module-splitting-part=' + part.index)};`);
    }
    for (const re of analysis.reExports)lines.push(re.code);
    return lines.join('\n');
}
function generatePartSource(analysis, part, allParts, resourcePath) {
    const lines = [];
    for (const imp of part.externalImports)if (imp.isBareImport) lines.push(`import ${JSON.stringify(imp.source)};`);
    else {
        const defaultSpec = imp.specifiers.find((s)=>'default' === s.importedName);
        const nsSpec = imp.specifiers.find((s)=>'*' === s.importedName);
        const namedSpecs = imp.specifiers.filter((s)=>'default' !== s.importedName && '*' !== s.importedName);
        if (nsSpec) lines.push(`import * as ${nsSpec.localName} from ${JSON.stringify(imp.source)};`);
        if (defaultSpec || namedSpecs.length > 0) {
            const parts = [];
            if (defaultSpec) parts.push(defaultSpec.localName);
            if (namedSpecs.length > 0) {
                const specs = namedSpecs.map((s)=>generateImportSpec(s.importedName, s.localName));
                parts.push(`{ ${specs.join(', ')} }`);
            }
            lines.push(`import ${parts.join(', ')} from ${JSON.stringify(imp.source)};`);
        }
    }
    const partImports = new Map();
    for (const [binding, partIdx] of part.requiredBindings){
        if (!partImports.has(partIdx)) partImports.set(partIdx, []);
        partImports.get(partIdx).push(binding);
    }
    for (const [partIdx, bindings] of partImports){
        const sorted = [
            ...bindings
        ].sort();
        lines.push(`import { ${sorted.join(', ')} } from ${JSON.stringify(resourcePath + '?module-splitting-part=' + partIdx)};`);
    }
    const sortedIndices = [
        ...part.stmtIndices
    ].sort((a, b)=>a - b);
    for (const idx of sortedIndices){
        var _stmt_exportInfo;
        const stmt = analysis.statements[idx];
        let code = stmt.code;
        if ((null == (_stmt_exportInfo = stmt.exportInfo) ? void 0 : _stmt_exportInfo.kind) === 'default-expr') code = `const __default__ = ${stmt.code};`;
        lines.push(code);
    }
    const bindingsToExport = new Set();
    for (const b of part.providedBindings){
        if (analysis.exports.some((e)=>e.localName === b)) bindingsToExport.add(b);
        for (const other of allParts)if (other.index !== part.index) {
            if (other.requiredBindings.has(b)) bindingsToExport.add(b);
        }
    }
    if (bindingsToExport.size > 0) {
        const sorted = [
            ...bindingsToExport
        ].sort();
        lines.push(`export { ${sorted.join(', ')} };`);
    }
    return lines.join('\n');
}
function splitModule(source, resourcePath) {
    const analysis = analyzeModule(source);
    if (analysis.exports.length <= 1) return null;
    collectReferences(analysis.statements, analysis.bindingToStmt);
    const adjList = buildDependencyGraph(analysis.statements, analysis.bindingToStmt);
    const nodeIds = [
        ...adjList.keys()
    ];
    const sccs = findSCCs(adjList, nodeIds);
    if (0 === sccs.length) return null;
    const condensedDAG = buildCondensedDAG(sccs, adjList);
    const exportDeps = computeExportDeps(sccs, condensedDAG, analysis.exports, analysis.bindingToStmt);
    const parts = partitionModule(analysis, sccs, exportDeps);
    if (!parts) return null;
    const facade = generateFacade(analysis, parts, resourcePath);
    const partSources = parts.map((p)=>generatePartSource(analysis, p, parts, resourcePath));
    return {
        facade,
        partSources
    };
}
const cache = new Map();
function moduleSplittingLoader(source) {
    const ctx = this;
    const resourcePath = ctx.resourcePath;
    const resourceQuery = ctx.resourceQuery || '';
    const params = new URLSearchParams(resourceQuery.startsWith('?') ? resourceQuery.slice(1) : resourceQuery);
    const partParam = params.get('module-splitting-part');
    if (null !== partParam) {
        const cached = cache.get(resourcePath);
        if (cached) {
            const idx = parseInt(partParam, 10);
            return cached.partSources[idx] ?? source;
        }
        const result = splitModule(source, resourcePath);
        if (result) {
            cache.set(resourcePath, result);
            const idx = parseInt(partParam, 10);
            return result.partSources[idx] ?? source;
        }
        return source;
    }
    const result = splitModule(source, resourcePath);
    cache.set(resourcePath, result);
    if (!result) return source;
    return result.facade;
}
export { moduleSplittingLoader as default, splitModule };
