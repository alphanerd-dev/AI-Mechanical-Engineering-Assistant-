import {RiskAdaptiveExperienceRequest} from "./types.js";

export interface EngineeringContext{
  knownInputs?:Readonly<Record<string,unknown>>;
  projectId?:string;
  projectStage?:string;
  recentArtifacts?:readonly string[];
  recentEvidence?:readonly string[];
}

export interface ContextAwareExperienceRequest extends RiskAdaptiveExperienceRequest{
  context?:EngineeringContext;
}

export interface ContextAwareExperienceDecision{
  contextUsed:string[];
  missingInputs:string[];
  effectiveRequest:RiskAdaptiveExperienceRequest;
}

export function resolveEngineeringContext(
  request:ContextAwareExperienceRequest
):ContextAwareExperienceDecision{
  const known=request.context?.knownInputs??{};
  const suppliedMissing=[...(request.missingInputs??[])];
  const missingInputs=suppliedMissing.filter(name=>known[name]===undefined);
  const contextUsed=Object.keys(known).filter(name=>!missingInputs.includes(name));
  return {
    contextUsed,
    missingInputs,
    effectiveRequest:{...request,missingInputs}
  };
}
