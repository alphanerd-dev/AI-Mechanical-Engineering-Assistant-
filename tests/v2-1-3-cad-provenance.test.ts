import {describe,it,expect} from "vitest";
import {normalizeCADExecutionResult} from "../src/cad/artifact-manifest.js";
import {createCADArtifactBundleFromManifest,createCADArtifactBundle,CADValidationReceipt} from "../src/cad/artifact-bridge.js";
import {createCADSourceSha256,validateCADArtifactProvenance} from "../src/cad/provenance.js";
import {CADModelIdentity} from "../src/cad/identity.js";
import {CADExecutionRequest,CADExecutionResult} from "../src/cad/execution.js";
import {GeometryValidation} from "../src/cad/artifacts.js";

const model:CADModelIdentity={
  id:"model-1",projectId:"project-1",name:"Bracket",nativeReferences:[],
  createdAt:"2026-10-09T10:00:00.000Z",updatedAt:"2026-10-09T10:00:00.000Z"
};
const request:CADExecutionRequest={
  id:"exec-1",backend:"build123d",source:"from build123d import *\n# bracket source\n",
  filename:"bracket.py",parameters:{widthMm:50},timeoutMs:30000
};
const execution:CADExecutionResult={
  success:true,backend:"build123d",sourceArtifactPath:"/artifacts/bracket.py",
  solidArtifactPath:"/artifacts/bracket.brep",stepArtifactPath:"/artifacts/bracket.step",warnings:[]
};
const validation:GeometryValidation={valid:true,solidCount:1,warnings:[],checkedBy:"occt"};
const context={modelIdentity:model,request,providerId:"cad.build123d",generatedAt:"2026-10-09T10:05:00.000Z",requirementIds:["REQ-BRACKET"]};

function manifestFor(overrides:Partial<CADExecutionResult>={}) {
  return normalizeCADExecutionResult("project-1",{...execution,...overrides},context);
}
function receiptFor(manifest=manifestFor(),overrides:Record<string,unknown>={}):CADValidationReceipt {
  const solid=manifest.artifacts.find(a=>a.kind==="SOLID")!;
  const artifactSha256="b".repeat(64);
  solid.provenance!.artifactSha256=artifactSha256;
  return {
    id:"validation-1",projectId:"project-1",artifactId:solid.id,modelIdentityId:model.id,
    sourceSha256:solid.provenance!.sourceSha256,backend:solid.backend,
    validatorProviderId:"cad.occt",validatorVersion:"occt-test-1",artifactSha256,
    checkedBy:"occt",checkedAt:"2026-10-09T10:06:00.000Z",validation,
    ...overrides
  } as CADValidationReceipt;
}

describe("V2.1.3 CAD artifact provenance and validation integration",()=>{
  it("binds outputs to canonical model, execution, provider and exact source digest",()=>{
    const manifest=manifestFor();
    const solid=manifest.artifacts.find(a=>a.kind==="SOLID")!;
    expect(manifest.errors).toEqual([]);
    expect(manifest.provenance).toMatchObject({
      projectId:"project-1",modelIdentityId:"model-1",executionId:"exec-1",
      providerId:"cad.build123d",backend:"build123d",
      sourceSha256:createCADSourceSha256(request.source),sourceFilename:"bracket.py"
    });
    expect(solid.provenance).toMatchObject({
      modelIdentityId:"model-1",sourceSha256:createCADSourceSha256(request.source),
      outputUri:"/artifacts/bracket.brep"
    });
    expect(solid.validationStatus).toBe("UNVALIDATED");
  });

  it("uses stable artifact ids for the same project, execution, source and provider",()=>{
    expect(manifestFor().artifacts.map(a=>a.id)).toEqual(manifestFor().artifacts.map(a=>a.id));
  });

  it("rejects mismatched model project and backend instead of emitting artifacts",()=>{
    const wrongProject=normalizeCADExecutionResult("project-2",execution,{...context,modelIdentity:model});
    const wrongBackend=normalizeCADExecutionResult("project-1",execution,{...context,request:{...request,backend:"cadquery"}});
    expect(wrongProject.artifacts).toEqual([]);
    expect(wrongProject.errors.join(" ")).toContain("different project");
    expect(wrongBackend.artifacts).toEqual([]);
    expect(wrongBackend.errors.join(" ")).toContain("backend");
  });

  it("creates VERIFIED evidence only when the receipt matches the exact solid and source",()=>{
    const manifest=manifestFor();
    const result=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest),["REQ-BRACKET"]);
    expect(result.status).toBe("ACCEPTED");
    expect(result.bundle?.cad.validationStatus).toBe("PASS");
    expect(result.bundle?.cad.informationStatus).toBe("VERIFIED");
    expect(result.bundle?.engineering.provenance?.sourceSha256).toBe(createCADSourceSha256(request.source));
    expect(result.bundle?.evidence.status).toBe("VERIFIED");
    expect(result.bundle?.evidence.requirementIds).toEqual(["REQ-BRACKET"]);
  });

  it("fails closed for a receipt attached to a different artifact or project",()=>{
    const manifest=manifestFor();
    const wrongArtifact=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{artifactId:"other-solid"}));
    const wrongProject=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{projectId:"other-project"}));
    expect(wrongArtifact.status).toBe("INCOMPLETE");
    expect(wrongArtifact.bundle).toBeUndefined();
    expect(wrongArtifact.errors.join(" ")).toContain("exact solid artifact");
    expect(wrongProject.status).toBe("INCOMPLETE");
    expect(wrongProject.bundle).toBeUndefined();
  });

  it("fails closed if validator identity aliases the execution provider or output digest is mismatched",()=>{
    const manifest=manifestFor();
    const sameProvider=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{validatorProviderId:"cad.build123d"}));
    expect(sameProvider.status).toBe("INCOMPLETE");
    expect(sameProvider.errors.join(" ")).toContain("distinct providers");
    const badArtifactDigest=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{artifactSha256:"c".repeat(64)}));
    expect(badArtifactDigest.status).toBe("INCOMPLETE");
    expect(badArtifactDigest.errors.join(" ")).toContain("artifact digest");
  });

  it("fails closed if the validator reports a different source digest or backend",()=>{
    const manifest=manifestFor();
    const wrongDigest=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{sourceSha256:"a".repeat(64)}));
    const wrongBackend=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{backend:"cadquery"}));
    expect(wrongDigest.status).toBe("INCOMPLETE");
    expect(wrongDigest.errors.join(" ")).toContain("source digest");
    expect(wrongBackend.status).toBe("INCOMPLETE");
    expect(wrongBackend.errors.join(" ")).toContain("backend");
  });

  it("records failed geometry as REJECTED and never marks its evidence VERIFIED",()=>{
    const manifest=manifestFor();
    const failedValidation:GeometryValidation={valid:false,solidCount:1,warnings:["self intersection"],checkedBy:"occt"};
    const result=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{validation:failedValidation}));
    expect(result.status).toBe("REJECTED");
    expect(result.bundle?.cad.validationStatus).toBe("FAIL");
    expect(result.bundle?.cad.informationStatus).toBe("CALCULATED");
    expect(result.bundle?.evidence.status).toBe("CALCULATED");
  });

  it("treats missing solid count or validator identity as incomplete",()=>{
    const manifest=manifestFor();
    const noSolidCount={valid:true,warnings:[],checkedBy:"occt"} as GeometryValidation;
    const noChecker:GeometryValidation={valid:true,solidCount:1,warnings:[],checkedBy:" "};
    const resultA=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{validation:noSolidCount}));
    const resultB=createCADArtifactBundleFromManifest(manifest,receiptFor(manifest,{validation:noChecker,checkedBy:" "}));
    expect(resultA.status).toBe("INCOMPLETE");
    expect(resultB.status).toBe("INCOMPLETE");
  });

  it("validates provenance digests and expected URI/project values",()=>{
    const manifest=manifestFor();
    const solid=manifest.artifacts.find(a=>a.kind==="SOLID")!;
    expect(validateCADArtifactProvenance(solid.provenance,{projectId:"project-1",outputUri:solid.uri}).status).toBe("PASS");
    expect(validateCADArtifactProvenance(solid.provenance,{projectId:"project-2"}).status).toBe("FAIL");
  });

  it("refuses to create artifact records from unsuccessful worker execution",()=>{
    const failed=normalizeCADExecutionResult("project-1",{...execution,success:false,error:"worker failed"},context);
    expect(failed.artifacts).toEqual([]);
    expect(failed.errors.join(" ")).toContain("did not succeed");
  });

  it("keeps the legacy bridge explicitly unverified without provenance",()=>{
    const bundle=createCADArtifactBundle("project-1",execution,validation,["REQ-BRACKET"]);
    expect(bundle.acceptance.status).toBe("INCOMPLETE");
    expect(bundle.cad.validationStatus).toBe("UNVALIDATED");
    expect(bundle.evidence.status).toBe("CALCULATED");
  });
});
