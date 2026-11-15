import { describe, expect, it } from "vitest";
import { inspectCADDrawingUpload } from "../src/drawings/ingestion.js";
import {
  generateShaftOrthographicSvgDrawing,
  SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_ID,
  SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_VERSION
} from "../src/drawings/shaft-orthographic.js";

const baseInput = {
  drawingNumber: "MECH-SHAFT-001",
  title: "Drive shaft <prototype> & coupling",
  diameterMm: 20,
  lengthMm: 200,
  sourceGeometryRevisionId: "8e3d4d91-ef70-4c5d-94f7-6b83c92d83d1",
  sourceArtifactId: "solid-001",
  sourceArtifactSha256: "a".repeat(64),
  sourceRevisionNumber: 3
};

describe("source-bound shaft orthographic SVG drawing", () => {
  it("generates a deterministic safe-subset SVG with nominal dimensions and source lineage", () => {
    const first = generateShaftOrthographicSvgDrawing(baseInput);
    const second = generateShaftOrthographicSvgDrawing(baseInput);
    expect(first.svg).toBe(second.svg);
    expect(first.sha256).toBe(second.sha256);
    expect(first.format).toBe("SVG");
    expect(first.mediaType).toBe("image/svg+xml");
    expect(first.generatorId).toBe(SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_ID);
    expect(first.generatorVersion).toBe(SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_VERSION);
    expect(first.parameters.sourceArtifactSha256).toBe(baseInput.sourceArtifactSha256);
    expect(first.parameters.sourceRevisionNumber).toBe(3);
    expect(first.svg).toContain("L = 200.00 mm");
    expect(first.svg).toContain("Ø 20.00 mm");
    expect(first.svg).toContain('cx="264.00"');
    expect(first.svg).toContain("PRELIMINARY — NOT FOR MANUFACTURE");
    expect(first.svg).toContain("&lt;prototype&gt; &amp; coupling");
    expect(inspectCADDrawingUpload({
      filename: "MECH-SHAFT-001.svg",
      declaredMimeType: "image/svg+xml",
      bytes: first.bytes
    }).format).toBe("SVG");
  });

  it("rejects invalid dimensions, unsafe labels and unbound source identity", () => {
    expect(() => generateShaftOrthographicSvgDrawing({ ...baseInput, diameterMm: 0 })).toThrow(/diameterMm/);
    expect(() => generateShaftOrthographicSvgDrawing({ ...baseInput, lengthMm: Number.POSITIVE_INFINITY })).toThrow(/lengthMm/);
    expect(() => generateShaftOrthographicSvgDrawing({ ...baseInput, drawingNumber: "bad\nnumber" })).toThrow(/drawingNumber/);
    expect(() => generateShaftOrthographicSvgDrawing({ ...baseInput, sourceArtifactSha256: "not-a-digest" })).toThrow(/SHA-256/);
    expect(() => generateShaftOrthographicSvgDrawing({ ...baseInput, sourceRevisionNumber: 0 })).toThrow(/revision number/);
  });

  it("changes the content digest when nominal geometry or revision lineage changes", () => {
    const base = generateShaftOrthographicSvgDrawing(baseInput);
    const largerDiameter = generateShaftOrthographicSvgDrawing({ ...baseInput, diameterMm: 25 });
    const newerRevision = generateShaftOrthographicSvgDrawing({ ...baseInput, sourceRevisionNumber: 4 });
    expect(base.sha256).not.toBe(largerDiameter.sha256);
    expect(base.sha256).not.toBe(newerRevision.sha256);
  });
});
