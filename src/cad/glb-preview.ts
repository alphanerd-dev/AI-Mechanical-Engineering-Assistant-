import type { STLMeshPreview } from "./stl-preview";

export interface CADDisplayMeshPreview extends STLMeshPreview {
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  units: "mm";
  coordinateFrame: "MODEL";
}

const MAX_GLB_BYTES = 32 * 1024 * 1024;
const MAX_VERTICES = 750_000;
const MAX_TRIANGLES = 250_000;

type GLTFPrimitive = { attributes?: { POSITION?: number; NORMAL?: number }; indices?: number; mode?: number };
type GLTFDocument = {
  asset?: { version?: string };
  buffers?: Array<{ byteLength?: number; uri?: string }>;
  bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength?: number; byteStride?: number; target?: number }>;
  accessors?: Array<{ bufferView?: number; byteOffset?: number; componentType?: number; count?: number; type?: string; normalized?: boolean }>;
  meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number; NORMAL?: number }; indices?: number; mode?: number }>; }>;
  nodes?: Array<{ mesh?: number }>;
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
  extras?: { sourceArtifactId?: string; sourceArtifactSha256?: string; units?: string; coordinateFrame?: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAccessor(document: GLTFDocument, binary: DataView, accessorIndex: number, type: "VEC3" | "SCALAR", componentType: 5126 | 5125, maxCount: number): {
  count: number; values: Float32Array | Uint32Array;
} {
  const accessor = document.accessors?.[accessorIndex];
  if (!accessor || accessor.type !== type || accessor.componentType !== componentType ||
      accessor.normalized === true || !Number.isSafeInteger(accessor.count) ||
      !Number.isSafeInteger(accessor.byteOffset ?? 0) || (accessor.byteOffset ?? 0) < 0 ||
      accessor.count! < 1 || accessor.count! > maxCount ||
      !Number.isSafeInteger(accessor.bufferView)) {
    throw new Error("GLB accessor metadata is invalid or outside preview limits.");
  }
  const view = document.bufferViews?.[accessor.bufferView!];
  if (!view || view.buffer !== 0 || !Number.isSafeInteger(view.byteLength) ||
      !Number.isSafeInteger(view.byteOffset ?? 0) || view.byteStride !== undefined) {
    throw new Error("GLB buffer view is invalid or uses an unsupported interleaved layout.");
  }
  const components = type === "VEC3" ? 3 : 1;
  const componentBytes = 4;
  const requiredBytes = accessor.count! * components * componentBytes;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (offset < 0 || (accessor.byteOffset ?? 0) + requiredBytes > view.byteLength! || offset + requiredBytes > binary.byteLength) {
    throw new Error("GLB accessor points outside its declared binary buffer view.");
  }
  if (componentType === 5126) {
    const values = new Float32Array(accessor.count! * components);
    for (let index = 0; index < values.length; index += 1) values[index] = binary.getFloat32(offset + index * 4, true);
    if (!values.every(Number.isFinite)) throw new Error("GLB contains non-finite mesh coordinates or normals.");
    return { count: accessor.count!, values };
  }
  const values = new Uint32Array(accessor.count!);
  for (let index = 0; index < values.length; index += 1) values[index] = binary.getUint32(offset + index * 4, true);
  return { count: accessor.count!, values };
}

function validateMeshBuffers(positions: Float32Array, normals: Float32Array, indices: Uint32Array): number {
  const vertexCount = positions.length / 3;
  const triangleCount = indices.length / 3;
  if (vertexCount < 3 || vertexCount > MAX_VERTICES || normals.length !== positions.length ||
      indices.length < 3 || indices.length % 3 !== 0 || triangleCount > MAX_TRIANGLES ||
      indices.some((index) => index >= vertexCount)) {
    throw new Error("GLB mesh counts, normals or indices are invalid.");
  }
  return triangleCount;
}

function computeMeshNormalization(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  const center = min.map((value, axis) => (value + max[axis]) / 2);
  let radius = 0;
  for (let index = 0; index < positions.length; index += 3) {
    radius = Math.max(radius, Math.hypot(
      positions[index] - center[0], positions[index + 1] - center[1], positions[index + 2] - center[2]
    ));
  }
  if (!Number.isFinite(radius) || radius < 1e-12) throw new Error("GLB mesh has zero-size geometry.");
  return { center, radius };
}

function expandIndexedMesh(positions: Float32Array, normals: Float32Array, indices: Uint32Array, center: number[], radius: number) {
  const expandedPositions = new Float32Array(indices.length * 3);
  const expandedNormals = new Float32Array(indices.length * 3);
  for (let index = 0; index < indices.length; index += 1) {
    const sourceOffset = indices[index] * 3;
    const targetOffset = index * 3;
    expandedPositions[targetOffset] = (positions[sourceOffset] - center[0]) / radius;
    expandedPositions[targetOffset + 1] = (positions[sourceOffset + 1] - center[1]) / radius;
    expandedPositions[targetOffset + 2] = (positions[sourceOffset + 2] - center[2]) / radius;
    const nx = normals[sourceOffset], ny = normals[sourceOffset + 1], nz = normals[sourceOffset + 2];
    const magnitude = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(magnitude) || magnitude < 1e-12) throw new Error("GLB contains a zero-length vertex normal.");
    expandedNormals[targetOffset] = nx / magnitude;
    expandedNormals[targetOffset + 1] = ny / magnitude;
    expandedNormals[targetOffset + 2] = nz / magnitude;
  }
  return { positions: expandedPositions, normals: expandedNormals };
}

function normalizeAndExpand(positions: Float32Array, normals: Float32Array, indices: Uint32Array) {
  const triangleCount = validateMeshBuffers(positions, normals, indices);
  const { center, radius } = computeMeshNormalization(positions);
  return { ...expandIndexedMesh(positions, normals, indices, center, radius), triangleCount };
}

function validateGLBHeader(buffer: ArrayBuffer, view: DataView): void {
  if (buffer.byteLength < 28 || buffer.byteLength > MAX_GLB_BYTES) {
    throw new Error("GLB is empty or exceeds the 32 MiB preview limit.");
  }
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== buffer.byteLength) {
    throw new Error("GLB header or declared file length is invalid.");
  }
}

function parseGLBJsonChunk(buffer: ArrayBuffer, view: DataView): { document: GLTFDocument; binaryHeader: number } {
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength < 2 || jsonLength % 4 !== 0 ||
      20 + jsonLength + 8 > buffer.byteLength) {
    throw new Error("GLB JSON chunk is invalid.");
  }
  try {
    const document = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength))) as GLTFDocument;
    return { document, binaryHeader: 20 + jsonLength };
  } catch {
    throw new Error("GLB JSON chunk could not be parsed.");
  }
}

function readGLBBinaryChunk(buffer: ArrayBuffer, view: DataView, document: GLTFDocument, binaryHeader: number): DataView {
  const binaryLength = view.getUint32(binaryHeader, true);
  const validChunk = view.getUint32(binaryHeader + 4, true) === 0x004e4942 &&
    binaryHeader + 8 + binaryLength === buffer.byteLength;
  const validDocument = document.asset?.version === "2.0" && document.buffers?.length === 1 &&
    document.buffers[0].uri === undefined && document.buffers[0].byteLength === binaryLength;
  if (!validChunk || !validDocument) throw new Error("GLB binary chunk or buffer declaration is invalid.");
  return new DataView(buffer, binaryHeader + 8, binaryLength);
}

function readGLBChunks(buffer: ArrayBuffer): { document: GLTFDocument; binary: DataView } {
  const view = new DataView(buffer);
  validateGLBHeader(buffer, view);
  const { document, binaryHeader } = parseGLBJsonChunk(buffer, view);
  return { document, binary: readGLBBinaryChunk(buffer, view, document, binaryHeader) };
}

function validateSourceLineage(document: GLTFDocument) {
  const extras = document.extras;
  if (!extras || typeof extras.sourceArtifactId !== "string" || !extras.sourceArtifactId.trim() ||
      typeof extras.sourceArtifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(extras.sourceArtifactSha256) ||
      extras.units !== "mm" || extras.coordinateFrame !== "MODEL") {
    throw new Error("GLB source lineage, units or coordinate frame is invalid.");
  }
  return extras;
}

function validateSingleMeshScene(document: GLTFDocument) {
  if (document.meshes?.length !== 1 || document.meshes[0].primitives?.length !== 1 ||
      document.meshes[0].primitives[0].mode !== 4 || document.nodes?.length !== 1 ||
      document.nodes[0].mesh !== 0 || document.scenes?.length !== 1 ||
      document.scene !== 0 || document.scenes[0].nodes?.length !== 1 || document.scenes[0].nodes[0] !== 0) {
    throw new Error("GLB must contain one bounded triangle mesh and one scene node.");
  }
  const primitive = document.meshes[0].primitives![0];
  if (!isRecord(primitive.attributes) || !Number.isSafeInteger(primitive.attributes.POSITION) ||
      !Number.isSafeInteger(primitive.attributes.NORMAL) || !Number.isSafeInteger(primitive.indices)) {
    throw new Error("GLB mesh attributes are incomplete.");
  }
  return primitive;
}

function readTriangleMesh(document: GLTFDocument, binary: DataView, primitive: GLTFPrimitive) {
  const positionAccessor = readAccessor(document, binary, primitive.attributes!.POSITION!, "VEC3", 5126, MAX_VERTICES);
  const normalAccessor = readAccessor(document, binary, primitive.attributes!.NORMAL!, "VEC3", 5126, MAX_VERTICES);
  const indexAccessor = readAccessor(document, binary, primitive.indices!, "SCALAR", 5125, MAX_TRIANGLES * 3);
  if (positionAccessor.count !== normalAccessor.count) throw new Error("GLB positions and normals do not share the same vertex count.");
  return normalizeAndExpand(
    positionAccessor.values as Float32Array,
    normalAccessor.values as Float32Array,
    indexAccessor.values as Uint32Array
  );
}

/** Parse the bounded GLB v2 profile emitted by createCADDisplayGLB; external buffers are rejected. */
export function parseCADDisplayGLB(buffer: ArrayBuffer): CADDisplayMeshPreview {
  const { document, binary } = readGLBChunks(buffer);
  const extras = validateSourceLineage(document);
  const primitive = validateSingleMeshScene(document);
  const expanded = readTriangleMesh(document, binary, primitive);
  return {
    ...expanded,
    sourceArtifactId: extras.sourceArtifactId,
    sourceArtifactSha256: extras.sourceArtifactSha256,
    units: "mm",
    coordinateFrame: "MODEL"
  };
}
