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

function validateVertexCount(positions: Float32Array): number {
  const vertexCount = positions.length / 3;
  if (!Number.isInteger(vertexCount)) throw new Error("GLB mesh counts, normals or indices are invalid.");
  if (vertexCount < 3 || vertexCount > MAX_VERTICES) throw new Error("GLB mesh counts, normals or indices are invalid.");
  return vertexCount;
}

function validateNormalBuffer(positions: Float32Array, normals: Float32Array): void {
  if (normals.length !== positions.length) throw new Error("GLB mesh counts, normals or indices are invalid.");
}

function validateTriangleCount(indices: Uint32Array): number {
  if (indices.length < 3 || indices.length % 3 !== 0) throw new Error("GLB mesh counts, normals or indices are invalid.");
  const triangleCount = indices.length / 3;
  if (triangleCount > MAX_TRIANGLES) throw new Error("GLB mesh counts, normals or indices are invalid.");
  return triangleCount;
}

function validateIndexRange(indices: Uint32Array, vertexCount: number): void {
  if (indices.some((index) => index >= vertexCount)) throw new Error("GLB mesh counts, normals or indices are invalid.");
}

function validateMeshBuffers(positions: Float32Array, normals: Float32Array, indices: Uint32Array): number {
  const vertexCount = validateVertexCount(positions);
  validateNormalBuffer(positions, normals);
  const triangleCount = validateTriangleCount(indices);
  validateIndexRange(indices, vertexCount);
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

interface IndexedMeshExpansionInput {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  center: number[];
  radius: number;
}

function expandIndexedMesh(input: IndexedMeshExpansionInput) {
  const { positions, normals, indices, center, radius } = input;
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
  return { ...expandIndexedMesh({ positions, normals, indices, center, radius }), triangleCount };
}

function validateGLBByteLength(byteLength: number): void {
  if (byteLength < 28) throw new Error("GLB is empty or exceeds the 32 MiB preview limit.");
  if (byteLength > MAX_GLB_BYTES) throw new Error("GLB is empty or exceeds the 32 MiB preview limit.");
}

function validateGLBMagicAndVersion(view: DataView): void {
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("GLB header or declared file length is invalid.");
  if (view.getUint32(4, true) !== 2) throw new Error("GLB header or declared file length is invalid.");
}

function validateGLBDeclaredLength(view: DataView, byteLength: number): void {
  if (view.getUint32(8, true) !== byteLength) throw new Error("GLB header or declared file length is invalid.");
}

function validateGLBHeader(buffer: ArrayBuffer, view: DataView): void {
  validateGLBByteLength(buffer.byteLength);
  validateGLBMagicAndVersion(view);
  validateGLBDeclaredLength(view, buffer.byteLength);
}

function validateGLBJsonChunkType(view: DataView): void {
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB JSON chunk is invalid.");
}

function validateGLBJsonChunkLength(jsonLength: number): void {
  if (jsonLength < 2) throw new Error("GLB JSON chunk is invalid.");
  if (jsonLength % 4 !== 0) throw new Error("GLB JSON chunk is invalid.");
}

function validateGLBJsonChunkBounds(jsonLength: number, byteLength: number): void {
  if (20 + jsonLength + 8 > byteLength) throw new Error("GLB JSON chunk is invalid.");
}

function parseGLBJsonChunk(buffer: ArrayBuffer, view: DataView): { document: GLTFDocument; binaryHeader: number } {
  const jsonLength = view.getUint32(12, true);
  validateGLBJsonChunkType(view);
  validateGLBJsonChunkLength(jsonLength);
  validateGLBJsonChunkBounds(jsonLength, buffer.byteLength);
  try {
    const document = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength))) as GLTFDocument;
    return { document, binaryHeader: 20 + jsonLength };
  } catch {
    throw new Error("GLB JSON chunk could not be parsed.");
  }
}

function validateGLBBinaryChunk(view: DataView, buffer: ArrayBuffer, binaryHeader: number): number {
  const binaryLength = view.getUint32(binaryHeader, true);
  const validChunk = view.getUint32(binaryHeader + 4, true) === 0x004e4942 &&
    binaryHeader + 8 + binaryLength === buffer.byteLength;
  if (!validChunk) throw new Error("GLB binary chunk is invalid.");
  return binaryLength;
}

function validateGLTFAssetVersion(document: GLTFDocument): void {
  if (document.asset?.version !== "2.0") throw new Error("GLB asset version must be 2.0.");
}

function requireSingleGLBBuffer(document: GLTFDocument): NonNullable<GLTFDocument["buffers"]>[number] {
  const buffers = document.buffers;
  if (!buffers || buffers.length !== 1) throw new Error("GLB must declare exactly one binary buffer.");
  const buffer = buffers[0];
  if (!buffer) throw new Error("GLB binary buffer declaration is missing.");
  return buffer;
}

function validateEmbeddedGLBBufferUri(buffer: NonNullable<GLTFDocument["buffers"]>[number]): void {
  if (buffer.uri !== undefined) throw new Error("GLB buffer declaration cannot reference external buffers.");
}

function validateEmbeddedGLBBufferLength(
  buffer: NonNullable<GLTFDocument["buffers"]>[number],
  binaryLength: number
): void {
  if (buffer.byteLength !== binaryLength) throw new Error("GLB buffer length does not match its binary chunk.");
}

function validateSingleEmbeddedBuffer(document: GLTFDocument, binaryLength: number): void {
  const buffer = requireSingleGLBBuffer(document);
  validateEmbeddedGLBBufferUri(buffer);
  validateEmbeddedGLBBufferLength(buffer, binaryLength);
}

function validateGLBBufferDeclaration(document: GLTFDocument, binaryLength: number): void {
  validateGLTFAssetVersion(document);
  validateSingleEmbeddedBuffer(document, binaryLength);
}

function readGLBBinaryChunk(buffer: ArrayBuffer, view: DataView, document: GLTFDocument, binaryHeader: number): DataView {
  const binaryLength = validateGLBBinaryChunk(view, buffer, binaryHeader);
  validateGLBBufferDeclaration(document, binaryLength);
  return new DataView(buffer, binaryHeader + 8, binaryLength);
}

function readGLBChunks(buffer: ArrayBuffer): { document: GLTFDocument; binary: DataView } {
  const view = new DataView(buffer);
  validateGLBHeader(buffer, view);
  const { document, binaryHeader } = parseGLBJsonChunk(buffer, view);
  return { document, binary: readGLBBinaryChunk(buffer, view, document, binaryHeader) };
}

type ValidSourceLineage = {
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  units: "mm";
  coordinateFrame: "MODEL";
};

function validateSourceArtifactId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("GLB source artifact identity is invalid.");
  }
}

function validateSourceArtifactDigest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("GLB source artifact digest is invalid.");
  }
}

function validateSourceCoordinateFrame(extras: NonNullable<GLTFDocument["extras"]>): void {
  if (extras.units !== "mm" || extras.coordinateFrame !== "MODEL") {
    throw new Error("GLB source units or coordinate frame is invalid.");
  }
}

function validateSourceLineage(document: GLTFDocument): ValidSourceLineage {
  const extras = document.extras;
  if (!extras) throw new Error("GLB source lineage is missing.");
  validateSourceArtifactId(extras.sourceArtifactId);
  validateSourceArtifactDigest(extras.sourceArtifactSha256);
  validateSourceCoordinateFrame(extras);
  return extras as ValidSourceLineage;
}

function hasSingleTrianglePrimitive(document: GLTFDocument): boolean {
  const primitives = document.meshes?.[0]?.primitives;
  return document.meshes?.length === 1 && primitives?.length === 1 && primitives[0].mode === 4;
}

function hasSingleMeshNode(document: GLTFDocument): boolean {
  return document.nodes?.length === 1 && document.nodes[0].mesh === 0;
}

function hasSingleSceneRoot(document: GLTFDocument): boolean {
  const roots = document.scenes?.[0]?.nodes;
  return document.scenes?.length === 1 && document.scene === 0 && roots?.length === 1 && roots[0] === 0;
}

function hasSingleMeshScene(document: GLTFDocument): boolean {
  return hasSingleTrianglePrimitive(document) && hasSingleMeshNode(document) && hasSingleSceneRoot(document);
}

function readSingleMeshPrimitive(document: GLTFDocument): GLTFPrimitive {
  if (!hasSingleMeshScene(document)) {
    throw new Error("GLB must contain one bounded triangle mesh and one scene node.");
  }
  return document.meshes![0].primitives![0];
}

function isAccessorIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validatePrimitiveAttributes(primitive: GLTFPrimitive): void {
  const attributes = primitive.attributes;
  if (!isRecord(attributes)) throw new Error("GLB mesh attributes are incomplete.");
  if (!isAccessorIndex(attributes.POSITION)) throw new Error("GLB mesh attributes are incomplete.");
  if (!isAccessorIndex(attributes.NORMAL)) throw new Error("GLB mesh attributes are incomplete.");
  if (!isAccessorIndex(primitive.indices)) throw new Error("GLB mesh attributes are incomplete.");
}

function validateSingleMeshScene(document: GLTFDocument): GLTFPrimitive {
  const primitive = readSingleMeshPrimitive(document);
  validatePrimitiveAttributes(primitive);
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
