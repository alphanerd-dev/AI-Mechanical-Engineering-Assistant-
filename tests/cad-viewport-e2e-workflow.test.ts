import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/e2e-playwright.yml", import.meta.url), "utf8");
const fixture = readFileSync(new URL("./e2e/fixtures/browserstack-test.mjs", import.meta.url), "utf8");
const acceptance = readFileSync(new URL("./e2e/workspace-intent-acceptance.e2e.mjs", import.meta.url), "utf8");

describe("CAD viewport E2E safety and acceptance gate", () => {
  it("keeps live CAD and viewport execution opt-in and disposable-only", () => {
    expect(workflow).toContain("test_accepted_cad_completion:");
    expect(workflow).toContain("test_cad_viewport:");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("E2E_RUN_ACCEPTED_CAD_SMOKE: ${{ inputs.test_accepted_cad_completion }}");
    expect(workflow).toContain("E2E_RUN_CAD_VIEWPORT_SMOKE: ${{ inputs.test_cad_viewport }}");
    expect(workflow).toContain("viewportSmoke && (suite !== \"full\" || !acceptedCADSmoke)");
    expect(workflow).toContain("E2E_WEBGL !== \"true\"");
    expect(workflow).toContain("CONFIRM_ISOLATED_ENVIRONMENT");
  });

  it("uses local Chromium with software WebGL only when the viewport gate is explicitly enabled", () => {
    expect(fixture).toContain('process.env.E2E_WEBGL === "true"');
    expect(fixture).toContain('"--use-angle=swiftshader"');
    expect(fixture).toContain('"--enable-unsafe-swiftshader"');
    expect(workflow).toContain("npx playwright install --with-deps chromium");
    expect(workflow).not.toContain("BROWSERSTACK_AUTOMATION");
  });

  it("verifies the real CAD display derivative, navigation controls and context recovery", () => {
    expect(acceptance).toContain('process.env.E2E_RUN_CAD_VIEWPORT_SMOKE === "true"');
    expect(acceptance).toContain('getByRole("button", { name: "Generate 3D preview" })');
    expect(acceptance).toContain('getContext("webgl2")');
    expect(acceptance).toContain('getByRole("button", { name: "Fit to view" })');
    expect(acceptance).toContain('getByRole("button", { name: "Highlight model" })');
    expect(acceptance).toContain('getExtension("WEBGL_lose_context")');
    expect(acceptance).toContain('restoreContext()');
    expect(acceptance).toContain('data-render-error');
  });
});
