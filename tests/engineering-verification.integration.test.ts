import {describe,expect,it} from "vitest";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";
import {normalizeCADExecutionResult} from "../src/cad/artifact-manifest.js";
import {createCADArtifactBundleFromManifest} from "../src/cad/artifact-bridge.js";
import {CADModelIdentity} from "../src/cad/identity.js";
import {CADExecutionRequest,CADExecutionResult} from "../src/cad/execution.js";
import {bridgeSimulationEvidence} from "../src/simulation/evidence-bridge.js";
import {evaluateEngineeringAcceptance} from "../src/simulation/engineering-acceptance.js";
import {verifyRequirementWithEvidence} from "../src/requirements/verification.js";
import {RequirementTraceability} from "../src/requirements/traceability.js";
import {verifyEngineeringProject} from "../src/verification/project.js";

describe("engineering verification integration",()=>{
  it("traces provenance-bound CAD and FEA evidence into project verification",()=>{
    const project=createProject("Bracket verification");
    project.requirements.push({id:"REQ-STRENGTH",name:"Strength",priority:"MUST",status:"OPEN"});
    const traceability=new RequirementTraceability();
    traceability.addRequirement({id:"REQ-STRENGTH",name:"Strength",statement:"Bracket shall satisfy the strength requirement.",kind:"ENGINEERING",priority:"MUST",status:"OPEN"});
    const memory=new EngineeringMemory(); memory.save(project);

    const now="2026-10-09T10:00:00.000Z";
    const model:CADModelIdentity={
      id:"cad-model-bracket",projectId:project.id,name:"Bracket",nativeReferences:[],
      createdAt:now,updatedAt:now
    };
    const request:CADExecutionRequest={
      id:"cad-execution-bracket",backend:"build123d",source:"from build123d import *\n# bracket design source\n",
      filename:"bracket.py",parameters:{material:"steel"},timeoutMs:30000
    };
    const execution:CADExecutionResult={
      success:true,backend:"build123d",sourceArtifactPath:"/artifacts/bracket.py",
      solidArtifactPath:"/artifacts/bracket.brep",stepArtifactPath:"/artifacts/bracket.step",warnings:[]
    };
    const manifest=normalizeCADExecutionResult(project.id,execution,{
      modelIdentity:model,request,providerId:"cad.build123d",generatedAt:now,requirementIds:["REQ-STRENGTH"]
    });
    const solid=manifest.artifacts.find(item=>item.kind==="SOLID")!;
    const validation={valid:true,solidCount:1,warnings:[],checkedBy:"occt"};
    const bundleResult=createCADArtifactBundleFromManifest(manifest,{
      id:"validation-bracket",projectId:project.id,artifactId:solid.id,modelIdentityId:model.id,
      sourceSha256:solid.provenance!.sourceSha256,backend:solid.backend,checkedBy:"occt",
      checkedAt:"2026-10-09T10:01:00.000Z",validation
    },["REQ-STRENGTH"]);
    expect(bundleResult.status).toBe("ACCEPTED");
    const cad=bundleResult.bundle!;
    memory.saveArtifact(cad.engineering);
    expect(cad.evidence.status).toBe("VERIFIED");

    const validationFEA={pass:true,checks:[
      {name:"solver_converged",pass:true,message:"Solver converged."},
      {name:"stress_finite",pass:true,message:"Stress is finite."},
      {name:"stress_below_yield",pass:true,message:"Stress is below yield."},
      {name:"displacement_finite",pass:true,message:"Displacement is finite."}
    ]};
    const result={converged:true,maxStressMpa:100,maxDisplacementMm:1,warnings:[]};
    const acceptance=evaluateEngineeringAcceptance({result,validation:validationFEA,yieldStrengthMpa:300,minimumFactorOfSafety:2});
    const fea=bridgeSimulationEvidence({project,memory,model:{artifactId:cad.cad.id,material:{name:"Steel",yieldStrengthMpa:300},loads:[],constraints:[],mesh:{elementSizeMm:5}},result,validation:validationFEA,acceptance,solver:"calculix",solverVersion:"test",requirementIds:["REQ-STRENGTH"]});
    expect(fea.evidence?.status).toBe("VERIFIED");

    const verified=verifyRequirementWithEvidence(project,memory,traceability,"REQ-STRENGTH",fea.evidence!);
    expect(verified.verified).toBe(true);
    expect(project.requirements[0].status).toBe("SATISFIED");

    const report=verifyEngineeringProject({project,evidence:[fea.evidence!,cad.evidence],artifacts:[cad.cad,cad.engineering,fea.resultArtifact],requirementEvidence:memory.requirementEvidenceMap(project.id)});
    expect(report.status).toBe("PASS");
    expect(report.requirements[0].status).toBe("PASS");
  });
});
