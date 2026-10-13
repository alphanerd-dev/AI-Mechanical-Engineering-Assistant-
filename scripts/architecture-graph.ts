import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

export interface SourceModule {
  path: string;
  source: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
}

export interface UnresolvedDependency {
  from: string;
  specifier: string;
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
  unresolved: UnresolvedDependency[];
  externalImports: UnresolvedDependency[];
}

const SOURCE_ROOTS = ["app", "components", "lib", "src"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];
const NON_CODE_IMPORT_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"]);
const INDEX_EXTENSIONS = SOURCE_EXTENSIONS.map((extension) => `/index${extension}`);

export function collectModuleSpecifiers(sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(
    "dependency-scan.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers = new Set<string>();

  const addStringLiteral = (node: ts.Node | undefined) => {
    if (node && ts.isStringLiteralLike(node)) {
      specifiers.add(node.text);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) {
        addStringLiteral(node.argument.literal);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      addStringLiteral(node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...specifiers];
}

function normalizeSourcePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function resolveRelativeImport(
  sourcePath: string,
  specifier: string,
  knownPaths: Set<string>,
): string | undefined {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourcePath), specifier),
  );
  const candidates = new Set<string>();

  if (path.posix.extname(base)) {
    const extension = path.posix.extname(base);
    const stem = base.slice(0, -extension.length);
    candidates.add(base);
    if (extension === ".js" || extension === ".jsx" || extension === ".mjs" || extension === ".cjs") {
      candidates.add(`${stem}.ts`);
      candidates.add(`${stem}.tsx`);
      candidates.add(`${stem}.mts`);
      candidates.add(`${stem}.cts`);
    }
  } else {
    for (const extension of SOURCE_EXTENSIONS) candidates.add(`${base}${extension}`);
    for (const suffix of INDEX_EXTENSIONS) candidates.add(`${base}${suffix}`);
  }

  return [...candidates].sort().find((candidate) => knownPaths.has(candidate));
}

export function buildDependencyGraph(modules: SourceModule[]): DependencyGraph {
  const normalizedModules = modules.map((module) => ({
    path: normalizeSourcePath(module.path),
    source: module.source,
  }));
  const knownPaths = new Set(normalizedModules.map((module) => module.path));
  const edgeKeys = new Set<string>();
  const unresolvedKeys = new Set<string>();
  const externalKeys = new Set<string>();
  const edges: DependencyEdge[] = [];
  const unresolved: UnresolvedDependency[] = [];
  const externalImports: UnresolvedDependency[] = [];

  for (const module of normalizedModules) {
    for (const specifier of collectModuleSpecifiers(module.source)) {
      if (!specifier.startsWith(".")) {
        const key = `${module.path}\u0000${specifier}`;
        if (!externalKeys.has(key)) {
          externalKeys.add(key);
          externalImports.push({ from: module.path, specifier });
        }
        continue;
      }

      if (NON_CODE_IMPORT_EXTENSIONS.has(path.posix.extname(specifier).toLowerCase())) continue;

      const target = resolveRelativeImport(module.path, specifier, knownPaths);
      if (!target) {
        const key = `${module.path}\u0000${specifier}`;
        if (!unresolvedKeys.has(key)) {
          unresolvedKeys.add(key);
          unresolved.push({ from: module.path, specifier });
        }
        continue;
      }

      const key = `${module.path}\u0000${target}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from: module.path, to: target });
      }
    }
  }

  return {
    nodes: [...knownPaths].sort(),
    edges: edges.sort((a, b) =>
      a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    ),
    unresolved: unresolved.sort((a, b) =>
      a.from.localeCompare(b.from) || a.specifier.localeCompare(b.specifier),
    ),
    externalImports: externalImports.sort((a, b) =>
      a.from.localeCompare(b.from) || a.specifier.localeCompare(b.specifier),
    ),
  };
}

export function findDependencyCycles(graph: DependencyGraph): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node, []);
  for (const edge of graph.edges) {
    const targets = adjacency.get(edge.from);
    if (targets && !targets.includes(edge.to)) targets.push(edge.to);
  }
  for (const targets of adjacency.values()) targets.sort();

  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  const connect = (node: string): void => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of adjacency.get(node) ?? []) {
      if (!indices.has(target)) {
        connect(target);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(target)!));
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;

    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== node);

    const hasSelfLoop = component.length === 1 &&
      (adjacency.get(component[0]) ?? []).includes(component[0]);
    if (component.length > 1 || hasSelfLoop) cycles.push(component.sort());
  };

  for (const node of [...graph.nodes].sort()) {
    if (!indices.has(node)) connect(node);
  }

  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

function collectSourceFiles(directory: string, root: string, output: SourceModule[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath, root, output);
      continue;
    }
    if (!entry.isFile() || !/\.(ts|tsx|mts|cts|js|jsx)$/.test(entry.name) || /\.d\.(ts|mts|cts)$/.test(entry.name)) {
      continue;
    }
    output.push({
      path: normalizeSourcePath(path.relative(root, absolutePath)),
      source: readFileSync(absolutePath, "utf8"),
    });
  }
}

export function analyzeRepository(root = process.cwd()): DependencyGraph {
  const modules: SourceModule[] = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const absolutePath = path.join(root, sourceRoot);
    try {
      if (statSync(absolutePath).isDirectory()) collectSourceFiles(absolutePath, root, modules);
    } catch {
      // Optional roots (for example components/) may not exist in a smaller checkout.
    }
  }
  return buildDependencyGraph(modules);
}

function main(): void {
  const graph = analyzeRepository();
  const cycles = findDependencyCycles(graph);
  const result = {
    ...graph,
    summary: {
      modules: graph.nodes.length,
      internalEdges: graph.edges.length,
      externalImports: graph.externalImports.length,
      unresolvedRelativeImports: graph.unresolved.length,
      cycles: cycles.length,
    },
    cycles,
  };

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write([
      "Architecture dependency graph",
      `Modules: ${result.summary.modules}`,
      `Internal dependency edges: ${result.summary.internalEdges}`,
      `External import references: ${result.summary.externalImports}`,
      `Unresolved relative imports: ${result.summary.unresolvedRelativeImports}`,
      `Dependency cycles: ${result.summary.cycles}`,
      ...cycles.map((cycle) => `CYCLE: ${cycle.join(" -> ")}`),
      ...graph.unresolved.map((item) => `UNRESOLVED: ${item.from} -> ${item.specifier}`),
    ].join("\n") + "\n");
  }

  if (process.argv.includes("--strict") && (cycles.length > 0 || graph.unresolved.length > 0)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
