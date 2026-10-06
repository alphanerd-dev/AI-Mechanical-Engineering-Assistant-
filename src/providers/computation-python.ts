import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {PythonWorkerClient} from "../execution/python-worker.js";
export class PythonComputationProvider implements CapabilityProvider{
 id="computation.pint-sympy-scipy";
 capabilities=["UNITS.CONVERT","UNITS.CHECK_DIMENSIONS","MATH.SYMBOLIC_SOLVE","MATH.NUMERICAL_SOLVE","MATH.OPTIMIZE"];
 constructor(private readonly worker:PythonWorkerClient){}
 async execute(request:CapabilityRequest):Promise<CapabilityResult>{
  const r=await this.worker.run({id:"computation-"+Date.now(),capability:request.capability,backend:"python-worker",inputs:request.input,requestedOutputs:[],timeoutMs:10000});
  return {capability:request.capability,provider:this.id,success:r.success,output:r.outputs,error:r.success?undefined:r.warnings.join("; ")};
 }
}
