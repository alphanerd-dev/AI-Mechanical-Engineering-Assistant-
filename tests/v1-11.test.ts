import {describe,expect,it} from "vitest";
import {validateMultibodyDynamicsModel} from "../src/dynamics/validation.js";
import {MultibodyDynamicsProvider} from "../src/providers/dynamics.js";
import {validateRoboticsAsset} from "../src/robotics/validation.js";
import {RoboticsProvider} from "../src/providers/robotics.js";
import {compareSimulationResults} from "../src/simulation/comparison.js";
import {DigitalThreadGraph} from "../src/digital-thread/types.js";
import {SimulationComparisonProvider} from "../src/providers/simulation-comparison.js";
import {DigitalThreadProvider} from "../src/providers/digital-thread.js";

const model={
  id:"DYN-1",
  name:"Two-body arm",
  bodies:[
    {id:"BASE",name:"Base",massKg:10},
    {id:"LINK-1",name:"Link 1",massKg:2}
  ],
  joints:[
    {id:"J-1",name:"Shoulder",type:"REVOLUTE" as const,parentBodyId:"BASE",childBodyId:"LINK-1"}
  ]
};

const asset={
  id:"ROBOT-1",
  name:"Arm",
  format:"URDF" as const,
  topology:"TREE" as const,
  rootLinkId:"base",
  links:[
    {id:"base",name:"Base"},
    {id:"link-1",name:"Link 1"}
  ],
  joints:[
    {id:"j-1",name:"Shoulder",type:"REVOLUTE" as const,parentLinkId:"base",childLinkId:"link-1"}
  ],
  validationStatus:"UNVALIDATED" as const
};

describe("V1.11 dynamics",()=>{
  it("accepts a structurally valid multibody model",()=>{
    expect(validateMultibodyDynamicsModel(model).valid).toBe(true);
  });
  it("rejects a multibody topology cycle",()=>{
    const cyclic={
      ...model,
      joints:[
        ...model.joints,
        {id:"J-2",name:"Return",type:"REVOLUTE" as const,parentBodyId:"LINK-1",childBodyId:"BASE"}
      ]
    };
    const result=validateMultibodyDynamicsModel(cyclic);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("A multibody tree requires exactly one root body; found 0.");
    expect(result.errors).toContain("Dynamics body/joint topology contains a cycle.");
  });
  it("keeps the numerical solver behind a provider boundary",async()=>{
    const provider=new MultibodyDynamicsProvider({
      simulate:async()=>({converged:true,steps:100,durationS:1,warnings:[]})
    });
    const result=await provider.execute({
      capability:"DYNAMICS.SIMULATE_MULTIBODY",
      risk:"HIGH",
      input:{model,timeStepS:0.01,durationS:1}
    });
    expect(result.success).toBe(true);
  });
});

describe("V1.11 robotics",()=>{
  it("accepts a valid tree asset",()=>{
    expect(validateRoboticsAsset(asset).valid).toBe(true);
  });
  it("rejects disconnected tree assets",()=>{
    const disconnected={...asset,links:[...asset.links,{id:"orphan",name:"Orphan"}]};
    const result=validateRoboticsAsset(disconnected);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tree link orphan must have exactly one parent joint.");
  });
  it("keeps CAD conversion behind a provider boundary",async()=>{
    const provider=new RoboticsProvider({
      convertCAD:async input=>({...asset,id:"ROBOT-2",sourceCadArtifactId:input.sourceArtifactId})
    });
    const result=await provider.execute({
      capability:"ROBOTICS.CONVERT_CAD_ASSET",
      risk:"HIGH",
      input:{sourceArtifactId:"CAD-1",targetFormat:"URDF"}
    });
    expect(result.success).toBe(true);
    expect((result.output as {sourceCadArtifactId?:string}).sourceCadArtifactId).toBe("CAD-1");
  });
  it("validates converted assets through the same provider boundary",async()=>{
    const provider=new RoboticsProvider({convertCAD:async()=>asset});
    const result=await provider.execute({
      capability:"ROBOTICS.VALIDATE_ASSET",
      risk:"MEDIUM",
      input:{asset}
    });
    expect(result.success).toBe(true);
    expect((result.output as {valid:boolean}).valid).toBe(true);
  });
});

describe("V1.11 simulation comparison",()=>{
  it("matches simulations within explicit tolerances",()=>{
    const result=compareSimulationResults([
      {name:"maxStress",reference:100,candidate:101,relativeTolerance:0.02,unit:"MPa"},
      {name:"displacement",reference:1,candidate:1.01,absoluteTolerance:0.02,unit:"mm"}
    ]);
    expect(result.status).toBe("MATCH");
  });
  it("detects a simulation mismatch",()=>{
    const result=compareSimulationResults([{name:"maxStress",reference:100,candidate:110,relativeTolerance:0.02}]);
    expect(result.status).toBe("MISMATCH");
  });
  it("routes simulation comparison through a provider",async()=>{
    const provider=new SimulationComparisonProvider();
    const result=await provider.execute({
      capability:"SIMULATION.COMPARE_RESULTS",
      risk:"MEDIUM",
      input:{metrics:[{name:"stress",reference:100,candidate:100,absoluteTolerance:0}]}
    });
    expect(result.success).toBe(true);
    expect((result.output as {status:string}).status).toBe("MATCH");
  });
});

describe("V1.11 digital thread",()=>{
  it("rejects self-links and retains provenance",()=>{
    const graph=new DigitalThreadGraph();
    const link={
      id:"L-1",
      projectId:"P-1",
      from:{kind:"REQUIREMENT" as const,id:"REQ-1"},
      to:{kind:"ARTIFACT" as const,id:"CAD-1"},
      relation:"IMPLEMENTS" as const,
      evidenceIds:["EV-1"],
      createdAt:new Date().toISOString()
    };
    expect(graph.addLink(link).evidenceIds).toEqual(["EV-1"]);
    expect(graph.linksFor({kind:"REQUIREMENT",id:"REQ-1"})).toHaveLength(1);
    expect(()=>graph.addLink({
      ...link,
      id:"L-2",
      from:{kind:"REQUIREMENT",id:"REQ-1"},
      to:{kind:"REQUIREMENT",id:"REQ-1"}
    })).toThrow("cannot point to itself");
  });
  it("routes digital-thread links through a provider",async()=>{
    const provider=new DigitalThreadProvider();
    const result=await provider.execute({
      capability:"DIGITAL_THREAD.LINK",
      risk:"MEDIUM",
      input:{
        link:{
          id:"L-2",projectId:"P-1",
          from:{kind:"CAD",id:"CAD-1"},
          to:{kind:"MANUFACTURING",id:"PLAN-1"},
          relation:"MANUFACTURED_AS",
          createdAt:new Date().toISOString()
        }
      }
    });
    expect(result.success).toBe(true);
    expect(provider.graph.all()).toHaveLength(1);
  });
});
