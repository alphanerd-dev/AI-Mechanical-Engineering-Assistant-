import type { PointCloudFormat } from "./point-cloud.js";

export const POINT_CLOUD_ARTIFACT_BUCKET = "engineering-point-clouds";
export const POINT_CLOUD_UPLOAD_MAX_BYTES = 40 * 1024 * 1024;
export const POINT_CLOUD_UPLOAD_MAX_POINTS = 2_000_000;
export const POINT_CLOUD_UPLOAD_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export type PointCloudUploadFormat = PointCloudFormat;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<PointCloudUploadFormat, string> = {
  PLY: "ply",
  PCD: "pcd",
  XYZ: "xyz",
};

export function pointCloudStoragePath(
  projectId: string,
  artifactId: string,
  format: PointCloudUploadFormat,
): string {
  if (!UUID.test(projectId) || !UUID.test(artifactId)) {
    throw new Error("Point-cloud storage identity must use canonical UUIDs.");
  }
  if (!Object.hasOwn(EXTENSIONS, format)) {
    throw new Error("Point-cloud storage format is unsupported.");
  }
  return projectId + "/" + artifactId + "/source." + EXTENSIONS[format];
}

export function pointCloudStorageUri(storagePath: string): string {
  const segments = typeof storagePath === "string" ? storagePath.split("/") : [];
  const format = segments.length === 3 ? segments[2].match(/^source\.(ply|pcd|xyz)$/i)?.[1] : undefined;
  if (segments.length !== 3 ||
      !UUID.test(segments[0] ?? "") ||
      !UUID.test(segments[1] ?? "") ||
      !format ||
      segments[2] !== "source." + format.toLowerCase()) {
    throw new Error("Point-cloud storage object path is invalid.");
  }
  return "storage://" + POINT_CLOUD_ARTIFACT_BUCKET + "/" + storagePath;
}
