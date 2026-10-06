import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {ProjectState} from "../core/types.js";
import {RequirementTraceability} from "../requirements/traceability.js";
import {EngineeringVerificationEngine} from "./engine.js";
import {VerificationPlan,VerificationPlanResult} from "./types.js";

function dependencyIsSatisfied(
  dependencyId:string,
  project:ProjectState|undefined,
  evidence:EvidenceRecord[]
):boolean{
  if(!project) return false;
  const requirement=project.requirements.find(item=>item.id===dependencyId);
  if(!requirement||requirement.status!=="SATISFIED") return false;
  const projectEvidenceIds=new Set(project.evidenceIds??[]);
  return evidence.some(
    item=>item.status==="VERIFIED"&&
      item.requirementIds?.includes(dependencyId)&&
      projectEvidenceIds.has(item.id)
  );
}

export async function executeVerificationPlan(
  plan:VerificationPlan,
  evidence:EvidenceRecord[],
  project?:ProjectState,
  traceability?:RequirementTraceability
):Promise<VerificationPlanResult>{
  const result=await new EngineeringVerificationEngine().verify({
    requirementId:plan.requirementId,
    evidence,
    minimumEvidence:plan.minimumTotalEvidence,
    gates:plan.gates
  });

  const dependencyRequirementIds=plan.dependencyRequirementIds??[];
  const blockedDependencyIds=dependencyRequirementIds.filter(dependencyId=>{
    if(dependencyId===plan.requirementId) return true;
    if(!dependencyIsSatisfied(dependencyId,project,evidence)) return true;
    if(!traceability) return false;
    return !traceability.tracesFor(plan.requirementId).some(trace=>
      trace.fromId===dependencyId &&
      trace.toId===plan.requirementId &&
      trace.relation==="CONSTRAINS"
    );
  });

  const approvalRequired=plan.approvalRequired??false;
  const approvalGranted=plan.approvalGranted??false;
  const blockedByApproval=approvalRequired&&!approvalGranted;
  const status=blockedDependencyIds.length>0||blockedByApproval
    ?"INCOMPLETE"
    :result.status;

  const reason=blockedDependencyIds.length>0
    ?"Verification is blocked by unmet, self-referential, untraced, or project-unverified requirement dependencies: "+blockedDependencyIds.join(", ")+"."
    :blockedByApproval
      ?"Verification requires explicit human approval before it can PASS."
      :result.reason;

  return {
    ...result,
    status,
    reason,
    planId:plan.id,
    approvalRequired,
    requiredMethods:plan.requiredMethods??[],
    acceptanceCriteria:plan.acceptanceCriteria??[],
    dependencies:plan.dependencies??[],
    dependencyRequirementIds,
    blockedDependencyIds
  };
}
