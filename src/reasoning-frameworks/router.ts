import type {FrameworkRoutingDecision,FrameworkRoutingRequest,ReasoningFrameworkId} from "./types.js";
import {getReasoningFramework} from "./registry.js";

/** Selects a reasoning method only; it never executes engineering capabilities or verifies results. */
export function routeReasoningFramework(request:FrameworkRoutingRequest):FrameworkRoutingDecision{
 const candidates:ReasoningFrameworkId[]=request.requestedFramework?[request.requestedFramework]:infer(request.taskType,request.uncertainty,request.risk);
 if(!candidates.length)return {status:"SKIPPED",reasons:["No material benefit from framework overhead was identified."],missingInputs:[]};
 const id=candidates[0],manifest=getReasoningFramework(id);
 if(!manifest)return {status:"BLOCKED",reasons:["Unsupported reasoning framework."],missingInputs:[]};
 const missingInputs=manifest.requiredInputs.filter(input=>!request.availableInputs.includes(input));
 if(missingInputs.length)return {status:"BLOCKED",frameworkId:id,reasons:["Required inputs are missing; do not invent them."],missingInputs};
 return {status:"SELECTED",frameworkId:id,reasons:[request.risk==="HIGH"||request.risk==="CRITICAL"?"High-risk context: existing validation and approval gates remain mandatory.":"Output is a reasoning record, not verified evidence."],missingInputs:[]};
}
function infer(type:string,uncertainty:FrameworkRoutingRequest["uncertainty"],risk:FrameworkRoutingRequest["risk"]):ReasoningFrameworkId[]{
 const t=type.toLowerCase();
 if(/failure|root-cause|incident|recurring-issue/.test(t))return ["five-whys"];
 if(/trade-study|option-selection|architecture-decision/.test(t))return ["weighted-decision-matrix"];
 if(/novel-design|constraint-analysis|problem-framing/.test(t))return ["first-principles"];
 if(uncertainty==="HIGH"||risk==="HIGH"||risk==="CRITICAL")return ["first-principles"];
 return [];
}
