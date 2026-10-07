import {CapabilityRisk,EngineeringDomain} from "../core/types.js";

export interface EngineeringSpecialistProfile{
  id:string;
  name:string;
  mission:string;
  domains:readonly EngineeringDomain[];
  maxRisk:CapabilityRisk;
  capabilities?:readonly string[];
}

export const ENGINEERING_SPECIALISTS:readonly EngineeringSpecialistProfile[]=[
  {id:"requirements",name:"Requirements Specialist",mission:"Turn engineering goals into explicit requirements, constraints, assumptions, and traceability.",domains:["requirements"],maxRisk:"HIGH"},
  {id:"research",name:"Research Specialist",mission:"Gather and structure engineering evidence and source-backed technical knowledge.",domains:["research"],maxRisk:"HIGH"},
  {id:"computation",name:"Computation Specialist",mission:"Execute bounded numerical and unit-aware engineering calculations.",domains:["computation"],maxRisk:"HIGH"},
  {id:"analysis",name:"Analysis Specialist",mission:"Perform deterministic engineering analysis through registered analysis providers.",domains:["analysis","thermal","fluids"],maxRisk:"HIGH"},
  {id:"cad",name:"CAD Specialist",mission:"Create and inspect deterministic CAD through registered geometry/CAD providers.",domains:["cad"],maxRisk:"HIGH"},
  {id:"simulation",name:"Simulation Specialist",mission:"Run bounded system and physics simulation through registered providers.",domains:["simulation"],maxRisk:"HIGH"},
  {id:"dynamics",name:"Dynamics Specialist",mission:"Run bounded rigid-body and multibody dynamics through deterministic providers.",domains:["dynamics"],maxRisk:"HIGH"},
  {id:"robotics",name:"Robotics Specialist",mission:"Prepare and validate robotics assets and bounded runtime operations.",domains:["robotics","vision"],maxRisk:"HIGH"},
  {id:"manufacturing",name:"Manufacturing Specialist",mission:"Evaluate DFM, manufacturing plans, cost/time estimates, and process readiness.",domains:["manufacturing"],maxRisk:"HIGH"},
  {id:"validation",name:"Validation Specialist",mission:"Independently check engineering outputs against explicit requirements and evidence rules.",domains:["validation","materials"],maxRisk:"HIGH"},
  {id:"plm",name:"PLM Specialist",mission:"Maintain product structure, revisions, release state, and engineering records.",domains:["plm","ecad"],maxRisk:"HIGH"}
];

export function getEngineeringSpecialist(id:string):EngineeringSpecialistProfile|undefined{
  return ENGINEERING_SPECIALISTS.find(specialist=>specialist.id===id);
}

const riskRank:Record<CapabilityRisk,number>={LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4};

export function riskWithinSpecialistCeiling(taskRisk:CapabilityRisk,specialist:EngineeringSpecialistProfile):boolean{
  return riskRank[taskRisk]<=riskRank[specialist.maxRisk];
}
