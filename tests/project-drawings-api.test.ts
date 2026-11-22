import { afterEach, describe, expect, it, vi } from "vitest";
import { submitShaftDrawingGeneration } from "../app/projects/[projectId]/_components/project-drawings-api";

const projectId = "17f2b5df-e436-46a4-ba84-22e67bcd8a8f";
const modelIdentityId = "e2a25112-236a-488b-b6de-008ad0d455db";
const completionId = "f4b3cf1f-37fa-446d-9777-825a6ece24c6";
const revisionId = "e07ef560-4a89-4c44-b2d9-a93c47d11297";
const drawingId = "b6d692c6-2408-4e91-8828-7c41fe8740b0";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function acceptedCompletion(id = completionId) {
  return {
    id,
    model_identity_id: modelIdentityId,
    status: "ACCEPTED",
    created_at: "2026-11-22T07:31:29.820Z"
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("submitShaftDrawingGeneration", () => {
  it("persists the first immutable geometry revision before generating the drawing", async () => {
    const fetchStub = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ completions: [acceptedCompletion()] }))
      .mockResolvedValueOnce(jsonResponse({ revisions: [], count: 0 }))
      .mockResolvedValueOnce(jsonResponse({ revision: { geometryRevisionId: revisionId }, persisted: true }, 201))
      .mockResolvedValueOnce(jsonResponse({ drawing: { id: drawingId } }, 201));
    vi.stubGlobal("fetch", fetchStub);

    await expect(submitShaftDrawingGeneration(projectId, modelIdentityId)).resolves.toBe(drawingId);

    expect(fetchStub).toHaveBeenCalledTimes(4);
    const [, createRevision] = fetchStub.mock.calls[2] as unknown as [string, RequestInit];
    expect(JSON.parse(String(createRevision.body))).toEqual({
      projectId,
      completionId,
      expectedParentRevisionId: null
    });
    const [, generateDrawing] = fetchStub.mock.calls[3] as unknown as [string, RequestInit];
    expect(JSON.parse(String(generateDrawing.body))).toEqual({
      projectId,
      modelIdentityId,
      geometryRevisionId: revisionId
    });
  });

  it("reuses the current revision when it already represents the latest accepted completion", async () => {
    const fetchStub = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ completions: [acceptedCompletion()] }))
      .mockResolvedValueOnce(jsonResponse({
        revisions: [{ id: revisionId, source_completion_id: completionId, revision_number: 1 }],
        count: 1
      }))
      .mockResolvedValueOnce(jsonResponse({ drawing: { id: drawingId } }, 201));
    vi.stubGlobal("fetch", fetchStub);

    await expect(submitShaftDrawingGeneration(projectId, modelIdentityId)).resolves.toBe(drawingId);

    expect(fetchStub).toHaveBeenCalledTimes(3);
    const [drawingUrl, drawingInit] = fetchStub.mock.calls[2] as unknown as [string, RequestInit];
    expect(drawingUrl).toBe("/api/cad/drawings/generate");
    expect(JSON.parse(String(drawingInit.body))).toMatchObject({ geometryRevisionId: revisionId });
  });

  it("appends a child revision when the latest accepted completion advances the model", async () => {
    const newerCompletionId = "f4b3cf1f-37fa-446d-9777-825a6ece24c7";
    const nextRevisionId = "e07ef560-4a89-4c44-b2d9-a93c47d11298";
    const priorHeadId = "e07ef560-4a89-4c44-b2d9-a93c47d11297";
    const fetchStub = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ completions: [acceptedCompletion(newerCompletionId)] }))
      .mockResolvedValueOnce(jsonResponse({
        revisions: [{ id: priorHeadId, source_completion_id: completionId, revision_number: 1 }],
        count: 1
      }))
      .mockResolvedValueOnce(jsonResponse({ revision: { geometryRevisionId: nextRevisionId }, persisted: true }, 201))
      .mockResolvedValueOnce(jsonResponse({ drawing: { id: drawingId } }, 201));
    vi.stubGlobal("fetch", fetchStub);

    await expect(submitShaftDrawingGeneration(projectId, modelIdentityId)).resolves.toBe(drawingId);

    const [, createRevision] = fetchStub.mock.calls[2] as unknown as [string, RequestInit];
    expect(JSON.parse(String(createRevision.body))).toEqual({
      projectId,
      completionId: newerCompletionId,
      expectedParentRevisionId: priorHeadId
    });
    const [, generateDrawing] = fetchStub.mock.calls[3] as unknown as [string, RequestInit];
    expect(JSON.parse(String(generateDrawing.body))).toMatchObject({ geometryRevisionId: nextRevisionId });
  });

  it("does not attempt geometry revision or drawing writes without an accepted completion", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(jsonResponse({ completions: [] }));
    vi.stubGlobal("fetch", fetchStub);

    await expect(submitShaftDrawingGeneration(projectId, modelIdentityId))
      .rejects.toThrow("An accepted CAD completion");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
  it("selects the newest accepted completion for the target model", async () => {
    const newerCompletionId = "f4b3cf1f-37fa-446d-9777-825a6ece24c7";
    const nextRevisionId = "e07ef560-4a89-4c44-b2d9-a93c47d11298";
    const priorHeadId = "e07ef560-4a89-4c44-b2d9-a93c47d11297";
    const fetchStub = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ completions: [
        acceptedCompletion(),
        { ...acceptedCompletion(newerCompletionId), created_at: "2026-11-22T07:55:00.000Z" },
        { ...acceptedCompletion("f4b3cf1f-37fa-446d-9777-825a6ece24c8"), model_identity_id: "00000000-0000-4000-8000-000000000000", created_at: "2026-11-22T08:05:00.000Z" },
        { ...acceptedCompletion("f4b3cf1f-37fa-446d-9777-825a6ece24c9"), status: "REJECTED", created_at: "2026-11-22T08:10:00.000Z" }
      ] }))
      .mockResolvedValueOnce(jsonResponse({
        revisions: [{ id: priorHeadId, source_completion_id: completionId, revision_number: 1 }],
        count: 1
      }))
      .mockResolvedValueOnce(jsonResponse({ revision: { geometryRevisionId: nextRevisionId }, persisted: true }, 201))
      .mockResolvedValueOnce(jsonResponse({ drawing: { id: drawingId } }, 201));
    vi.stubGlobal("fetch", fetchStub);

    await expect(submitShaftDrawingGeneration(projectId, modelIdentityId)).resolves.toBe(drawingId);

    const [, createRevision] = fetchStub.mock.calls[2] as unknown as [string, RequestInit];
    expect(JSON.parse(String(createRevision.body))).toEqual({
      projectId,
      completionId: newerCompletionId,
      expectedParentRevisionId: priorHeadId
    });
  });

});
