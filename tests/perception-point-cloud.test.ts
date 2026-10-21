import { describe, expect, it } from "vitest";
import { validatePointCloudMeasurements, validatePointCloudSource, validateRegistrationCandidate } from "../src/perception/point-cloud.js";
import type { PointCloudMeasurements, PointCloudSource, RegistrationCandidate } from "../src/perception/point-cloud.js";

const projectId = "1d4b6b6a-63cb-44b2-8b19-6b3ae60e19b2";
const sourceId = "2d4b6b6a-63cb-44b2-8b19-6b3ae60e19b2";
const referenceId = "3d4b6b6a-63cb-44b2-8b19-6b3ae60e19b2";
const sourceHash = "a".repeat(64);
const referenceHash = "b".repeat(64);
const source: PointCloudSource = {
  projectId, artifactId: sourceId,
  artifactUri: "storage://engineering-point-clouds/" + projectId + "/" + sourceId + "/scan.ply",
  sha256: sourceHash, format: "PLY", units: "mm", coordinateFrame: "scan-frame-01",
};
const measurements: PointCloudMeasurements = {
  pointCount: 64,
  boundsMm: { min: {x:0,y:0,z:0}, max: {x:30,y:30,z:30}, extent: {x:30,y:30,z:30} },
  centroidMm: {x:15,y:15,z:15}, sourceSha256: sourceHash, units: "mm", coordinateFrame: "scan-frame-01",
};
const candidate: RegistrationCandidate = {
  decisionStatus: "CANDIDATE", sourceProjectId: projectId, referenceProjectId: projectId,
  sourceArtifactId: sourceId, referenceArtifactId: referenceId, sourceSha256: sourceHash, referenceSha256: referenceHash,
  transformSourceToReference: { matrix: [[1,0,0,12],[0,1,0,-3],[0,0,1,5],[0,0,0,1]] },
  fitness: 0.92, inlierRmseMm: 0.18, correspondenceCount: 120,
  algorithm: "OPEN3D_ICP_POINT_TO_POINT", workerVersion: "0.20.0",
};
const criteria = { minFitness: 0.85, maxInlierRmseMm: 0.25, minCorrespondences: 100 };

describe("point-cloud source contract", () => {
  it("accepts explicitly scoped durable sources with a host digest", () => expect(validatePointCloudSource(source, projectId)).toEqual({valid:true,errors:[]}));
  it("rejects cross-project, local-path and missing provenance", () => {
    expect(validatePointCloudSource({...source,projectId:referenceId},projectId).valid).toBe(false);
    expect(validatePointCloudSource({...source,artifactUri:"/tmp/scan.ply"},projectId).valid).toBe(false);
    expect(validatePointCloudSource({...source,sha256:"not-a-digest"},projectId).valid).toBe(false);
  });
});
describe("point-cloud measurement contract", () => {
  it("accepts finite metric bounds that agree with extents", () => expect(validatePointCloudMeasurements(measurements)).toEqual({valid:true,errors:[]}));
  it("rejects NaN, too few points and inconsistent extents", () => {
    expect(validatePointCloudMeasurements({...measurements,pointCount:2}).valid).toBe(false);
    expect(validatePointCloudMeasurements({...measurements,centroidMm:{x:Number.NaN,y:0,z:0}}).valid).toBe(false);
    expect(validatePointCloudMeasurements({...measurements,boundsMm:{...measurements.boundsMm,extent:{x:31,y:30,z:30}}}).valid).toBe(false);
  });
});
describe("registration candidate acceptance gate", () => {
  const expected = {projectId,sourceSha256:sourceHash,referenceSha256:referenceHash};
  it("passes explicit numerical criteria without implying design approval", () => {
    const result=validateRegistrationCandidate(candidate,criteria,expected);
    expect(result.status).toBe("PASS");
    expect(result.engineeringDesignApproved).toBe(false);
  });
  it("fails weak alignment and returns incomplete for provenance mismatches", () => {
    expect(validateRegistrationCandidate({...candidate,fitness:0.3},criteria,expected).status).toBe("FAIL");
    expect(validateRegistrationCandidate({...candidate,sourceSha256:referenceHash},criteria,expected).status).toBe("INCOMPLETE");
  });
  it("rejects non-rigid transforms and cross-project registration", () => {
    const nonRigid: RegistrationCandidate = {...candidate,transformSourceToReference:{matrix:[[2,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]}};
    expect(validateRegistrationCandidate(nonRigid,criteria,expected).status).toBe("INCOMPLETE");
    expect(validateRegistrationCandidate({...candidate,referenceProjectId:referenceId},criteria,expected).status).toBe("INCOMPLETE");
  });
});
