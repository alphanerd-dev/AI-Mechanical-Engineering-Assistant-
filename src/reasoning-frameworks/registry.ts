import type {ReasoningFrameworkId,ReasoningFrameworkManifest,SkillManifest} from "./types.js";

export const REASONING_FRAMEWORKS:readonly ReasoningFrameworkManifest[]=[
 {schemaVersion:1,id:"first-principles",version:"1.0.0",name:"First-Principles Thinking",purpose:"Separate foundational facts, assumptions, and derived constraints.",suitableFor:["problem-framing","novel-design","constraint-analysis"],requiredInputs:["task"],outputKind:"REASONING_RECORD"},
 {schemaVersion:1,id:"weighted-decision-matrix",version:"1.0.0",name:"Weighted Decision Matrix",purpose:"Compare alternatives against explicit criteria while exposing uncertainty.",suitableFor:["option-selection","trade-study","architecture-decision"],requiredInputs:["alternatives","criteria"],outputKind:"REASONING_RECORD"},
 {schemaVersion:1,id:"five-whys",version:"1.0.0",name:"5 Whys",purpose:"Explore a possible causal chain; proposed causes require independent evidence.",suitableFor:["failure-analysis","problem-investigation","recurring-issue"],requiredInputs:["problem-statement"],outputKind:"REASONING_RECORD"}
];

function record(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function strings(value:unknown):value is string[]{return Array.isArray(value)&&value.every(v=>typeof v==="string");}
function nonempty(value:unknown):value is string{return typeof value==="string"&&value.trim().length>0;}

export function validateSkillManifest(value:unknown):string[]{
 if(!record(value))return ["Manifest must be an object."];
 const errors:string[]=[];
 for(const key of ["id","version","name","description"])if(!nonempty(value[key]))errors.push(key+" must be a non-empty string.");
 for(const key of ["domains","requiredInputs","outputs","allowedCapabilities"])if(!strings(value[key]))errors.push(key+" must be an array of strings.");
 if(value.schemaVersion!==1)errors.push("schemaVersion must be 1.");
 if(!["LOW","MEDIUM","HIGH","CRITICAL"].includes(String(value.maximumRisk)))errors.push("maximumRisk is invalid.");
 if(typeof value.requiresApproval!=="boolean")errors.push("requiresApproval must be boolean.");
 return errors;
}
export function validateFrameworkManifest(value:unknown):string[]{
 if(!record(value))return ["Manifest must be an object."];
 const errors:string[]=[];
 if(value.schemaVersion!==1)errors.push("schemaVersion must be 1.");
 if(!["first-principles","weighted-decision-matrix","five-whys"].includes(String(value.id)))errors.push("Unsupported framework id.");
 for(const key of ["version","name","purpose"])if(!nonempty(value[key]))errors.push(key+" must be a non-empty string.");
 if(!strings(value.suitableFor))errors.push("suitableFor must be an array of strings.");
 if(!strings(value.requiredInputs))errors.push("requiredInputs must be an array of strings.");
 if(value.outputKind!=="REASONING_RECORD")errors.push("outputKind must be REASONING_RECORD.");
 return errors;
}
export function registerSkillManifest(value:unknown):SkillManifest{
 const errors=validateSkillManifest(value);if(errors.length)throw new Error("Invalid skill manifest: "+errors.join(" "));
 return structuredClone(value) as SkillManifest;
}
export function registerFrameworkManifest(value:unknown):ReasoningFrameworkManifest{
 const errors=validateFrameworkManifest(value);if(errors.length)throw new Error("Invalid framework manifest: "+errors.join(" "));
 return structuredClone(value) as ReasoningFrameworkManifest;
}
export function getReasoningFramework(id:ReasoningFrameworkId){return REASONING_FRAMEWORKS.find(item=>item.id===id);}
