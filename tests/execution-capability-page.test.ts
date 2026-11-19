import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../app/projects/[projectId]/analysis/execution/page.tsx", import.meta.url),
  "utf8"
);

describe("project execution capability page", () => {
  it("uses the current project identity for its analysis navigation", () => {
    expect(page).toContain("params: Promise<{ projectId: string }>");
    expect(page).toContain("`/projects/${projectId}/analysis`");
    expect(page).not.toContain("/projects/demo/analysis");
  });

  it("does not describe implemented worker adapters as planned", () => {
    expect(page).toContain("CAD BUILD WORKER");
    expect(page).toContain("INTEGRATED");
    expect(page).toContain("PYTHON WORKER ADAPTER");
    expect(page).toContain("IMPLEMENTED");
  });

  it("keeps FEA and CFD benchmark workers separate from user-facing solver workflows", () => {
    expect(page).toContain("CALCULIX FEA WORKER");
    expect(page).toContain("OPENFOAM 14 CFD WORKER");
    expect(page.match(/BENCHMARK ONLY/g)).toHaveLength(2);
  });

  it("keeps model-directed agent execution explicitly gated", () => {
    expect(page).toContain("MODEL-DIRECTED AGENT RUN JOURNAL");
    expect(page).toContain("NOT ENABLED");
  });
});