export interface STLMeshPreview {
  positions: Float32Array;
  normals: Float32Array;
  triangleCount: number;
}

type Point3 = [number, number, number];

const MAX_PREVIEW_TRIANGLES = 1_000_000;

function readBinarySTL(buffer: ArrayBuffer): Point3[] | null {
  if (buffer.byteLength < 84) return null;
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  if (triangleCount < 1 || 84 + triangleCount * 50 !== buffer.byteLength) return null;
  if (triangleCount > MAX_PREVIEW_TRIANGLES) {
    throw new Error("This STL is too large for an in-browser preview. Use the CAD export instead.");
  }

  const vertices: Point3[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = 84 + triangle * 50 + 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const offset = base + vertex * 12;
      const point: Point3 = [
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true)
      ];
      if (!point.every(Number.isFinite)) throw new Error("The STL contains non-finite vertex coordinates.");
      vertices.push(point);
    }
  }
  return vertices;
}

function readAsciiSTL(buffer: ArrayBuffer): Point3[] {
  const text = new TextDecoder().decode(buffer);
  const expression = /\bvertex\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/gi;
  const vertiֻǱ˞