import { createHash } from "node:crypto";
import { validateCADGeometrySource, type CADGeometrySource } from "../cad/geometry-kernel-contract.js";
import type { CADGeometryExecutor } from "./docker-occt-geometry.js";
import type { RemoteCADWorkerConfig } from "./remote-cad-worker.js";

const MAX_REMOTE_GEOMETRY_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 55_000;

type WorkerResponse = {
  status: string;
  providerId: string;
  providerVersion: string;
  artifactSha256: string;
  errors: string[];
  limitations: string[];
  topology?: {
    solids: number; shells: number; faces: number; edges: number; vertices: number; valid: boolean;
  };
  tessellation?: {
    vertexCount: number;
    triangleCount: number;
    positionsFloat32LE: string;
    normalsFloat32LE: string;
    indicesUint32LE: string;
    linearDeflectionMm: number;
    angularDeflectionRad: number;
    relativeDeflection: boolean;
    units: string;
    coordinateFrame: string;
  };
};

function decodeFloat32(value: string, expectedLength: number): Float32Array {
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength !== expectedLength * 4) throw new Error("Remote OCCT mesh float buffer length is inconsistent.");
  const output = new Float32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) output[index] = bytes.readFloatLE(index * 4);
  if (!output.every(Number.isFinite)) throw new Error("Remote OCCT mesh contains non-finite values.");
  return output;
}

function decodeUint32(value: string, expectedLength: number): Uint32Array {
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength !== expectedLength * 4) throw new Error("Remote OCCT mesh index buffer length is inconsistent.");
  const output = new Uint32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) output[index] = bytes.readUInt32LE(index * 4);
  return output;
}

function validateRemoteGeometryContract(source: CADGeometrySource): void {
  const errors = validateCADGeometrySource(source);
  if (errors.length) throw new Error(errors.join("; "));
  if (source.units !== "mm" || source.coordinateFrame !== "MODEL") {
    throw new Error("Remote OCCT geometry worker accepts millimetre model-frame sources only.");
  }
}

function validateRemoteSourceSize(bytes: Uint8Array): void {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_REMOTE_GEOMETRY_BYTES) {
    throw new Error("Remote OCCT geometry source must contain 1 byte to 4 MiB.");
  }
}

function calculateRemoteSourceDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateRemoteSourceBytes(source: CADGeometrySource): string {
  if (!(source.bytes instanceof Uint8Array)) {
    throw new Error("Remote OCCT geometry source bytes are invalid.");
  }
  validateRemoteSourceSize(source.bytes);
  const digest = calculateRemoteSourceDigest(source.bytes);
  if (digest !== source.sha256) throw new Error("Remote OCCT geometry source SHA-256 does not match the exact bytes.");
  return digest;
}

function validateRemoteSource(source: CADGeometrySource): string {
  validateRemoteGeometryContract(source);
  return validateRemoteSourceBytes(source);
}

function isSupportedLinearDeflection(value: number): boolean {
  return Number.isFinite(value) && value >= 0.001 && value <= 5;
}

function isSupportedAngularDeflection(value: number): boolean {
  return Number.isFinite(value) && value >= 0.01 && value <= Math.PI / 2;
}

function validateRemoteDeflection(options?: { linearDeflectionMm: number; angularDeflectionRad: number }): void {
  if (!options) throw new Error("Remote OCCT tessellation deflection settings are required.");
  if (!isSupportedLinearDeflection(options.linearDeflectionMm)) {
    throw new Error("Remote OCCT linear tessellation deflection is outside the supported bounds.");
  }
  if (!isSupportedAngularDeflection(options.angularDeflectionRad)) {
    throw new Error("Remote OCCT angular tessellation deflection is outside the supported bounds.");
  }
}

function geometryRequestPayload(
  operation: "INSPECT" | "TESSELLATE",
  source: CADGeometrySource,
  digest: string,
  options?: { linearDeflectionMm: number; angularDeflectionRad: number }
) {
  return {
    operation,
    format: source.format,
    artifactBase64: Buffer.from(source.bytes).toString("base64"),
    artifactSha256: digest,
    ...(options ? options : {})
  };
}

function workerRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Remote OCCT geometry worker returned malformed JSON.");
  }
  return payload as Record<string, unknown>;
}

function validWorkerEnvelope(result: Record<string, unknown>, digest: string): boolean {
  return result.status === "COMPLETED" && result.artifactSha256 === digest &&
    typeof result.providerId === "string" && typeof result.providerVersion === "string" &&
    Array.isArray(result.errors) && Array.isArray(result.limitations);
}

function workerFailureMessage(result: Record<string, unknown>): string {
  if (Array.isArray(result.errors)) {
    return result.errors.filter((item): item is string => typeof item === "string").join("; ");
  }
  return typeof result.error === "string" ? result.error : "";
}

function parseWorkerResponse(payload: unknown, responseOk: boolean, digest: string): WorkerResponse {
  const result = workerRecord(payload);
  if (!responseOk || !validWorkerEnvelope(result, digest)) {
    const detail = workerFailureMessage(result).trim();
    throw new Error((detail || "Remote OCCT geometry response failed its digest or protocol contract.").slice(0, 500));
  }
  return result as unknown as WorkerResponse;
}

function validateTopology(topology: WorkerResponse["topology"]) {
  if (!topology || ![topology.solids, topology.shells, topology.faces, topology.edges, topology.vertices]
    .every((value) => Number.isSafeInteger(value) && value >= 0) || typeof topology.valid !== "boolean") {
    throw new Error("Remote OCCT geometry worker returned malformed topology metadata.");
  }
  return topology;
}

function validateRemoteMeshCounts(mesh: NonNullable<WorkerResponse["tessellation"]>): void {
  if (!Number.isSafeInteger(mesh.vertexCount) || mesh.vertexCount < 3 || mesh.vertexCount > 750_000 ||
      !Number.isSafeInteger(mesh.triangleCount) || mesh.triangleCount < 1 || mesh.triangleCount > 250_000) {
    throw new Error("Remote OCCT geometry worker returned invalid tessellation counts.");
  }
}

function decodeRemoteMeshBuffers(mesh: NonNullable<WorkerResponse["tessellation"]>) {
  const positions = decodeFloat32(mesh.positionsFloat32LE, mesh.vertexCount * 3);
  const normals = decodeFloat32(mesh.normalsFloat32LE, mesh.vertexCount * 3);
  const indices = decodeUint32(mesh.indicesUint32LE, mesh.triangleCount * 3);
  if (indices.some((index) => index >= mesh.vertexCount)) {
    throw new Error("Remote OCCT geometry worker returned an out-of-range mesh index.");
  }
  return { positions, normals, indices };
}

function decodeRemoteMesh(result: WorkerResponse, source: CADGeometrySource) {
  const mesh = result.tessellation;
  if (!mesh) throw new Error("Remote OCCT geometry worker omitted tessellation.");
  validateRemoteMeshCounts(mesh);
  return {
    ...decodeRemoteMeshBuffers(mesh),
    linearDeflectionMm: mesh.linearDeflectionMm,
    angularDeflectionRad: mesh.angularDeflectionRad,
    sourceArtifactId: source.artifactId,
    sourceArtifactSha256: source.sha256,
    providerId: result.providerId,
    providerVersion: result.providerVersion
  };
}

/** Authenticated HTTPS adapter for the bounded Render geometry worker. */
export class RemoteOCCTGeometryExecutor implements CADGeometryExecutor {
  constructor(private readonly config: RemoteCADWorkerConfig) {}

  private async execute(operation: "INSPECT" | "TESSELLATE", source: CADGeometrySource, options?: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }): Promise<WorkerResponse> {
    const digest = validateRemoteSource(source);
    if (operation === "TESSELLATE") validateRemoteDeflection(options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(new URL("/v1/cad/geometry", this.config.baseUrl), {
        method: "POST",
        headers: {
          authorization: "Bearer " + this.config.token,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(geometryRequestPayload(operation, source, digest, options)),
        cache: "no-store",
        signal: controller.signal
      });
      const payload: unknown = await response.json().catch(() => ({}));
      return parseWorkerResponse(payload, response.ok, digest);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Remote OCCT geometry operation exceeded its request timeout.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async inspect(source: CADGeometrySource) {
    const result = await this.execute("INSPECT", source);
    return validateTopology(result.topology);
  }

  async tessellate(source: CADGeometrySource, options: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }) {
    const result = await this.execute("TESSELLATE", source, options);
    return decodeRemoteMesh(result, source);
  }
}
