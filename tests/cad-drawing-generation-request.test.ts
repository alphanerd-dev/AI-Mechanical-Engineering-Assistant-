import { describe, expect, it } from "vitest";
import {
  MAX_DRAWING_GENERATION_REQUEST_BYTES,
  parseDrawingGenerationRequest
} from "../app/api/cad/drawings/generate/request";
import { DrawingGenerationError } from "../app/api/cad/drawings/generate/errors";

const validInput = {
  projectId: "18ef009b-75d8-4e7c-b4b2-a9ec5b4ddade",
  modelIdentityId: "a8dc1601-1596-4bcd-8048-0f2c3a871dea",
  geometryRevisionId: "4ead878f-735f-4327-a5e3-f6e0ca429bc9"
};

function jsonRequest(body: unknown): Request {
  return new Request("https://engineering.test/api/cad/drawings/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("CAD drawing generation request parsing", () => {
  it("parses valid project, model and geometry revision UUIDs from a JSON request", async () => {
    await expect(parseDrawingGenerationRequest(jsonRequest(validInput))).resolves.toEqual(validInput);
  });

  it("accepts optional bounded drawing labels without changing source identities", async () => {
    await expect(parseDrawingGenerationRequest(jsonRequest({
      ...validInput,
      drawingNumber: "SHAFT-1",
      title: "Input shaft"
    }))).resolves.toMatchObject({
      ...validInput,
      drawingNumber: "SHAFT-1",
      title: "Input shaft"
    });
  });

  it("rejects malformed project identity with a typed client error", async () => {
    await expect(parseDrawingGenerationRequest(jsonRequest({
      ...validInput,
      projectId: "not-a-uuid"
    }))).rejects.toMatchObject({
      name: "DrawingGenerationError",
      status: 400,
      code: "INVALID_IDENTITY"
    });
  });

  it("enforces the actual byte limit even when content-length is absent", async () => {
    const oversized = new Request("https://engineering.test/api/cad/drawings/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validInput, title: "x".repeat(MAX_DRAWING_GENERATION_REQUEST_BYTES) })
    });
    await expect(parseDrawingGenerationRequest(oversized)).rejects.toMatchObject({
      name: "DrawingGenerationError",
      status: 413,
      code: "REQUEST_TOO_LARGE"
    });
  });

  it("rejects malformed UTF-8 JSON and non-object JSON", async () => {
    const invalidJson = new Request("https://engineering.test/api/cad/drawings/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xff, 0xfe, 0xfd])
    });
    await expect(parseDrawingGenerationRequest(invalidJson)).rejects.toBeInstanceOf(DrawingGenerationError);

    await expect(parseDrawingGenerationRequest(jsonRequest([]))).rejects.toMatchObject({
      status: 400,
      code: "INVALID_JSON"
    });
  });
});
