import {describe,expect,it} from "vitest";
import {createProject} from "../src/state/project.js";
import {EngineeringMemory} from "../src/memory/memory-store.js";
import {validateManufacturingProcessPlan,evaluateManufacturingInspection} from "../src/manufacturing/validation.js";
import {bridgeManufacturingEvidence} from "../src/manufacturing/evidence-bridge.js";
import {ManufacturingProvider} from "../src/providers/manufacturing.js";

function plan(){
  return {
    id:"PLAN-1",
    projectId:"project-1",
    name:"Bracket manufacturing plan",
    partArtifactIds:["cad-1"],
    requirementIds:["REQ-1"],
    status:"READY" as const,
    assumptions:[],
    operations:[
      {id:"OP-10",sequence:1,name:"Rough machine",process:"MACHINING" as const,acceptanceCriteria:["Stock allowance verified"]},
      {id:"OP-20",sequence:2,name:"Finish machine",process:"MACHINING" as const,acceptanceCriteria:["Critical dimension inspected"],predecessorIds:["OP-10"]}
    ]
  };
}

describe("manufacturing planning",()=>{
  it("accepts a structurally valid process plan",()=>{
    const result=validateManufacturingProcessPlan(plan());
    expect(result.status).toBe("PASS");
    expect(result.valid).toBe(true);
  });

  it("fails a process plan with sequence and predecessor defects",()=>{
    const value=plan();
    value.operations[1].sequence=3;
    value.operations[1].predecessorIds=["MISSING"];
    const result=validateManufacturingProcessPlan(value);
    expect(result.status).toBe("FAIL");
    expect(result.errors).toContain("Manufacturing operation sequence is missing step 2.");
    expect(result.errors).toContain("Operation OP-20 references missing predecessor MISSING.");
  });
});

describe("manufacturing inspection",()=>{
  const criterion={
    id:"DIM-1",name:"Bore diameter",characteristic:"bore diameter",unit:"mm",
    nominal:50,tolerance:0.10,method:"caliper"
  };

  it("accepts an in-tolerance measurement",()=>{
    const result=evaluateManufacturingInspection(criterion,{id:"INS-1",criterionId:"DIM-1",measuredValue:50.05,unit:"mm"});
    expect(result.status).toBe("ACCEPTED");
    expect(result.lowerLimit).toBe(49.9);
    expect(result.upperLimit).toBe(50.1);
  });

  it("rejects an out-of-tolerance measurement",()=>{
    const result=evaluateManufacturingInspection(criterion,{id:"INS-2",criterionId:"DIM-1",measuredValue:50.25,unit:"mm"});
    expect(result.status).toBe("REJECTED");
  });

  it("does not silently convert units",()=>{
    const result=evaluateManufacturingInspection(criterion,{id:"INS-3",criterionId:"DIM-1",measuredValue:1.9685,unit:"in"});
    expect(result.status).toBe("INCOMPLETE");
    expect(result.reason).toContain("exactly match");
  });

  it("rejects conflicting limit definitions",()=>{
    const result=evaluateManufacturingInspection(
      {id:"DIM-2",name:"Thickness",characteristic:"thickness",unit:"mm",nominal:10,tolerance:0.1,lowerLimit:9,upperLimit:11,method:"CMM"},
      {id:"INS-4",criterionId:"DIM-2",measuredValue:10,unit:"mm"}
    );
    expect(result.status).toBe("INCOMPLETE");
    expect(result.reason).toContain("Do not mix");
  });
});

describe("manufacturing evidence bridge",()=>{
  it("creates verified manufacturing evidence only after plan and inspection acceptance",()=>{
    const project=createProject("Manufacturing verification");
    project.requirements.push({id:"REQ-1",name:"Dimensional requirement",priority:"MUST",status:"OPEN"});
    const memory=new EngineeringMemory();
    memory.save(project);

    const p={...plan(),projectId:project.id};
    const planValidation=validateManufacturingProcessPlan(p);
    const criterion={id:"DIM-1",name:"Bore diameter",characteristic:"bore diameter",unit:"mm",nominal:50,tolerance:0.10,method:"CMM"};
    const inspection={id:"INS-1",criterionId:"DIM-1",measuredValue:50.03,unit:"mm",instrument:"CMM-01"};
    const acceptance=evaluateManufacturingInspection(criterion,inspection);

    const bridged=bridgeManufacturingEvidence({
      project,memory,plan:p,planValidation,criterion,inspection,acceptance
    });

    expect(bridged.evidence?.type).toBe("MANUFACTURING_CHECK");
    expect(bridged.evidence?.status).toBe("VERIFIED");
    expect(memory.getEvidence(bridged.evidence!.id)?.status).toBe("VERIFIED");
    expect(memory.getArtifact(bridged.processArtifact.id)?.evidenceIds).toEqual([bridged.evidence!.id]);
    expect(memory.getArtifact(bridged.inspectionArtifact.id)?.evidenceIds).toEqual([bridged.evidence!.id]);
    expect(project.evidenceIds).toContain(bridged.evidence!.id);
    expect(memory.get(project.id)?.evidenceIds).toContain(bridged.evidence!.id);
  });

  it("blocks evidence creation when inspection is rejected",()=>{
    const project=createProject("Manufacturing rejection");
    const memory=new EngineeringMemory();
    memory.save(project);
    const p={...plan(),projectId:project.id};
    const planValidation=validateManufacturingProcessPlan(p);
    const criterion={id:"DIM-1",name:"Bore diameter",characteristic:"bore diameter",unit:"mm",nominal:50,tolerance:0.10,method:"CMM"};
    const inspection={id:"INS-2",criterionId:"DIM-1",measuredValue:50.25,unit:"mm"};
    const acceptance=evaluateManufacturingInspection(criterion,inspection);
    const bridged=bridgeManufacturingEvidence({project,memory,plan:p,planValidation,criterion,inspection,acceptance});
    expect(bridged.evidence).toBeUndefined();
    expect(project.evidenceIds??[]).toEqual([]);
  });
});

describe("manufacturing provider",()=>{
  it("executes both manufacturing capabilities through the provider boundary",async()=>{
    const provider=new ManufacturingProvider();
    const planResult=await provider.execute({capability:"MANUFACTURING.VALIDATE_PROCESS_PLAN",risk:"MEDIUM",input:{plan:plan()}});
    expect(planResult.success).toBe(true);
    expect((planResult.output as {status:string}).status).toBe("PASS");

    const inspectionResult=await provider.execute({
      capability:"MANUFACTURING.EVALUATE_INSPECTION",risk:"MEDIUM",
      input:{
        criterion:{id:"DIM-1",name:"Bore diameter",characteristic:"bore diameter",unit:"mm",nominal:50,tolerance:0.10,method:"CMM"},
        result:{id:"INS-1",criterionId:"DIM-1",measuredValue:50.03,unit:"mm"}
      }
    });
    expect(inspectionResult.success).toBe(true);
    expect((inspectionResult.output as {status:string}).status).toBe("ACCEPTED");
  });
});
