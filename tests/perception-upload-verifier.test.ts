import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PointCloudUploadVerificationError,
  PointCloudUploadVerifier,
} from "../src/perception/upload-verifier.js";

function verifyChunks(format: "PLY" | "PCD" | "XYZ", source: string, chunkSize = 13) {
  const bytes = Buffer.from(source, "utf8");
  const verifier = new PointCloudUploadVerifier(format, bytes.byteLength);
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    verifier.push(bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize)));
  }
  return { bytes, result: verifier.finish() };
}

describe("bounded point-cloud upload preflight", () => {
  it("streams PLY header parsing and hashing across arbitrary chunk boundaries", () => {
    const source = [
      "ply",
      "format ascii 1.0",
      "element vertex 4",
      "property float x",
      "property float y",
      "property float z",
      "end_header",
      "0 0 0",
      "10 0 0",
      "0 10 0",
      "0 0 10",
      "",
    ].join("\n");
    const { bytes, result } = verifyChunks("PLY", source, 7);
    expect(result).toMatchObject({
      format: "PLY",
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      declaredPointCount: 4,
      verification: "HASH_AND_FORMAT_HEADER_PREFLIGHT",
      inspectionStatus: "PENDING_OPEN3D_INSPECTION",
    });
  });

  it("accepts PCD with explicit XYZ fields and bounded point count", () => {
    const source = [
      "# .PCD v0.7 - Point Cloud Data file format",
      "VERSION 0.7",
      "FIELDS x y z",
      "SIZE 4 4 4",
      "TYPE F F F",
      "COUNT 1 1 1",
      "WIDTH 4",
      "HEIGHT 1",
      "POINTS 4",
      "DATA ascii",
      "0 0 0",
      "10 0 0",
      "0 10 0",
      "0 0 10",
      "",
    ].join("\n");
    expect(verifyChunks("PCD", source).result.declaredPointCount).toBe(4);
  });

  it("counts only finite XYZ triples and ignores blank/comment lines", () => {
    const source = "# XYZ scan\n0 0 0\n\n10 0 0\n0 10 0\n0 0 10\n";
    const { bytes, result } = verifyChunks("XYZ", source, 5);
    expect(result.declaredPointCount).toBe(4);
    expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("rejects format mismatch, missing coordinate fields, and unsupported encodings", () => {
    const badPly = "not-ply\nformat ascii 1.0\nelement vertex 3\nend_header\n";
    expect(() => verifyChunks("PLY", badPly)).toThrow(
      expect.objectContaining({ code: "POINT_CLOUD_FORMAT_MISMATCH" }),
    );
    const noZ = "ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nend_header\n";
    expect(() => verifyChunks("PLY", noZ)).toThrow(
      expect.objectContaining({ code: "POINT_CLOUD_COORDINATE_FIELDS_MISSING" }),
    );
    const unsupported = "# .PCD v0.7\nFIELDS x y z\nPOINTS 3\nDATA custom\n";
    expect(() => verifyChunks("PCD", unsupported)).toThrow(
      expect.objectContaining({ code: "POINT_CLOUD_ENCODING_UNSUPPORTED" }),
    );
  });

  it("rejects non-finite XYZ coordinates and malformed point rows", () => {
    expect(() => verifyChunks("XYZ", "0 0 0\n1 1 1\nNaN 2 3\n")).toThrow(
      expect.objectContaining({ code: "XYZ_COORDINATES_INVALID" }),
    );
    expect(() => verifyChunks("XYZ", "0 0 0\n1 1\n2 2 2\n")).toThrow(
      expect.objectContaining({ code: "XYZ_COORDINATES_INVALID" }),
    );
  });

  it("rejects size mismatch and headers that exceed the bounded preflight window", () => {
    const bytes = Buffer.from("0 0 0\n1 1 1\n2 2 2\n");
    const verifier = new PointCloudUploadVerifier("XYZ", bytes.byteLength + 1);
    verifier.push(bytes);
    expect(() => verifier.finish()).toThrow(
      expect.objectContaining({ code: "UPLOAD_BYTE_SIZE_MISMATCH" }),
    );

    const hugeHeader = "ply\nformat ascii 1.0\ncomment " + "x".repeat(70 * 1024);
    const headerVerifier = new PointCloudUploadVerifier("PLY", Buffer.byteLength(hugeHeader));
    expect(() => headerVerifier.push(Buffer.from(hugeHeader))).toThrow(
      expect.objectContaining({ code: "POINT_CLOUD_HEADER_TOO_LARGE" }),
    );
  });

  it("does not emit raw uploaded text in validation errors", () => {
    try {
      verifyChunks("XYZ", "0 0 0\nPRIVATE_SCAN_MARKER\n");
      throw new Error("Expected malformed scan to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PointCloudUploadVerificationError);
      expect((error as Error).message).not.toContain("PRIVATE_SCAN_MARKER");
    }
  });
});
