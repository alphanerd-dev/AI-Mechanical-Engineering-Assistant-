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
  const number = "([-+]?(?:\\\\d+(?:\\\\.\\\\d*)?|\\\\.\\\\d+)(?:[eE][-+]?\\\\d+)?)";
  const expression = new RegExp("\\\\bvertex\\\\s+" + number + "\\\\s+" + number + "\\\\s+" + number, "gi");
  const vertices: Point3[] = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    const point: Point3 = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (!point.every(Number.isFinite)) throw new Error("The STL contains non-finite vertex coordinates.");
    vertices.push(point);
    if (vertices.length / 3 > MAX_PREVIEW_TRIANGLES) {
      throw new Error("This STL is too large for an in-browser preview. Use the CAD export instead.");
    }
  }
  return vertices;
}

/** Parse binary or ASCII STL and return a centered, normalized triangle mesh for preview. */
export function parseSTLPreview(buffer: ArrayBuffer): STLMeshPreview {
  const vertices = readBinarySTL(buffer) ?? readAsciiSTL(buffer);
  if (vertices.length < 3 || vertices.length % 3 !== 0) {
    throw new Error("The file is not a readable STL mesh or contains no complete triangles.");
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of vertices) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  const center: Point3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  let radius = 0;
  for (const [x, y, z] of vertices) {
    radius = Math.max(radius, Math.hypot(x - center[0], y - center[1], z - center[2]));
  }
  if (!Number.isFinite(radius) || radius < 1e-12) {
    throw new Error("The STL has zero-size geometry and cannot be displayed.");
  }

  const positions = new Float32Array(vertices.length * 3);
  const normals = new Float32Array(vertices.length * 3);
  for (let index = 0; index < vertices.length; index += 3) {
    const a = vertices[index], b = vertices[index + 1], c = vertices[index + 2];
    const ab: Point3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Point3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross: Point3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const magnitude = Math.hypot(cross[0], cross[1], cross[2]);
    const normal: Point3 = magnitude > 1e-12
      ? [cross[0] / magnitude, cross[1] / magnitude, cross[2] / magnitude]
      : [0, 0, 1];

    for (let vertex = 0; vertex < 3; vertex += 1) {
      const point = vertices[index + vertex];
      const offset = (index + vertex) * 3;
      positions[offset] = (point[0] - center[0]) / radius;
      positions[offset + 1] = (point[1] - center[1]) / radius;
      positions[offset + 2] = (point[2] - center[2]) / radius;
      normals[offset] = normal[0];
      normals[offset + 1] = normal[1];
      normals[offset + 2] = normal[2];
    }
  }

  return { positions, normals, triangleCount: vertices.length / 3 };
}
