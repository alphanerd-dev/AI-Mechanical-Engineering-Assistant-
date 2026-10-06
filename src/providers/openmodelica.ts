import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {CoSimulationRequest,SystemParameterSweepRequest,SystemSimulationInput,SystemSimulationResult,SystemSensitivityRequest,CoSimulationResult,SystemParameterSweepResult} from "../system-simulation/types.js";
import {validateParameterSweepRequest,validateSystemSimulationInput,validateSensitivityRequest,validateCoSimulationRequest} from "../system-simulation/validation.js";
import {enumerateParameterSweep} from "../system-simulation/sweep.js";
import {calculateCentralSensitivity} from "../system-simulation/sensitivity.js";
import {validateCoSimulationStepAlignment} from "../system-simulation/co-simulation.js";

export interface OpenModelicaExecutor{
  simulate(input:SystemSimulationInput):Promise<SystemSimulationResult>;
  coSimulate(input:CoSimulationRequest):Promise<CoSimulationResult>;
}

export class OpenModelicaProvider implements EngineeringProvider{
  readonly id="simulation.openmodelica";
  readonly capabilities=["SIMULATION.SYSTEM","SIMULATION.PARAMETER_SWEEP","SIMULATION.SENSITIVITY","SIMULATION.CO_SIMULATE"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"simulation",
    status:"EXPERIMENTAL",
    version:"1.0",
    capabilities:this.capabilities,
    requires:["OpenModelica runtime"]
  };

  constructor(private readonly executor:OpenModelicaExecutor){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      if(request.capability==="SIMULATION.SYSTEM"){
        const input=request.input as unknown as SystemSimulationInput;
        const errors=validateSystemSimulationInput(input);
        if(errors.length)return {capability:request.capability,provider:this.id,success:false,error:errors.join("; ")};
        const result=await this.executor.simulate(input);
        if(result.status!=="COMPLETED"||!result.converged)
          return {capability:request.capability,provider:this.id,success:false,output:result,error:result.error??"OpenModelica system simulation did not complete with converged=true."};
        return {capability:request.capability,provider:this.id,success:true,output:result,artifactIds:result.artifactIds};
      }

      if(request.capability==="SIMULATION.PARAMETER_SWEEP"){
        const input=request.input as unknown as SystemParameterSweepRequest;
        const errors=validateParameterSweepRequest(input);
        if(errors.length)return {capability:request.capability,provider:this.id,success:false,error:errors.join("; ")};
        const enumeration=enumerateParameterSweep(input);
        if(enumeration.status!=="OK")return {capability:request.capability,provider:this.id,success:false,output:{status:"INCOMPLETE",cases:[],results:[],samplesEvaluated:0,message:enumeration.message} as SystemParameterSweepResult};
        const results:SystemParameterSweepResult["results"]=[];
        for(const sample of enumeration.cases){
          const simulation=await this.executor.simulate({...input.baseInput,parameters:sample.parameters});
          const objectiveValue=input.objective?simulation.metrics[input.objective.metric]?.value:undefined;
          if(input.objective&&objectiveValue===undefined)
            return {capability:request.capability,provider:this.id,success:false,output:{status:"INCOMPLETE",cases:enumeration.cases,results,samplesEvaluated:results.length,message:"Objective metric "+input.objective.metric+" was missing from a simulation result."} as SystemParameterSweepResult};
          results.push({index:sample.index,parameters:sample.parameters,simulation,objectiveValue});
        }
        const feasible=results.filter(x=>x.simulation.status==="COMPLETED"&&x.simulation.converged&&(!input.objective||x.objectiveValue!==undefined));
        if(!feasible.length)return {capability:request.capability,provider:this.id,success:false,output:{status:"NO_FEASIBLE_RESULT",cases:enumeration.cases,results,samplesEvaluated:results.length,message:"No completed converged simulation satisfied the sweep evaluation requirements."} as SystemParameterSweepResult};
        const best=input.objective
          ? feasible.reduce((a,b)=>input.objective!.direction==="MINIMIZE"?(a.objectiveValue!<=b.objectiveValue!?a:b):(a.objectiveValue!>=b.objectiveValue!?a:b))
          : feasible[0];
        const output:SystemParameterSweepResult={
          status:"COMPLETED",
          cases:enumeration.cases,
          results,
          bestIndex:best.index,
          bestParameters:best.parameters,
          bestObjectiveValue:best.objectiveValue,
          samplesEvaluated:results.length,
          message:"Parameter sweep completed from explicitly enumerated design points."
        };
        return {capability:request.capability,provider:this.id,success:true,output};
      }

      if(request.capability==="SIMULATION.SENSITIVITY"){
        const input=request.input as unknown as SystemSensitivityRequest;
        const errors=validateSensitivityRequest(input);
        if(errors.length)return {capability:request.capability,provider:this.id,success:false,error:errors.join("; ")};
        const delta=input.absoluteDelta??Math.abs(input.baseInput.parameters[input.parameter])*input.relativeDelta!;
        if(delta<=0)return {capability:request.capability,provider:this.id,success:false,error:"Sensitivity perturbation produced a non-positive delta."};
        const baseValue=input.baseInput.parameters[input.parameter];
        const lower=await this.executor.simulate({...input.baseInput,parameters:{...input.baseInput.parameters,[input.parameter]:baseValue-delta}});
        const base=await this.executor.simulate(input.baseInput);
        const upper=await this.executor.simulate({...input.baseInput,parameters:{...input.baseInput.parameters,[input.parameter]:baseValue+delta}});
        if(lower.status!=="COMPLETED"||base.status!=="COMPLETED"||upper.status!=="COMPLETED")
          return {capability:request.capability,provider:this.id,success:false,output:{status:"FAILED",parameter:input.parameter,metric:input.metric,message:"One or more sensitivity simulations did not complete."} as SystemSensitivityResult};
        const output=calculateCentralSensitivity(input,lower,base,upper);
        return {capability:request.capability,provider:this.id,success:output.status==="COMPLETED",output};
      }

      if(request.capability==="SIMULATION.CO_SIMULATE"){
        const input=request.input as unknown as CoSimulationRequest;
        const errors=validateCoSimulationRequest(input);
        if(errors.length)return {capability:request.capability,provider:this.id,success:false,error:errors.join("; ")};
        const alignment=validateCoSimulationStepAlignment(input);
        if(alignment.length)return {capability:request.capability,provider:this.id,success:false,error:alignment.join("; ")};
        const output=await this.executor.coSimulate(input);
        return {capability:request.capability,provider:this.id,success:output.status==="COMPLETED",output,artifactIds:output.artifactIds};
      }

      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported OpenModelica capability."};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"OpenModelica capability failed."};
    }
  }
}
