import { CADDisplayMesh, isCADDisplayMesh } from "./renderer-contract.js";

const MAX_GLB_BYTES = 32 * 1024 * 1024;

function align4(value: number): number {
  return (value + 3) & ~3;
}

function componentBounds(positions: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { min, max };
}

function encodeFloat32(values: Float32Array): Buffer {
  const output = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => output.writeFloatLE(value, index * 4));
  return output;
}

function encodeUint32(values: Uint32Array): Buffer {
  const output = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => output.writeUInt32LE(value, index * 4));
  return output;
}

/** Build a binary glTF 2.0 derivative without modifying or replacing canonical CAD bytes. */
export function createCADDisplayGLB(mesh: CADDisplayMesh): Buffer {
  if (!isCADDisplayMesh(mesh) || !mesh.normals || !mesh.indices) {
    throw new Error("A validated position/normal/index CAD display mesh is required.");
  }
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  if (vertexCount > 750_000 || triangleCount > 250_000) {
    throw new Error("CAD display mesh exceeds the configured GLB vertex or triangle limit.");
  }

  const positions = encodeFloat32(mesh.positions);
  const normals = encodeFloat32(mesh.normals);
  const indices = encodeUint32(mesh.indices);
  const positionOffset = 0;
  const normalOffset = align4(positions.length);
  const indexOffset = align4(normalOffset + normals.length);
  const binaryLength = align4(indexOffset + indices.length);
  const binary = Buffer.alloc(binaryLength);
  positions.copy(binary, positionOffset);
  normals.copy(binary, normalOffset);
  indices.copy(binary, indexOffset);

  const bounds = componentBounds(mesh.positions);
  const document = {
    asset: { version: "2.0", generator: "AI Mechanical Engineering Assistant / " + mesh.sourceArtifactId },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
        mode: 4
      }]
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [0.2588, 0.7843, 0.7059, 1],
        metallicFactor: 0.1,
        roughnessFactor: 0.65
      },
      doubleSided: false
    }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: normalOffset, byteLength: normals.length, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.length, target: 34963 }
    ],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: vertexCount, type: "VEC3", min: bounds.min, max: bounds.max },
      { bufferView: 1, byteOffset: 0, componentType: 5126, count: vertexCount, type: "VEC3" },
      { bufferView: 2, byteOffset: 0, componentType: 5125, count: indices.length, type: "SCALAR", min: [0], max: [mesh.indices.reduce((maximum, index) => Math.max(maximum, index), 0)] }
    ],
    extras: {
      sourceArtifactId: mesh.sourceArtifactId,
      sourceArtifactSha256: mesh.sourceArtifactSha256,
      units: mesh.units,
      coordinateFrame: mesh.coordinateFrame
    }
  };
  const json = Buffer.from(JSON.stringify(document), "utf8");
  const jsonLength = align4(json.length);
  const totalLength = 12 + 8 + jsonLength + 8 + binary.length;
  if (totalLength > MAX_GLB_BYTES) throw new Error("Generated GLB exceeds the 32 MiB display derivative limit.");

  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  glb.fill(0x20, 20 + json.length, 20 + jsonLength);
  const binaryHeaderOffset = 20 + jsonLength;
  glb.writeUInt32LE(binary.length, binaryHeaderOffset);
  glb.writeUInt32LE(0x004e4942, binaryHeaderOffset + 4);
  binary.copy(glb, binaryHeaderOffset + 8);
  return glb;
}
