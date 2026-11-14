import { describe, expect, it } from "vitest";
import { listCADArtifactViewers, resolveCADArtifactViewer } from "../src/cad/viewer-registry.js";

describe("CAD artifact viewer registry", () => {
  it("registers only the existing STL preview as a browser geometry viewer", () => {
    expect(resolveCADArtifactViewer("STL")).toMatchObject({
      artifactKind: "STL",
      mode: "STL_PREVIEW",
      previewAvailable: true,
      downloadAvailable: true
    });
    expect(resolveCADArtifactViewer("stl")).toEqual(resolveCADArtifactViewer("STL"));
  });

  it("enables a drawing preview only when trusted artifact metadata declares a supported media type", () => {
    for (const mediaType of ["application/pdf", "image/svg+xml", "application/dxf", "image/vnd.dxf"]) {
      expect(resolveCADArtifactViewer("DRAWING", mediaType)).toMatchObject({
        mode: "DRAWING_PREVIEW",
        previewAvailable: true,
        downloadAvailable: true
      });
    }
    for (const mediaType of [undefined, "text/html", "application/octet-stream", "image/png"]) {
      expect(resolveCADArtifactViewer("DRAWING", mediaType)).toMatchObject({
        mode: "DOWNLOAD_ONLY",
        previewAvailable: false,
        downloadAvailable: true
      });
    }
  });

  it("keeps canonical BREP and exchange formats download-only", () => {
    for (const kind of ["SOLID", "STEP", "THREE_MF", "SOURCE", "DRAWING"]) {
      expect(resolveCADArtifactViewer(kind)).toMatchObject({
        mode: "DOWNLOAD_ONLY",
        previewAvailable: false,
        downloadAvailable: true
      });
    }
  });

  it("fails closed for malformed or unknown artifact kinds", () => {
    for (const kind of [undefined, null, 12, {}, "IFC", "GLTF", "constructor", "toString", "__proto__"]) {
      expect(resolveCADArtifactViewer(kind)).toMatchObject({
        mode: "UNSUPPORTED",
        previewAvailable: false,
        downloadAvailable: false
      });
    }
  });

  it("does not expose a validation or approval state that a viewer could promote", () => {
    const stl = resolveCADArtifactViewer("STL");
    expect(stl).not.toHaveProperty("validationStatus");
    expect(stl).not.toHaveProperty("verificationStatus");
    expect(stl).not.toHaveProperty("approvalStatus");
    expect(stl.trustBoundary).toContain("does not establish mesh quality");
    expect(stl.trustBoundary).toContain("does not");
  });

  it("returns defensive copies of the static registry", () => {
    const first = listCADArtifactViewers();
    first[0].mode = "UNSUPPORTED";
    expect(listCADArtifactViewers().some((item) => item.mode === "UNSUPPORTED")).toBe(false);
  });
});
