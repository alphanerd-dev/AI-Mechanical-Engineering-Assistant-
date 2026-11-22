import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/m2-artifact-acceptance.yml", import.meta.url),
  "utf8"
);

describe("M2 authenticated acceptance workflow safety contract", () => {
  it("requires explicit disposable-target confirmation before running writes", () => {
    expect(workflow).toContain("confirm_disposable_target:");
    expect(workflow).toContain("type: boolean");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("if: ${{ inputs.confirm_disposable_target == true }}");
  });

  it("reads preview and E2E Supabase origins only from protected environment variables", () => {
    for (const key of [
      "CAD_WORKSPACE_BASE_URL",
      "CAD_WORKSPACE_ALLOWED_HOST",
      "CAD_WORKSPACE_SUPABASE_URL",
      "CAD_WORKSPACE_SUPABASE_ALLOWED_HOST"
    ]) {
      expect(workflow).toContain(key + ": ${{ vars." + key + " }}");
    }

    expect(workflow).not.toContain("ai-mechanical-engineering-assistant-git-f-a5ad0f-alphanerd-labs.vercel.app");
    expect(workflow).not.toContain("mpbrlegwrrrfpeumtqhi.supabase.co");
  });

  it("fails closed unless both HTTPS origins exactly match non-wildcard host allowlists", () => {
    expect(workflow).toContain(
      '[[ "${CAD_WORKSPACE_BASE_URL}" != "https://${CAD_WORKSPACE_ALLOWED_HOST}" ]]'
    );
    expect(workflow).toContain(
      '[[ "${CAD_WORKSPACE_SUPABASE_URL}" != "https://${CAD_WORKSPACE_SUPABASE_ALLOWED_HOST}" ]]'
    );
    expect(workflow).toContain('[[ "${CAD_WORKSPACE_ALLOWED_HOST}" == *"*"*');
    expect(workflow).toContain('[[ "${CAD_WORKSPACE_SUPABASE_ALLOWED_HOST}" == *"*"*');
  });

  it("uses only the dedicated E2E service-role secret and authenticated session", () => {
    expect(workflow).toContain("CAD_WORKSPACE_COOKIE: ${{ secrets.CAD_WORKSPACE_COOKIE }}");
    expect(workflow).toContain(
      "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.CAD_WORKSPACE_E2E_SUPABASE_SERVICE_ROLE_KEY }}"
    );
    expect(workflow).not.toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("run: npm run smoke:m2-artifacts");
  });

  it("grants read-only repository permissions and never deploys or migrates production", () => {
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("It never deploys to production");
  });
});
