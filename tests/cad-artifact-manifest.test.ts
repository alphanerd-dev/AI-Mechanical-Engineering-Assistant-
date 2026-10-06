import {describe,it,expect} from "vitest";
import {normalizeCADExecutionResult} from "../src/cad/artifact-manifest.js";

describe("CAD artifact manifest",()=>{
  it("normalizes only artifacts actually returned by the worker",()=>{
    const result=normalizeCADExecutionResult("project-1",{
      success:true,
      backend:"build123d",
      sourceArtifactPath:"/artifacts/part.py",
      solidArtifactPath:"/artifacts/part.brep",
      stepArtifactPath:"/artifacts/part.step",
      warnings:["runtime warning"]
    });
    expect(result.artifacts.map(a=>a.kind)).toEqual(["SOURCE","SOLID","STEP"]);
    expect(result.warnings).toEqual(["runtime warning"]);
    expect(result.artifacts.every(a=>a.validationStatus==="UNVALIDATED")).toBe(true);
  });
});
