import {CapabilityDefinition} from "../core/types.js";

export const V1_21_CAPABILITIES:CapabilityDefinition[]=[
  {id:"MANUFACTURING.CHECK_DFM",domain:"manufacturing",purpose:"Evaluate measured CAD geometry against explicit manufacturing-process DFM rules",inputs:["metrics","rules","process"],outputs:["dfm_result"],risk:"MEDIUM",providers:["manufacturing.intelligence"],status:"PILOT"},
  {id:"MANUFACTURING.ESTIMATE_ECONOMICS",domain:"manufacturing",purpose:"Estimate manufacturing material usage, time, machine cost, labor cost, and total cost from explicit inputs",inputs:["currency","material","operations"],outputs:["estimate"],risk:"MEDIUM",providers:["manufacturing.intelligence"],status:"EXPERIMENTAL"},
  {id:"MANUFACTURING.GENERATE_BOM",domain:"manufacturing",purpose:"Generate and structurally validate a deterministic manufacturing bill of materials",inputs:["id","projectId","revision","components"],outputs:["bom"],risk:"LOW",providers:["manufacturing.intelligence"],status:"PILOT"},
  {id:"MANUFACTURING.PREPARE_RELEASE",domain:"manufacturing",purpose:"Evaluate manufacturing process plan, BOM, artifact linkage, and explicit human approval before release",inputs:["releaseId","processPlan","bom","requiredArtifactIds","approval"],outputs:["release_status"],risk:"HIGH",providers:["manufacturing.intelligence"],status:"EXPERIMENTAL"},
  {id:"MANUFACTURING.CAM_PLAN",domain:"manufacturing",purpose:"Plan a CAM or additive slicing operation through an explicit provider boundary without claiming an unconfigured toolpath runtime",inputs:["partArtifactId","process","operationIds","parameters"],outputs:["cam_plan"],risk:"HIGH",providers:["cam.boundary"],status:"EXPERIMENTAL"}
];
