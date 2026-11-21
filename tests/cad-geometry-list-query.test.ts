import { describe, expect, it } from "vitest";
import { parseDerivativeListQuery } from "../app/api/cad/geometry/service";

const projectId = "11111111-1111-4111-8111-111111111111";
const modelIdentityId = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";

describe("CAD display derivative list query", () => {
  it("preserves the existing full-history and signed-URL defaults", () => {
    const parsed = parseDerivativeListQuery(
      new Request("https://example.test/api/cad/geometry?projectId=" + projectId)
    );
    expect(parsed).toEqual({
      projectId,
      modelIdentityId: null,
      artifactId: null,
      includeSignedUrls: true
    });
  });

  it("supports a single-artifact status-only lookup", () => {
    const query = new URLSearchParams({
      projectId,
      modelIdentityId,
      artifactId,
      includeSignedUrls: "false"
    });
    expect(parseDerivativeListQuery(
      new Request("https://example.test/api/cad/geometry?" + query.toString())
    )).toEqual({ projectId, modelIdentityId, artifactId, includeSignedUrls: false });
  });

  it("rejects malformed artifact identifiers", () => {
    expect(() => parseDerivativeListQuery(
      new Request("https://example.test/api/cad/geometry?projectId=" + projectId + "&artifactId=not-a-uuid")
    )).toThrow(/artifact UUID/i);
  });
});
