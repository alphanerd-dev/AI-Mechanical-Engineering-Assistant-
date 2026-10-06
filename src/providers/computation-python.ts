import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
export class PythonComputationProvider implements CapabilityProvider{
 id="computation.python-worker";
 capabilities=["UNITS.CONVERT","UNITS.CHECK_DIMENSIONS","MATH.SYMBOLIC_SOLVE","MATH.NUMERICAL_SOLVE","MATH.OPTIMIZE"];
 constructor(private readonly executeWorker:(request:CapabilityRequest)=>Promise<CapabilityResult>){}
 execute(request:CapabilityRequest){return this.executeWorker(request);}
}
