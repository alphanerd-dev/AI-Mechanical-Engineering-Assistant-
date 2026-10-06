import {describe,expect,it} from "vitest";
import {OpenModelicaProvider} from "../src/providers/openmodelica.js";
import {enumerateParameterSweep} from "../src/system-simulation/sweep.js";
import {calculateCentralSensitivity} from "../src/system-simulation/sensitivity.js";
import {validateCoSimulationStepAlignment} from "../src/system-simulation/co-simulation.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {V1_24_CAPABILITIES} from "../src/capabilities/v1-24.js";

const model={
  id:"MODEL-1",
  name:"Thermal system",
  language:"MODELICA" as const,
  modelName:"TestSystem",
  source:"model TestSystem end TestSystem;"
};

const baseInput={
  model,
  parameters:{gain:1},
  startTimeS:0,
  stopTimeS:1,
  stepS:0.1
};

function result(value:number){
  return {status:"COMPLETED" as const,modelId:"MODEL-1",solver:"openmodelica",converged:true,startTimeS:0,stopTimeS:1,steps:10,metrics:{output:{value}},warnings:[]};
}

describe("V1.24 OpenModelica system simulation",()=>{
  it("fails closed without a configured runtime",async()=>{
    const provider=new OpenModelicaProvider({
      simulate:async()=>{throw new Error("not configured");},
      coSimulate:async()=>{throw new Error("not configured");}
    });
    const response=await provider.execute({capability:"SIMULATION.SYSTEM",risk:"HIGH",input:baseInput});
    expect(response.success).toBe(false);
  });

  it("routes a deterministic system simulation through the provider",async()=>{
    const provider=new OpenModelicaProvider({
      simulate:async input=>result(input.parameters.gain*2),
      coSimulate:async input=>({status:"COMPLETED" as const,participants:input.participants.map(x=>x.id),steps:10,warnings:[],message:"test co-simulation result"})
    });
    const response=await provider.execute({capability:"SIMULATION.SYSTEM",risk:"HIGH",input:baseInput});
    expect(response.success).toBe(true);
    expect((response.output as any).solver).toBe("openmodelica");
  });
});

describe("V1.24 parameter sweep",()=>{
  it("enumerates a bounded grid deterministically",()=>{
    const enumeration=enumerateParameterSweep({
      baseInput:{...baseInput,parameters:{}},
      variables:[{name:"gain",lower:1,upper:2,step:0.5,unit:"1"}]
    });
    expect(enumeration.status).toBe("OK");
    expect(enumeration.cases.map(x=>x.parameters.gain)).toEqual([1,1.5,2]);
  });

  it("fails closed when the sample ceiling is exceeded",()=>{
    const enumeration=enumerateParameterSweep({
      baseInput,
      variables:[
        {name:"a",lower:0,upper:10,step:1,unit:"1"},
        {name:"b",lower:0,upper:10,step:1,unit:"1"}
      ],
      maxSamples:100
    });
    expect(enumeration.status).toBe("INCOMPLETE");
  });

  it("selects the best explicit objective",async()=>{
    const provider=new OpenModelicaProvider({
      simulate:async input=>result(input.parameters.sweepGain),
      coSimulate:async input=>({status:"COMPLETED" as const,participants:input.participants.map(x=>x.id),steps:10,warnings:[],message:"test co-simulation result"})
    });
    const response=await provider.execute({
      capability:"SIMULATION.PARAMETER_SWEEP",
      risk:"HIGH",
      input:{
        baseInput,
        variables:[{name:"sweepGain",lower:1,upper:3,step:1,unit:"1"}],
        objective:{metric:"output",direction:"MINIMIZE"}
      }
    });
    expect(response.success).toBe(true);
    expect((response.output as any).bestParameters.sweepGain).toBe(1);
  });
});

describe("V1.24 sensitivity",()=>{
  it("calculates central finite-difference sensitivity",()=>{
    const input={...baseInput,parameters:{gain:2}};
    const lower=result(3);
    const base=result(4);
    const upper=result(5);
    const sensitivity=calculateCentralSensitivity(
      {baseInput:input,parameter:"gain",absoluteDelta:1,metric:"output"},
      lower,base,upper
    );
    expect(sensitivity.status).toBe("COMPLETED");
    expect(sensitivity.derivative).toBe(1);
  });
});

describe("V1.24 co-simulation",()=>{
  it("requires aligned participant time steps",()=>{
    const errors=validateCoSimulationStepAlignment({
      participants:[
        {id:"A",model,stepS:0.2},
        {id:"B",model:{...model,id:"MODEL-2"},stepS:0.4}
      ],
      startTimeS:0,
      stopTimeS:1,
      communicationStepS:0.2
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects non-aligned participant steps",()=>{
    const errors=validateCoSimulationStepAlignment({
      participants:[{id:"A",model,stepS:0.3},{id:"B",model:{...model,id:"MODEL-2"},stepS:0.2}],
      startTimeS:0,
      stopTimeS:1,
      communicationStepS:0.2
    });
    expect(errors).toHaveLength(1);
  });
});

describe("V1.24 routed capabilities",()=>{
  it("routes system, sweep and co-simulation capabilities",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.registerCatalog(V1_24_CAPABILITIES);
    const provider=new OpenModelicaProvider({
      simulate:async input=>result(input.parameters.sweepGain??input.parameters.gain),
      coSimulate:async input=>({status:"COMPLETED" as const,participants:input.participants.map(x=>x.id),steps:10,warnings:[],message:"test co-simulation result"})
    });
    registry.register(provider);
    const router=new CapabilityRouter(registry);

    expect((await router.execute({capability:"SIMULATION.SYSTEM",risk:"HIGH",input:baseInput})).success).toBe(true);

    expect((await router.execute({capability:"SIMULATION.PARAMETER_SWEEP",risk:"HIGH",input:{
      baseInput,variables:[{name:"sweepGain",lower:1,upper:2,step:1,unit:"1"}]
    }})).success).toBe(true);

    expect((await router.execute({capability:"SIMULATION.SENSITIVITY",risk:"HIGH",input:{
      baseInput,parameter:"gain",absoluteDelta:0.1,metric:"output"
    }})).success).toBe(true);

    expect((await router.execute({capability:"SIMULATION.CO_SIMULATE",risk:"HIGH",input:{
      participants:[
        {id:"A",model,stepS:0.1},
        {id:"B",model:{...model,id:"MODEL-2"},stepS:0.2}
      ],
      startTimeS:0,stopTimeS:1,communicationStepS:0.1
    }})).success).toBe(true);
  });
});
