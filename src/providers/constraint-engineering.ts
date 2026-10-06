import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {exploreEngineeringDesignSpace,solveEngineeringConstraints,DesignSpaceRequest,ConstraintSolveRequest} from "../constraints/solver.js";
import {parseToleranceCallout,makeISO286FitCallout} from "../tolerance/callout.js";
import {rssTolerance,worstCaseTolerance} from "../tolerance/stack.js";
import {ToleranceStackInput} from "../tolerance/types.js";

export class ConstraintEngineeringProvider implements CapabilityProvider{
  id="constraints.deterministic";
  capabilities=["CONSTRAINT.SOLVE","CONSTRAINT.EXPLORE_DESIGN_SPACE","TOLERANCE.STACK_WORST_CASE","TOLERANCE.STACK_RSS","TOLERANCE.PARSE_CALLOUT","TOLERANCE.ISO_286_CALLOUT"];
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      if(request.capability==="CONSTRAINT.SOLVE"){
        const output=solveEngineeringConstraints(request.input as unknown as ConstraintSolveRequest);
        return {capability:request.capability,provider:this.id,success:output.status==="SOLVED",output};
      }
      if(request.capability==="CONSTRAINT.EXPLORE_DESIGN_SPACE"){
        const output=exploreEngineeringDesignSpace(request.input as unknown as DesignSpaceRequest);
        return {capability:request.capability,provider:this.id,success:output.status==="SOLVED",output};
      }
      if(request.capability==="TOLERANCE.STACK_WORST_CASE"){
        const output=worstCaseTolerance(request.input as unknown as ToleranceStackInput);
        return {capability:request.capability,provider:this.id,success:output.status==="VALID",output};
      }
      if(request.capability==="TOLERANCE.STACK_RSS"){
        const output=rssTolerance(request.input as unknown as ToleranceStackInput);
        return {capability:request.capability,provider:this.id,success:output.status==="VALID",output};
      }
      if(request.capability==="TOLERANCE.PARSE_CALLOUT"){
        const input=request.input as {callout:string;unit?:string};
        const output=parseToleranceCallout(input.callout,input.unit??"mm");
        return {capability:request.capability,provider:this.id,success:output.status==="PARSED",output};
      }
      if(request.capability==="TOLERANCE.ISO_286_CALLOUT"){
        const input=request.input as {nominal:number;unit:string;plus:number;minus:number;designation:string};
        const output=makeISO286FitCallout(input.nominal,input.unit,input.plus,input.minus,input.designation);
        return {capability:request.capability,provider:this.id,success:output.status==="PARSED",output};
      }
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported constraint/tolerance capability"};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
