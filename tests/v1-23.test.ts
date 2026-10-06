import {describe,expect,it} from "vitest";
import {ChronoDynamicsProvider} from "../src/providers/dynamics-chrono.js";
import {PinocchioDynamicsProvider} from "../src/providers/dynamics-pinocchio.js";
import {DynamicsComparisonProvider} from "../src/providers/dynamics-comparison.js";
import {RoboticsProvider} from "../src/providers/robotics.js";
import {RoboticsRuntimeProvider} from "../src/providers/robotics-runtime.js";
import {compareMultibodyDynamicsResults} from "../src/dynamics/comparison.js";
import {validateRoboticsRuntimeAsset} from "../src/robotics/runtime.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {V1_23_CAPABILITIES} from "../src/capabilities/v1-23.js";

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
  sourceCadArtifactId:"CAD-1",
  uri:"artifact://robot-1.urdf",
  validationStatus:"PASS" as const
};

describe("V1.23 Chrono boundary",()=>{
  it("executes through the Chrono provider contract",async()=>{
    const provider=new ChronoDynamicsProvider({
      simulate:async()=>({converged:true,steps:100,durationS:1,warnings:[]})
    });
    const result=await provider.execute({capability:"DYNAMICS.SIMULATE_MULTIBODY",risk:"HIGH",input:{model,timeStepS:0.01,durationS:1}});
    expect(result.success).toBe(true);
  });
});

describe("V1.23 Pinocchio boundary",()=>{
  it("requires explicit joint state inputs and preserves dof order",async()=>{
    const provider=new PinocchioDynamicsProvider({
      inverseDynamics:async()=>({"J-1":12.5})
    });
    const result=await provider.execute({
      capability:"DYNAMICS.INVERSE_DYNAMICS",
      risk:"HIGH",
      input:{
        model,
        positions:{"J-1":0},
        velocities:{"J-1":0},
        accelerations:{"J-1":1},
        gravityMps2:{x:0,y:0,z:-9.81}
      }
    });
    expect(result.success).toBe(true);
    expect((result.output as any).dofOrder).toEqual(["J-1"]);
    expect((result.output as any).generalizedForces["J-1"]).toBe(12.5);
  });
  it("fails closed when a joint state is missing",async()=>{
    const provider=new PinocchioDynamicsProvider({inverseDynamics:async()=>({"J-1":1})});
    const result=await provider.execute({
      capability:"DYNAMICS.INVERSE_DYNAMICS",
      risk:"HIGH",
      input:{model,positions:{},velocities:{"J-1":0},accelerations:{"J-1":0}}
    });
    expect(result.success).toBe(false);
  });
});

describe("V1.23 cross-solver validation",()=>{
  const reference={converged:true,steps:100,durationS:1,warnings:[]};
  const candidate={converged:true,steps:100,durationS:1,warnings:[]};

  it("matches explicit solver metrics within tolerance",()=>{
    const result=compareMultibodyDynamicsResults(reference,candidate,[
      {name:"final angle",reference:1.00,candidate:1.005,unit:"rad",absoluteTolerance:0.01},
      {name:"final velocity",reference:2.00,candidate:2.01,unit:"rad/s",relativeTolerance:0.01}
    ]);
    expect(result.status).toBe("MATCH");
  });

  it("does not claim trajectory equivalence from matching summary metrics",()=>{
    const result=compareMultibodyDynamicsResults(
      {...reference,steps:100},
      {...candidate,steps:80},
      [{name:"final angle",reference:1,candidate:1,unit:"rad",absoluteTolerance:0}]
    );
    expect(result.status).toBe("MATCH");
    expect(result.warnings.some(x=>x.includes("trajectory equivalence"))).toBe(true);
  });

  it("fails closed without explicit comparison tolerance",()=>{
    const result=compareMultibodyDynamicsResults(reference,candidate,[{name:"angle",reference:1,candidate:1,unit:"rad"}]);
    expect(result.status).toBe("INCOMPLETE");
  });

  it("detects a solver mismatch",()=>{
    const result=compareMultibodyDynamicsResults(reference,candidate,[{name:"angle",reference:1,candidate:1.2,unit:"rad",absoluteTolerance:0.01}]);
    expect(result.status).toBe("MISMATCH");
  });

  it("routes comparison through the dedicated provider",async()=>{
    const provider=new DynamicsComparisonProvider();
    const result=await provider.execute({
      capability:"DYNAMICS.COMPARE_SOLVERS",
      risk:"HIGH",
      input:{referenceResult:reference,candidateResult:candidate,criteria:[{name:"angle",reference:1,candidate:1.001,unit:"rad",absoluteTolerance:0.01}]}
    });
    expect(result.success).toBe(true);
    expect((result.output as any).status).toBe("MATCH");
  });
});

describe("V1.23 CAD to robotics runtime",()=>{
  it("keeps source CAD lineage and validates runtime-ready assets",()=>{
    expect(validateRoboticsRuntimeAsset(asset).valid).toBe(true);
  });

  it("validates converted assets before returning success",async()=>{
    const provider=new RoboticsProvider({
      convertCAD:async input=>({...asset,id:"ROBOT-2",sourceCadArtifactId:input.sourceArtifactId})
    });
    const result=await provider.execute({capability:"ROBOTICS.CONVERT_CAD_ASSET",risk:"HIGH",input:{sourceArtifactId:"CAD-1",targetFormat:"URDF"}});
    expect(result.success).toBe(true);
  });

  it("rejects a converter result that loses CAD lineage",async()=>{
    const provider=new RoboticsProvider({
      convertCAD:async()=>({...asset,id:"ROBOT-2",sourceCadArtifactId:"OTHER-CAD"})
    });
    const result=await provider.execute({capability:"ROBOTICS.CONVERT_CAD_ASSET",risk:"HIGH",input:{sourceArtifactId:"CAD-1",targetFormat:"URDF"}});
    expect(result.success).toBe(false);
  });

  it("loads a runtime asset only through an explicit runtime executor",async()=>{
    const provider=new RoboticsRuntimeProvider({
      load:async input=>({runtime:"test-runtime",handle:"handle-1",assetId:input.id})
    });
    const result=await provider.execute({capability:"ROBOTICS.LOAD_ASSET_RUNTIME",risk:"HIGH",input:{asset}});
    expect(result.success).toBe(true);
    expect((result.output as any).runtime).toBe("test-runtime");
  });

  it("rejects runtime loading when asset validation has not passed",async()=>{
    const provider=new RoboticsRuntimeProvider({
      load:async input=>({runtime:"test-runtime",handle:"handle-1",assetId:input.id})
    });
    const result=await provider.execute({
      capability:"ROBOTICS.LOAD_ASSET_RUNTIME",
      risk:"HIGH",
      input:{asset:{...asset,validationStatus:"UNVALIDATED" as const}}
    });
    expect(result.success).toBe(false);
  });
});

describe("V1.23 routed capabilities",()=>{
  it("routes Chrono, Pinocchio, comparison, and robotics runtime capabilities",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.registerCatalog(V1_23_CAPABILITIES);
    registry.register(new ChronoDynamicsProvider({simulate:async()=>({converged:true,steps:1,durationS:0.1,warnings:[]})}));
    registry.register(new PinocchioDynamicsProvider({inverseDynamics:async()=>({"J-1":1})}));
    registry.register(new DynamicsComparisonProvider());
    registry.register(new RoboticsRuntimeProvider({load:async input=>({runtime:"test-runtime",handle:"h",assetId:input.id})}));
    const router=new CapabilityRouter(registry);

    expect((await router.execute({
      capability:"DYNAMICS.SIMULATE_MULTIBODY",
      risk:"HIGH",
      input:{model,timeStepS:0.1,durationS:0.1}
    })).success).toBe(true);

    expect((await router.execute({
      capability:"DYNAMICS.INVERSE_DYNAMICS",
      risk:"HIGH",
      input:{model,positions:{"J-1":0},velocities:{"J-1":0},accelerations:{"J-1":1}}
    })).success).toBe(true);

    expect((await router.execute({
      capability:"DYNAMICS.COMPARE_SOLVERS",
      risk:"HIGH",
      input:{
        referenceResult:{converged:true,steps:1,durationS:0.1,warnings:[]},
        candidateResult:{converged:true,steps:1,durationS:0.1,warnings:[]},
        criteria:[{name:"angle",reference:1,candidate:1,unit:"rad",absoluteTolerance:0}]
      }
    })).success).toBe(true);

    expect((await router.execute({
      capability:"ROBOTICS.LOAD_ASSET_RUNTIME",
      risk:"HIGH",
      input:{asset}
    })).success).toBe(true);
  });
});
