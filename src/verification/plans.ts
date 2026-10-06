import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {EngineeringVerificationEngine} from "./engine.js";
import {VerificationPlan,VerificationPlanResult} from "./types.js";

export async function executeVerificationPlan(
  plan:VerificationPlan,
  evidence:EvidenceRecord[]
):Promise<VerificationPlanResult>{
  const result=await new EngineeringVerificationEngine().verify({
    requirementId:plan.requirementId,
    evidence,
    minimumEvidence:plan.minimumTotalEvidence,
    gates:plan.gates
  });

  return {
    ...result,
    planId:plan.id,
    approvalRequired:plan.approvalRequired??false,
    requiredMethods:plan.requiredMethods??[],
    acceptanceCriteria:plan.acceptanceCriteria??[],
    dependencies:plan.dependencies??[]
  };
}
