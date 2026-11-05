import { describe, expect, it } from "vitest";
import { parseSTLPreview } from "../src/cad/stl-preview";

function asciiTriangle(): ArrayBuffer {
  const source = [
    "solid sample",
    "facet normal 0 0 1",
    "outer loop",
    "vertex 0 0 0",
    "vertex 1 0 0",
    "vertex 0 1 0",
    "endloop",
    "endfacet",
    "endsolid sample"
  ].join("\n");
  return new TextEncoder().encode(source).buffer;
}

function binaryTriangle(): ArrayBuffer {
  const buffer = new ArrayBuffer(134);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true);
  const values = [
    0, 0, 1,
    0, 0, 0,
    1, 0, 0,
    0, 1, 0
  ];
  values.forEach((value, index) => view.setFloat32(84 + index * 4, value, true));
  view.setUint16(132, 0, true);
  return buffer;
}

describe("parseSTLPreview", () => {
  it("parses and normalizes an ASCII STL triangle", () => {
    const mesh = parseSTLPreview(asciiTriangle());
    expect(mesh.triangleCount).toBe(1);
    expect(mesh.positions).toHaveLength(9);
    expect(mesh.normals[2]).toBeCloseTo(1);
    expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
  });

  it("parses a binary STL triangle", () => {
    const mesh = parseSTLPreview(binaryTriangle());
    expect(mesh.triangleCount).toBe(1);
    expect(mesh.positions).toHaveLength(9);
    expect(mesh.normals[2]).toBeCloseTo(1);
  });

  it("rejects an empty or malformed STL", () => {
    expect(() => parseSTLPreview(new ArrayBuffer(16))).toThrow(/readable STL mesh/);
  });
});
