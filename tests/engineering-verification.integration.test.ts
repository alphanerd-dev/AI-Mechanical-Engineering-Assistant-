import {describe,expect,it} from "vitest";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";
import {createCADArtifactBundle} from "../src/cad/artifact-bridge.js";
import {bridgeSimulationEvidence} from "../src/simulation/evidence-bridge.js";
import {evaluateEngineeringAcceptance} from "../src/simulation/engineering-acceptance.js";
import {verifyRequirementWithEvidence} from "../src/requirements/verification.js";
import {RequirementTraceability} from "../src/requirements/traceability.js";
import {verifyEngineeringProject} from "../src/verification/project.js";

describe("engineering verification integration",()=>{
  it("traces a requirement from CAD and FEA evidence into project verification",()=>{
    const project=createProject("Bracket verification");
    project.requirements.push({id:"REQ-STRENGTH",name:"Strength",priority:"MUST",status:"OPEN"});
    const traceability=new RequirementTraceability();
    traceability.addRequirement({id:"REQ-STRENGTH",name:"Strength",statement:"Bracket shall satisfy the strength requirement.",kind:"ENGINEERING",priority:"MUST",status:"OPEN"});
    const memory=new EngineeringMemory(); memory.save(project);

    const cad=createCADArtifactBundle(project.id,{success:true,backend:"build123d",solidArtifactPath:"/artifacts/bracket.step",warnings:[]}, {valid:true,solidCount:1,warnings:[],checkedBy:"occt"},["REQ-STRENGTH"]);
    memory.saveArtifact(cad.engineering);
    expect(cad.evidence.status).toBe("VERIFIED");

    const validation={pass:true,checks:[
      {name:"solver_converged",pass:true,message:"Solver converged."},
      {name:"stress_finite",pass:true,message:"Stress is finite."},
      {name:"stress_below_yield",pass:true,message:"Stress is below yield."},
      {name:"displacement_finite",pass:true,message:"Displacement is finite."}
    ]};
    const result={converged:true,maxStressMpa:100,maxDisplacementMm:1,warnings:[]};
    const acceptance=evaluateEngineeringAcceptance({result,validation,yieldStrengthMpa:300,minimumFactorOfSafety:2});
    const fea=bridgeSimulationEvidence({project,memory,model:{artifactId:cad.cad.id,material:{name:"Steel",yieldStrengthMpa:300},loads:[],constraints:[],mesh:{elementSizeMm:5}},result,validation,acceptance,solver:"calculix",solverVersion:"test",requirementIds:["REQ-STRENGTH"]});
    expect(fea.evidence?.status).toBe("VERIFIED");

    const verified=verifyRequirementWithEvidence(project,memory,traceability,"REQ-STRENGTH",fea.evidence!);
    expect(verified.verified).toBe(true);
    expect(project.requirements[0].status).toBe("SATISFIED");

    const report=verifyEngineeringProject({project,evidence:[fea.evidence!,cad.evidence],artifacts:[cad.engineering,fea.resultArtifact],requirementEvidence:memory.requirementEvidenceMap(project.id)});
    expect(report.status).toBe("PASS");
    expect(report.requirements[0].status).toBe("PASS");
  });
});
