import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {ProjectState} from "../core/types.js";

export type EvidenceByProductValidation="PASS"|"FAIL"|"UNVALIDATED";

export interface EvidenceByProductDraft{
  id:string;
  type:EvidenceRecord["type"];
  claim:string;
  method?:string;
  value?:unknown;
  artifactIds?:string[];
  requirementIds?:string[];
}

export interface EvidenceByProductRequest{
  project:ProjectState;
  artifacts:EngineeringArtifact[];
  validation:EvidenceByProductValidation;
  drafts:EvidenceByProductDraft[];
  timestamp?:string;
}

export interface EvidenceByProductResult{
  emitted:boolean;
  evidence:EvidenceRecord[];
  artifacts:EngineeringArtifact[];
  reason:string;
}

function unique(values:string[]|undefined):string[]{
  return [...new Set(values??[])];
}

/**
 * Evidence is a by-product of validated deterministic engineering work.
 *
 * The producer fails closed: no VERIFIED evidence is emitted unless the
 * workflow validation gate passes and every referenced artifact/requirement
 * belongs to the supplied project context.
 */
export function produceEvidenceByProduct(
  request:EvidenceByProductRequest
):EvidenceByProductResult{
  if(request.validation!=="PASS"){
    return {
      emitted:false,
      evidence:[],
      artifacts:request.artifacts,
      reason:"Evidence is not emitted until the deterministic validation gate passes."
    };
  }

  if(request.drafts.length===0){
    return {
      emitted:false,
      evidence:[],
      artifacts:request.artifacts,
      reason:"No evidence drafts were supplied for the validated execution."
    };
  }

  const projectRequirementIds=new Set(request.project.requirements.map(requirement=>requirement.id));
  const artifactById=new Map(request.artifacts.map(artifact=>[artifact.id,artifact]));

  const draftIds=request.drafts.map(draft=>draft.id);
  if(new Set(draftIds).size!==draftIds.length){
    return {
      emitted:false,
      evidence:[],
      artifacts:request.artifacts,
      reason:"Evidence IDs must be unique."
    };
  }

  for(const draft of request.drafts){
    for(const artifactId of unique(draft.artifactIds)){
      const artifact=artifactById.get(artifactId);
      if(!artifact){
        return {
          emitted:false,
          evidence:[],
          artifacts:request.artifacts,
          reason:"Evidence references an artifact that is not part of the validated execution."
        };
      }
      if(artifact.validationStatus!=="PASS"){
        return {
          emitted:false,
          evidence:[],
          artifacts:request.artifacts,
          reason:"Evidence cannot be VERIFIED against an artifact that did not pass validation."
        };
      }
    }

    for(const requirementId of unique(draft.requirementIds)){
      if(!projectRequirementIds.has(requirementId)){
        return {
          emitted:false,
          evidence:[],
          artifacts:request.artifacts,
          reason:"Evidence references a requirement outside the project context."
        };
      }
    }
  }

  const timestamp=request.timestamp??new Date().toISOString();
  const evidence:EvidenceRecord[]=request.drafts.map(draft=>({
    id:draft.id,
    type:draft.type,
    claim:draft.claim,
    method:draft.method,
    value:draft.value,
    status:"VERIFIED",
    artifactIds:unique(draft.artifactIds),
    requirementIds:unique(draft.requirementIds),
    timestamp
  }));

  const artifacts=request.artifacts.map(artifact=>({
    ...artifact,
    evidenceIds:[...new Set([
      ...artifact.evidenceIds,
      ...evidence
        .filter(item=>item.artifactIds?.includes(artifact.id))
        .map(item=>item.id)
    ])]
  }));

  return {
    emitted:true,
    evidence,
    artifacts,
    reason:"Verified evidence was generated automatically from validated deterministic execution."
  };
}
