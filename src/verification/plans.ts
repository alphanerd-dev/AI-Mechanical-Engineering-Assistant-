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

  const dependencyRequirementIds=plan.dependencyRequirementIds??[];
  const blockedDependencyIds=dependencyRequirementIds.filter(
    dependencyId=>!evidence.some(
      item=>item.status==="VERIFIED"&&item.requirementIds?.includes(dependencyId)
    )
  );

  const status=blockedDependencyIds.length>0
    ?"INCOMPLETE"
    :result.status;

  const reason=blockedDependencyIds.length>0
    ?"Verification is blocked by unmet requirement dependencies: "+blockedDependencyIds.join(", ")+"."
    :result.reason;

  return {
    ...result,
    status,
    reason,
    planId:plan.id,
    approvalRequired:plan.approvalRequired??false,
    requiredMethods:plan.requiredMethods??[],
    acceptanceCriteria:plan.acceptanceCriteria??[],
    dependencies:plan.dependencies??[],
    dependencyRequirementIds,
    blockedDependencyIds
  };
}
