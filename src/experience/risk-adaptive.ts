import {CapabilityRisk} from "../core/types.js";
import {
  EngineeringAmbiguity,
  EngineeringConsequence,
  EngineeringExperienceLevel,
  EngineeringExecutionPolicy,
  EngineeringIntentType,
  RiskAdaptiveExperienceDecision,
  RiskAdaptiveExperienceRequest
} from "./types.js";

const riskRank:Record<CapabilityRisk,number>={LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4};
const ambiguityRank:Record<EngineeringAmbiguity,number>={LOW:1,MEDIUM:2,HIGH:3};

function isConsequential(consequence:EngineeringConsequence):boolean{
  return consequence==="PROJECT_STATE"||consequence==="EXTERNAL_EFFECT"||consequence==="RELEASE";
}

function isExplicitlySafeToExplore(request:RiskAdaptiveExperienceRequest):boolean{
  return request.intent==="EXPLORE"&&
    request.consequence==="REVERSIBLE"&&
    riskRank[request.risk]<=2&&
    request.ambiguity!=="HIGH";
}

function levelFor(request:RiskAdaptiveExperienceRequest):EngineeringExperienceLevel{
  const missing=(request.missingInputs??[]).filter(Boolean);
  if(request.consequence==="RELEASE"||request.consequence==="EXTERNAL_EFFECT") return "EXPLICIT";
  if(request.risk==="CRITICAL") return "EXPLICIT";
  if(request.ambiguity==="HIGH") return "EXPLICIT";
  if(missing.length>0&&request.intent!=="EXPLORE") return "EXPLICIT";
  if(request.requestedExperience==="VERIFY") return "EXPLICIT";
  if(isExplicitlySafeToExplore(request)) return "FAST";
  if(request.intent==="DESIGN"||request.intent==="VERIFY") return "RIGOROUS";
  if(riskRank[request.risk]>=2) return "RIGOROUS";
  if(isConsequential(request.consequence)) return "RIGOROUS";
  return "FAST";
}

function executionPolicy(level:EngineeringExperienceLevel,request:RiskAdaptiveExperienceRequest):EngineeringExecutionPolicy{
  if(level==="EXPLICIT"){
    if(request.missingInputs&&request.missingInputs.length>0||request.ambiguity==="HIGH") return "ASK_MINIMUM";
    return "BLOCK";
  }
  return level==="RIGOROUS"?"AUTO_WITH_VALIDATION":"AUTO";
}

export function assessRiskAdaptiveExperience(
  request:RiskAdaptiveExperienceRequest
):RiskAdaptiveExperienceDecision{
  const missing=(request.missingInputs??[]).filter(item=>item.trim());
  const level=levelFor(request);
  const policy=executionPolicy(level,request);
  const approvalRequired=
    request.consequence==="RELEASE"||
    request.consequence==="EXTERNAL_EFFECT"||
    request.risk==="CRITICAL"||
    request.authorizationRequired===true;

  const reasons:string[]=[];
  if(level==="FAST"){
    reasons.push("The operation is reversible, low-consequence, and does not require engineering ceremony.");
  }
  if(level==="RIGOROUS"){
    reasons.push("The operation has enough engineering consequence to justify automatic validation and evidence.");
  }
  if(level==="EXPLICIT"){
    if(request.consequence==="RELEASE"||request.consequence==="EXTERNAL_EFFECT"){
      reasons.push("The action can affect an external or released engineering state.");
    }
    if(request.risk==="CRITICAL") reasons.push("Critical risk requires an explicit control point.");
    if(request.ambiguity==="HIGH") reasons.push("High ambiguity materially affects the engineering decision.");
    if(missing.length>0&&request.intent!=="EXPLORE"){
      reasons.push("A missing input materially affects the requested engineering result.");
    }
    if(request.requestedExperience==="VERIFY"){
      reasons.push("Verification intent explicitly raises the required rigor.");
    }
  }

  const nextQuestion=policy==="ASK_MINIMUM"?missing[0]:undefined;
  return {
    level,
    executionPolicy:policy,
    evidenceRequired:level!=="FAST",
    approvalRequired,
    nextQuestion,
    reasons:[...new Set(reasons)]
  };
}
