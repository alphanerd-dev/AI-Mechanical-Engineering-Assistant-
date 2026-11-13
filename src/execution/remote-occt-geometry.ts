import { createHash } from "node:crypto";
import type { CADGeometrySource } from "../cad/geometry-kernel-contract.js";
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

/** Authenticated HTTPS adapter for the bounded Render geometry worker. */
export class RemoteOCCTGeometryExecutor implements CADGeometryExecutor {
  constructor(private readonly config: RemoteCADWorkerConfig) {}

  private async execute(operation: "INSPECT" | "TESSELLATE", source: CADGeometrySource, options?: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }): Promise<WorkerResponse> {
    if (!(source.bytes instanceof Uint8Array) || source.bytes.byteLength < 1 ||
        source.bytes.byteLength > MAX_REMOTE_GEOMETRY_BYTES) {
      throw new Error("Remote OCCT geometry source must contain 1 byte to 4 MiB.");
    }
    const digest = createHash("sha256").update(source.bytes).digest("hex");
    if (digest !== source.sha256) throw new Error("Remote OCCT geometry source SHA-256 does not match the exact bytes.");
    if (source.units !== "mm" || source.coordinateFrame !== "MODEL") {
      throw new Error("Remote OCCT geometry worker accepts millimetre model-frame sources only.");
    }
    if (operation === "TESSELLATE") {
      if (!options || !Number.isFinite(options.linearDeflectionMm) ||
          options.linearDeflectionMm < 0.001 || options.linearDeflectionMm > 5 ||
          !Number.isFinite(options.angularDeflectionRad) ||
          options.angularDeflectionRad < 0.01 || options.angularDeflectionRad > Math.PI / 2) {
        throw new Error("Remote OCCT tessellation deflection is outside the supported bounds.");
      }
    }
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
        body: JSON.stringify({
          operation,
          format: source.format,
          artifactBase64: Buffer.from(source.bytes).toString("base64"),
          artifactSha256: digest,
          ...(options ? options : {})
        }),
        cache: "no-store",
        signal: controller.signal
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Remote OCCT geometry worker returned malformed JSON.");
      }
      const result = payload as Record<string, unknown>;
      if (!response.ok || result.status !== "COMPLETED" ||
          result.artifactSha256 !== digest ||
          typeof result.providerId !== "string" || typeof result.providerVersion !== "string" ||
          !Array.isArray(result.errors) || !Array.isArray(result.limitations)) {
        const detail = Array.isArray(result.errors)
          ? result.errors.filter((item): item is string => typeof item === "string").join("; ")
          : typeof result.error === "string" ? result.error : "";
        throw new Error((detail.trim() || "Remote OCCT geometry response failed its digest or protocol contract.").slice(0, 500));
      }
      return result as unknown as WorkerResponse;
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
    if (!result.topology || ![result.topology.solids, result.topology.shells, result.topology.faces,
      result.topology.edges, result.topology.vertices].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      typeof result.topology.valid !== "boolean") {
      throw new Error("Remote OCCT geometry worker returned malformed topology metadata.");
    }
    return result.topology;
  }

  async tessellate(source: CADGeometrySource, options: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }) {
    const result = await this.execute("TESSELLATE", source, options);
    const mesh = result.tessellation;
    if (!mesh || !Number.isSafeInteger(mesh.vertexCount) || mesh.vertexCount < 3 || mesh.vertexCount > 750_000 ||
        !Number.isSafeInteger(mesh.triangleCount) || mesh.triangleCount < 1 || mesh.triangleCount > 250_000) {
      throw new Error("Remote OCCT geometry worker returned invalid tessellation counts.");
    }
    const positions = decodeFloat32(mesh.positionsFloat32LE, mesh.vertexCount * 3);
    const normals = decodeFloat32(mesh.normalsFloat32LE, mesh.vertexCount * 3);
    const indices = decodeUint32(mesh.indicesUint32LE, mesh.triangleCount * 3);
    if (indices.some((index) => index >= mesh.vertexCount)) {
      throw new Error("Remote OCCT geometry worker returned an out-of-range mesh index.");
    }
    return {
      positions, normals, indices,
      linearDeflectionMm: mesh.linearDeflectionMm,
      angularDeflectionRad: mesh.angularDeflectionRad,
      sourceArtifactId: source.artifactId,
      sourceArtifactSha256: source.sha256,
      providerId: result.providerId,
      providerVersion: result.providerVersion
    };
  }
}
