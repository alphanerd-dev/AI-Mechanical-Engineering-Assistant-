import {describe,it,expect} from "vitest";
import {CapabilityRegistry,CapabilityProvider} from "../src/capabilities/registry.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {GmshProvider} from "../src/providers/gmsh.js";
import {CalculixProvider} from "../src/providers/calculix.js";
import {CalculixWorkerExecutor} from "../src/execution/fea-worker.js";
import {validateFEAExecution,validateStaticStructuralRequest} from "../src/fea/validation.js";

const request={
  id:"fea-1",
  modelArtifactId:"cad-1",
  mesh:{artifactId:"mesh-1",path:"mesh.inp",format:"CALCULIX_INP" as const,elementType:"C3D4" as const,nodeSets:["FIXED","LOAD"]},
  material:{name:"steel",youngsModulusMpa:210000,poissonRatio:0.3,yieldStrengthMpa:250},
  loads:[{id:"load-1",type:"FORCE" as const,nodeSet:"LOAD",magnitudeN:1000,direction:[0,-1,0] as [number,number,number]}],
  boundaryConditions:[{id:"fix-1",type:"FIXED" as const,nodeSet:"FIXED"}],
  requestedOutputs:["DISPLACEMENT","STRESS","REACTION_FORCE"] as const,
  timeoutMs:30000
};

describe("V1.18 open FEA",()=>{
  it("adds provider-neutral mesh and CalculiX capabilities",()=>{
    expect(ENGINEERING_CAPABILITIES.find(c=>c.id==="ANALYSIS.MESH")?.providers).toContain("open.gmsh");
    expect(ENGINEERING_CAPABILITIES.find(c=>c.id==="ANALYSIS.STATIC_STRUCTURAL")?.providers).toContain("open.calculix");
  });

  it("fails closed when critical FEA inputs are missing",()=>{
    const errors=validateStaticStructuralRequest({...request,loads:[]});
    expect(errors).toContain("At least one force load case is required.");
  });

  it("validates only execution integrity, not design safety",()=>{
    const result={
      analysis:"STATIC_STRUCTURAL" as const,
      solver:"calculix",
      solverVersion:"2.20",
      converged:true,
      exitCode:0,
      mesh:{nodeCount:10,elementCount:4,elementType:"C3D4" as const},
      maxVonMisesStressMpa:400,
      maxDisplacementMm:2,
      reactionForcesN:{x:0,y:1000,z:0},
      artifacts:[],
      warnings:[]
    };
    const v=validateFEAExecution(result,["DISPLACEMENT","STRESS","REACTION_FORCE"]);
    expect(v.status).toBe("PASS");
  });

  it("blocks incomplete normalized results",()=>{
    const result={
      analysis:"STATIC_STRUCTURAL" as const,
      solver:"calculix",
      solverVersion:"2.20",
      converged:true,
      exitCode:0,
      mesh:{nodeCount:10,elementCount:4,elementType:"C3D4" as const},
      artifacts:[],
      warnings:[]
    };
    const v=validateFEAExecution(result,["DISPLACEMENT"]);
    expect(v.status).toBe("FAIL");
  });

  it("keeps Gmsh behind a provider boundary",async()=>{
    const p=new GmshProvider({generateMesh:async input=>({
      success:true,provider:"open.gmsh",providerVersion:"4.15.2",format:"CALCULIX_INP",elementType:"C3D4",
      nodeCount:8,elementCount:5,nodeSets:["FIXED","LOAD"],warnings:[],meshArtifactPath:`${input.id}.inp`
    })});
    const r=await p.execute({capability:"ANALYSIS.MESH",risk:"HIGH",input:{id:"mesh-1",geometry:{kind:"BOX",lengthMm:100,widthMm:20,heightMm:20},elementSizeMm:10}});
    expect(r.success).toBe(true);
  });

  it("keeps CalculiX behind a provider boundary",async()=>{
    const p=new CalculixProvider({runStaticStructural:async()=>({
      analysis:"STATIC_STRUCTURAL",solver:"calculix",solverVersion:"2.20",converged:true,exitCode:0,
      mesh:{nodeCount:10,elementCount:4,elementType:"C3D4"},maxVonMisesStressMpa:50,maxDisplacementMm:0.2,
      reactionForcesN:{x:0,y:1000,z:0},artifacts:[],warnings:[]
    })});
    const r=await p.execute({capability:"ANALYSIS.STATIC_STRUCTURAL",risk:"HIGH",input:request});
    expect(r.success).toBe(true);
  });

  it("rejects invalid FEA requests before transport",async()=>{
    let called=false;
    const executor=new CalculixWorkerExecutor({run:async()=>{called=true;throw new Error("should not run");}});
    const r=await executor.execute({...request,timeoutMs:500});
    expect(r.success).toBe(false);
    expect(called).toBe(false);
  });

  it("orders open CalculiX ahead of the Ansys fallback",()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.register(new CalculixProvider({runStaticStructural:async()=>{throw new Error("not executed");}}));
    const ansys:CapabilityProvider={
      id:"ansys.pymechanical",
      capabilities:["ANALYSIS.STATIC_STRUCTURAL"],
      execute:async request=>({capability:request.capability,provider:"ansys.pymechanical",success:true})
    };
    registry.register(ansys);
    expect(registry.resolve("ANALYSIS.STATIC_STRUCTURAL")[0].id).toBe("open.calculix");
  });
});
