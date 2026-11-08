import {describe,it,expect} from "vitest";
import {normalizeCADExecutionResult} from "../src/cad/artifact-manifest.js";

describe("CAD artifact manifest",()=>{
  it("normalizes worker-reported artifacts as unvalidated and warns when provenance is missing",()=>{
    const result=normalizeCADExecutionResult("project-1",{
      success:true,
      backend:"build123d",
      sourceArtifactPath:"/artifacts/part.py",
      solidArtifactPath:"/artifacts/part.brep",
      stepArtifactPath:"/artifacts/part.step",
      warnings:["runtime warning"]
    });
    expect(result.artifacts.map(a=>a.kind)).toEqual(["SOURCE","SOLID","STEP"]);
    expect(result.warnings).toContain("runtime warning");
    expect(result.warnings).toContain("No model/source provenance context was supplied; generated artifacts remain unverified.");
    expect(result.errors).toEqual([]);
    expect(result.artifacts.every(a=>a.validationStatus==="UNVALIDATED"&&!a.provenance)).toBe(true);
  });

  it("records the actual common-source export lineage without claiming the parallel exports were converted from BREP",()=>{
    const result=normalizeCADExecutionResult("project-1",{
      success:true,
      backend:"build123d",
      sourceArtifactPath:"/artifacts/part.py",
      solidArtifactPath:"/artifacts/part.brep",
      stepArtifactPath:"/artifacts/part.step",
      stlArtifactPath:"/artifacts/part.stl",
      threeMfArtifactPath:"/artifacts/part.3mf",
      warnings:[]
    },{
      modelIdentity:{
        id:"cad-model-1",
        projectId:"project-1",
        name:"Test shaft",
        nativeReferences:[],
        revision:3,
        createdAt:"2026-11-07T10:00:00.000Z",
        updatedAt:"2026-11-07T10:00:00.000Z"
      },
      request:{
        id:"execution-1",
        backend:"build123d",
        source:"from build123d import Cylinder",
        filename:"part.py",
        timeoutMs:30000
      },
      providerId:"cad.build123d",
      generatedAt:"2026-11-07T10:01:00.000Z"
    });

    expect(result.errors).toEqual([]);
    const source=result.artifacts.find((artifact)=>artifact.kind==="SOURCE")!;
    const solid=result.artifacts.find((artifact)=>artifact.kind==="SOLID")!;
    const step=result.artifacts.find((artifact)=>artifact.kind==="STEP")!;
    const stl=result.artifacts.find((artifact)=>artifact.kind==="STL")!;
    const threeMf=result.artifacts.find((artifact)=>artifact.kind==="THREE_MF")!;

    expect(solid.provenance?.sourceArtifactIds).toEqual([source.id]);
    expect(result.provenance?.modelRevision).toBe(3);
    expect(solid.provenance?.modelRevision).toBe(3);
    for (const derivative of [step,stl,threeMf]) {
      expect(derivative.provenance?.sourceArtifactIds).toEqual([source.id]);
      expect(derivative.provenance?.canonicalGeometryArtifactId).toBe(solid.id);
      expect(derivative.validationStatus).toBe("UNVALIDATED");
      expect(derivative.informationStatus).toBe("CALCULATED");
      expect(derivative.evidenceIds).toEqual([]);
    }
  });

  it("does not register artifact paths from a failed worker execution",()=>{
    const result=normalizeCADExecutionResult("project-1",{
      success:false,
      backend:"build123d",
      solidArtifactPath:"/artifacts/forged.brep",
      error:"runtime failed after partial output",
      warnings:[]
    });
    expect(result.artifacts).toEqual([]);
    expect(result.errors.join(" ")).toContain("did not succeed");
  });
});
