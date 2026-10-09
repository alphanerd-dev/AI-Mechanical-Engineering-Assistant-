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
