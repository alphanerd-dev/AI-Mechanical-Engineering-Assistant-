import { describe, expect, it } from "vitest";
import {
  analyzeRepository,
  buildDependencyGraph,
  collectModuleSpecifiers,
  findArchitectureBoundaryViolations,
  findDependencyCycles,
} from "../scripts/architecture-graph.js";

describe("architecture dependency graph", () => {
  it("collects static imports, re-exports, dynamic imports, and require calls", () => {
    const source = `
      import value from "./value.js";
      export { thing } from "../shared/thing.js";
      const lazy = import("./lazy.js");
      const legacy = require("./legacy.cjs");
    `;

    expect(collectModuleSpecifiers(source)).toEqual([
      "./value.js",
      "../shared/thing.js",
      "./lazy.js",
      "./legacy.cjs",
    ]);
  });

  it("resolves relative .js specifiers to TypeScript source files", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: 'import { b } from "./b.js";' },
      { path: "src/b.ts", source: "export const b = 1;" },
    ]);

    expect(graph.edges).toEqual([{ from: "src/a.ts", to: "src/b.ts" }]);
    expect(graph.unresolved).toEqual([]);
  });

  it("does not treat package imports as local dependency edges", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: 'import React from "react"; import { b } from "./b.js";' },
      { path: "src/b.ts", source: "export const b = 1;" },
    ]);

    expect(graph.edges).toEqual([{ from: "src/a.ts", to: "src/b.ts" }]);
    expect(graph.unresolved).toEqual([]);
  });

  it("reports unresolved relative imports rather than silently dropping them", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: 'import { missing } from "./missing.js";' },
    ]);

    expect(graph.unresolved).toEqual([
      { from: "src/a.ts", specifier: "./missing.js" },
    ]);
  });

  it("finds a dependency cycle and returns its members in stable order", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: 'import "./b.js";' },
      { path: "src/b.ts", source: 'import "./a.js";' },
    ]);

    expect(findDependencyCycles(graph)).toEqual([["src/a.ts", "src/b.ts"]]);
  });

  it("keeps the production source graph free of cycles and unresolved relative imports", () => {
    const graph = analyzeRepository();
    expect(graph.unresolved).toEqual([]);
    expect(findDependencyCycles(graph)).toEqual([]);
  });

  it("reports forbidden upward dependencies between application layers", () => {
    const graph = buildDependencyGraph([
      { path: "app/page.tsx", source: 'import "../components/card.js"; import "../src/core.js"; import "../lib/http.js";' },
      { path: "components/card.tsx", source: 'import "../../app/api/route.js"; import "../src/core.js"; import "../lib/http.js";' },
      { path: "src/core.ts", source: 'import "../app/api/route.js"; import "../components/card.js"; import "../lib/http.js";' },
      { path: "src/another.ts", source: 'import "../lib/http.js";' },
      { path: "src/auth/supabase-service.ts", source: 'import "../../lib/supabase/server.js";' },
      { path: "lib/http.ts", source: 'import "../app/api/route.js"; import "../src/core.js"; import "../components/card.js";' },
      { path: "lib/supabase/server.ts", source: "export {};" },
      { path: "app/api/route.ts", source: "export {};" },
    ]);

    expect(findArchitectureBoundaryViolations(graph)).toEqual([
      { from: "components/card.tsx", to: "app/api/route.ts", rule: "non-app-to-app" },
      { from: "lib/http.ts", to: "app/api/route.ts", rule: "non-app-to-app" },
      { from: "lib/http.ts", to: "components/card.tsx", rule: "non-ui-to-components" },
      { from: "lib/http.ts", to: "src/core.ts", rule: "infrastructure-to-core" },
      { from: "src/another.ts", to: "lib/http.ts", rule: "unapproved-src-to-lib" },
      { from: "src/core.ts", to: "app/api/route.ts", rule: "non-app-to-app" },
      { from: "src/core.ts", to: "components/card.tsx", rule: "non-ui-to-components" },
      { from: "src/core.ts", to: "lib/http.ts", rule: "unapproved-src-to-lib" },
    ]);
  });

  it("keeps the current repository within the enforced layer boundaries", () => {
    const graph = analyzeRepository();
    expect(findArchitectureBoundaryViolations(graph)).toEqual([]);
  });

  it("does not report an acyclic dependency chain as a cycle", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: 'import "./b.js";' },
      { path: "src/b.ts", source: 'import "./c.js";' },
      { path: "src/c.ts", source: "export {};" },
    ]);

    expect(findDependencyCycles(graph)).toEqual([]);
  });
});
