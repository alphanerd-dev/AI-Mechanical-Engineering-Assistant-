import {describe,expect,it} from "vitest";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {createProject} from "../src/state/project.js";
import {bridgeSimulationEvidence} from "../src/simulation/evidence-bridge.js";
import {evaluateEngineeringAcceptance} from "../src/simulation/engineering-acceptance.js";

const validation={pass:true,checks:[
  {name:"solver_converged",pass:true},{name:"stress_finite",pass:true},
  {name:"stress_below_yield",pass:true},{name:"displacement_finite",pass:true}
]};

describe("simulation evidence bridge",()=>{
  it("stores accepted simulation evidence and updates project traceability",()=>{
    const project=createProject("Bracket validation");
    const memory=new EngineeringMemory(); memory.save(project);
    const result={converged:true,maxStressMpa:100,maxDisplacementMm:1};
    const acceptance=evaluateEngineeringAcceptance({
      result,validation,yieldStrengthMpa:300,minimumFactorOfSafety:2,
      coarseResult:{converged:true,maxStressMpa:105,maxDisplacementMm:1.1},
      maximumRelativeStressChange:0.1
    });
    const bridged=bridgeSimulationEvidence({
      project,memory,model:{
        artifactId:"cad:bracket",material:{name:"Steel",yieldStrengthMpa:300},
        loads:[],constraints:[],mesh:{elementSizeMm:5}
      },result,validation,acceptance,solver:"ansys-pymechanical-worker",
      solverVersion:"PILOT",requirementIds:[]
    });
    expect(bridged.evidence?.status).toBe("VERIFIED");
    expect(memory.getEvidence(bridged.evidence!.id)?.status).toBe("VERIFIED");
    expect(memory.getArtifact(bridged.resultArtifact.id)?.kind).toBe("FEA_RESULT");
    expect(memory.get(project.id)?.nextAction).toContain("physical test");
    expect(project.events.at(-1)?.action).toBe("SIMULATION_ACCEPTED");
  });
});
