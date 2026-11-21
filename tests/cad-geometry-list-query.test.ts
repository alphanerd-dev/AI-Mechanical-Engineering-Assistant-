import { describe, expect, it } from "vitest";
import { parseCADGeometryDerivativeListQuery } from "../src/cad/geometry-derivative-query";

const projectId = "11111111-1111-4111-8111-111111111111";
const modelIdentityId = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";
const fail = (message: string, status: number): never => { throw new Error(status + ": " + message); };

describe("CAD display derivative list query", () => {
  it("preserves the existing full-history and signed-URL defaults", () => {
    const parsed = parseCADGeometryDerivativeListQuery(
      new Request("https://example.test/api/cad/geometry?projectId=" + projectId), fail
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
    expect(parseCADGeometryDerivativeListQuery(
      new Request("https://example.test/api/cad/geometry?" + query.toString()), fail
    )).toEqual({ projectId, modelIdentityId, artifactId, includeSignedUrls: false });
  });

  it("rejects malformed artifact identifiers", () => {
    expect(() => parseCADGeometryDerivativeListQuery(
      new Request("https://example.test/api/cad/geometry?projectId=" + projectId + "&artifactId=not-a-uuid"), fail
    )).toThrow(/artifact UUID/i);
  });
});
