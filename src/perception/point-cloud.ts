export type PointCloudFormat = "PLY" | "PCD" | "XYZ";
export type PointCloudUnit = "mm" | "cm" | "m" | "in";
export type RegistrationGateStatus = "PASS" | "FAIL" | "INCOMPLETE";

export interface PointCloudSource {
  projectId: string;
  artifactId: string;
  artifactUri: string;
  sha256: string;
  format: PointCloudFormat;
  units: PointCloudUnit;
  coordinateFrame: string;
}

export interface Point3 { x: number; y: number; z: number }

export interface PointCloudMeasurements {
  pointCount: number;
  boundsMm: { min: Point3; max: Point3; extent: Point3 };
  centroidMm: Point3;
  sourceSha256: string;
  units: PointCloudUnit;
  coordinateFrame: string;
}

export interface RigidTransform4x4 {
  matrix: [
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number]
  ];
}

export interface RegistrationCandidate {
  decisionStatus: "CANDIDATE";
  sourceProjectId: string;
  referenceProjectId: string;
  sourceArtifactId: string;
  referenceArtifactId: string;
  sourceSha256: string;
  referenceSha256: string;
  transformSourceToReference: RigidTransform4x4;
  fitness: number;
  inlierRmseMm: number;
  correspondenceCount: number;
  algorithm: "OPEN3D_ICP_POINT_TO_POINT";
  workerVersion: string;
}

export interface RegistrationAcceptanceCriteria {
  minFitness: number;
  maxInlierRmseMm: number;
  minCorrespondences: number;
}

export interface RegistrationGateResult {
  status: RegistrationGateStatus;
  errors: string[];
  metrics: { fitness?: number; inlierRmseMm?: number; correspondenceCount?: number };
  engineeringDesignApproved: false;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export function validatePointCloudSource(source: PointCloudSource, expectedProjectId: string) {
  const errors: string[] = [];
  if (!UUID.test(source.projectId) || source.projectId !== expectedProjectId) errors.push("Point-cloud source must belong to the authorized project.");
  if (!UUID.test(source.artifactId)) errors.push("Point-cloud source requires a canonical artifact UUID.");
  if (!source.artifactUri.startsWith("storage://") || source.artifactUri.length > 2048) errors.push("Point-cloud source must reference a durable storage URI, not a local path or signed URL.");
  if (!SHA256.test(source.sha256)) errors.push("Point-cloud source requires a host-authored SHA-256 digest.");
  if (!(["PLY", "PCD", "XYZ"] as const).includes(source.format)) errors.push("Point-cloud format is unsupported.");
  if (!(["mm", "cm", "m", "in"] as const).includes(source.units)) errors.push("Point-cloud units must be explicit.");
  if (!source.coordinateFrame.trim() || source.coordinateFrame.length > 128) errors.push("Point-cloud coordinate frame must contain 1–128 characters.");
  return { valid: errors.length === 0, errors };
}

function finitePoint(point: Point3) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function properRigidTransform(value: RigidTransform4x4) {
  const m = value.matrix as number[][];
  if (m.length !== 4 || m.some((row) => row.length !== 4 || row.some((v) => !Number.isFinite(v)))) return false;
  const eps = 1e-4;
  if (Math.abs(m[3][0]) > eps || Math.abs(m[3][1]) > eps || Math.abs(m[3][2]) > eps || Math.abs(m[3][3] - 1) > eps) return false;
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      let dot = 0;
      for (let row = 0; row < 3; row++) dot += m[row][a] * m[row][b];
      if (Math.abs(dot - (a === b ? 1 : 0)) > 5e-3) return false;
    }
  }
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  return Math.abs(det - 1) <= 5e-3;
}

export function validateRegistrationCandidate(candidate: RegistrationCandidate, criteria: RegistrationAcceptanceCriteria, expected: {
  projectId: string; sourceSha256: string; referenceSha256: string;
}): RegistrationGateResult {
  const errors: string[] = [];
  const metrics = { fitness: candidate.fitness, inlierRmseMm: candidate.inlierRmseMm, correspondenceCount: candidate.correspondenceCount };
  if (candidate.decisionStatus !== "CANDIDATE") errors.push("Registration output must remain a candidate, not a verified engineering result.");
  if (!UUID.test(candidate.sourceProjectId) || candidate.sourceProjectId !== expected.projectId || candidate.referenceProjectId !== expected.projectId) errors.push("Source and reference must belong to the same authorized project.");
  if (!UUID.test(candidate.sourceArtifactId) || !UUID.test(candidate.referenceArtifactId) || candidate.sourceArtifactId === candidate.referenceArtifactId) errors.push("Registration requires distinct canonical source and reference artifact identities.");
  if (!SHA256.test(candidate.sourceSha256) || candidate.sourceSha256 !== expected.sourceSha256 || !SHA256.test(candidate.referenceSha256) || candidate.referenceSha256 !== expected.referenceSha256) errors.push("Registration provenance does not match the trusted source and reference digests.");
  if (candidate.algorithm !== "OPEN3D_ICP_POINT_TO_POINT" || !candidate.workerVersion.trim()) errors.push("Registration algorithm and worker version must be recorded.");
  if (!properRigidTransform(candidate.transformSourceToReference)) errors.push("Registration transform must be a finite proper rigid 4×4 transformation.");
  if (!Number.isFinite(criteria.minFitness) || criteria.minFitness < 0 || criteria.minFitness > 1 || !Number.isFinite(criteria.maxInlierRmseMm) || criteria.maxInlierRmseMm <= 0 || !Number.isSafeInteger(criteria.minCorrespondences) || criteria.minCorrespondences < 3) errors.push("Explicit registration acceptance criteria are invalid.");
  if (!Number.isFinite(candidate.fitness) || candidate.fitness < 0 || candidate.fitness > 1 || !Number.isFinite(candidate.inlierRmseMm) || candidate.inlierRmseMm < 0 || !Number.isSafeInteger(candidate.correspondenceCount) || candidate.correspondenceCount < 0) errors.push("Registration metrics are missing or invalid.");
  if (errors.length) return { status: "INCOMPLETE", errors, metrics, engineeringDesignApproved: false };
  if (candidate.fitness < criteria.minFitness || candidate.inlierRmseMm > criteria.maxInlierRmseMm || candidate.correspondenceCount < criteria.minCorrespondences) {
    return { status: "FAIL", errors: ["Registration metrics do not satisfy all explicit acceptance criteria."], metrics, engineeringDesignApproved: false };
  }
  return { status: "PASS", errors: [], metrics, engineeringDesignApproved: false };
}

export function validatePointCloudMeasurements(measurements: PointCloudMeasurements) {
  const errors: string[] = [];
  if (!Number.isSafeInteger(measurements.pointCount) || measurements.pointCount < 3) errors.push("At least three measured points are required.");
  if (!SHA256.test(measurements.sourceSha256)) errors.push("Measured point cloud has no valid source digest.");
  if (!(["mm", "cm", "m", "in"] as const).includes(measurements.units)) errors.push("Measured source units are missing.");
  if (!measurements.coordinateFrame.trim() || measurements.coordinateFrame.length > 128) errors.push("Measured point cloud has no valid coordinate frame.");
  const points = [measurements.boundsMm.min, measurements.boundsMm.max, measurements.boundsMm.extent, measurements.centroidMm];
  if (points.some((p) => !finitePoint(p))) errors.push("Point-cloud measurements must be finite.");
  const { min, max, extent } = measurements.boundsMm;
  for (const axis of ["x", "y", "z"] as const) {
    if (max[axis] < min[axis] || extent[axis] < 0 || Math.abs((max[axis] - min[axis]) - extent[axis]) > Math.max(1e-6, Math.abs(extent[axis]) * 1e-6)) {
      errors.push("Point-cloud bounds and extents are inconsistent.");
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}
