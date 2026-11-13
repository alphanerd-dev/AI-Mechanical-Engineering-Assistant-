import {
  CADGeometryKernelAdapter,
  CADGeometryResult,
  CADGeometrySource,
  CADGeometryTessellation,
  CADGeometryTopologySummary,
  validateCADGeometrySource,
  verifyCADGeometrySourceDigest
} from "../cad/geometry-kernel-contract.js";
import { DockerOCCTGeometryExecutor } from "../execution/docker-occt-geometry.js";

/** Product adapter for the isolated OCCT geometry runtime. */
export class DockerOCCTGeometryKernelAdapter implements CADGeometryKernelAdapter {
  readonly providerId = "occt.geometry-kernel";
  readonly providerVersion = "build123d-0.13.0/OCP";

  constructor(private readonly executor: DockerOCCTGeometryExecutor) {}

  async inspect(source: CADGeometrySource): Promise<CADGeometryResult<CADGeometryTopologySummary>> {
    const errors = validateCADGeometrySource(source);
    if (errors.length) return { status: "FAILED", errors, limitations: [] };
    if (!(await verifyCADGeometrySourceDigest(source))) {
      return { status: "FAILED", errors: ["Geometry source bytes do not match the declared SHA-256 digest."], limitations: [] };
    }
    try {
      const value = await this.executor.inspect(source);
      return { status: "COMPLETED", value, errors: [], limitations: [] };
    } catch (error) {
      return {
        status: "FAILED",
        errors: [error instanceof Error ? error.message : "OCCT geometry inspection failed."],
        limitations: []
      };
    }
  }

  async tessellate(source: CADGeometrySource, options: {
    linearDeflectionMm: number;
    angularDeflectionRad: number;
  }): Promise<CADGeometryResult<CADGeometryTessellation>> {
    const errors = validateCADGeometrySource(source);
    if (errors.length) return { status: "FAILED", errors, limitations: [] };
    if (!(await verifyCADGeometrySourceDigest(source))) {
      return { status: "FAILED", errors: ["Geometry source bytes do not match the declared SHA-256 digest."], limitations: [] };
    }
    try {
      const value = await this.executor.tessellate(source, options);
      return { status: "COMPLETED", value, errors: [], limitations: [] };
    } catch (error) {
      return {
        status: "FAILED",
        errors: [error instanceof Error ? error.message : "OCCT geometry tessellation failed."],
        limitations: []
      };
    }
  }
}
