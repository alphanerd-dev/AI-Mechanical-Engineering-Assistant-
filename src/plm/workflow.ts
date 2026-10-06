import {PLMRevision,PLMRevisionStatus} from "./types.js";
import {validatePLMRevision} from "./validation.js";

const transitions:Record<PLMRevisionStatus,PLMRevisionStatus[]> = {
  DRAFT:["IN_REVIEW","REJECTED"],
  IN_REVIEW:["APPROVED","REJECTED"],
  APPROVED:["APPLIED"],
  REJECTED:[],
  APPLIED:[]
};

export function nextPLMRevisionVersion(baseVersion:string):string{
  const match=/^V(\d+)$/.exec(baseVersion.trim());
  if(!match) throw new Error(`PLM version must use V<number> format: ${baseVersion}.`);
  return `V${Number(match[1])+1}`;
}

export function transitionPLMRevision(revision:PLMRevision,target:PLMRevisionStatus):PLMRevision{
  const validation=validatePLMRevision(revision);
  if(!validation.valid) throw new Error(validation.errors.join(" "));
  if(target==="APPLIED"&&revision.status!=="APPROVED")
    throw new Error("A PLM revision must be approved before it can be applied.");
  if(!transitions[revision.status].includes(target))
    throw new Error(`Invalid PLM revision transition: ${revision.status} -> ${target}.`);
  const updatedAt=new Date().toISOString();
  return {...structuredClone(revision),status:target,updatedAt};
}
