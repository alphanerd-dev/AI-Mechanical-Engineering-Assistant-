import {CapabilityDefinition} from "../core/types.js";

export const ENGINEERING_CAPABILITIES:CapabilityDefinition[]=[
  {id:"ANALYSIS.SHAFT_TORQUE",domain:"analysis",purpose:"Calculate transmitted shaft torque",inputs:["powerKw","speedRpm"],outputs:["torqueNm"],risk:"LOW",providers:["numerical-analysis"],status:"VERIFIED"},
  {id:"ANALYSIS.SHAFT_SIZE",domain:"analysis",purpose:"Preliminarily size a solid shaft",inputs:["powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa"],outputs:["minimumDiameterMm"],risk:"MEDIUM",providers:["numerical-analysis"],status:"PILOT"},
  {id:"ANALYSIS.STATIC_STRUCTURAL",domain:"simulation",purpose:"Run static structural FEA",inputs:["model","loads","constraints","mesh"],outputs:["stress","displacement","reaction_forces"],risk:"HIGH",providers:["ansys.pymechanical-worker","ansys.pymechanical"],status:"PILOT"},
  {id:"CAD.CREATE_PART",domain:"cad",purpose:"Create a parametric mechanical part",inputs:["parameters","geometry_program"],outputs:["cad_artifact"],risk:"MEDIUM",providers:["cad.build123d","cad.cadquery","cad.freecad","onshape.gpambrozio","onshape.casys"],status:"EXPERIMENTAL"},
  {id:"CAD.EXECUTE_GENERATED_SOURCE",domain:"cad",purpose:"Execute generated parametric CAD source in an isolated runtime",inputs:["source","backend"],outputs:["cad_artifact"],risk:"HIGH",providers:["cad.worker","cad.build123d","cad.cadquery"],status:"PILOT"},
  {id:"CAD.VALIDATE_GEOMETRY",domain:"cad",purpose:"Validate solid geometry and topology",inputs:["cad_artifact"],outputs:["geometry_validation"],risk:"MEDIUM",providers:["cad.occt","cad.freecad"],status:"EXPERIMENTAL"},
  {id:"CAD.EXPORT_STEP",domain:"cad",purpose:"Export a CAD artifact as STEP",inputs:["cad_artifact"],outputs:["step_artifact"],risk:"LOW",providers:["cad.occt","cad.build123d","cad.freecad","onshape.gpambrozio","onshape.casys"],status:"EXPERIMENTAL"},
  {id:"PLM.QUERY_ITEM",domain:"plm",purpose:"Query engineering item and lifecycle information",inputs:["itemId"],outputs:["plm_item"],risk:"LOW",providers:["plm.odooplm"],status:"EXPERIMENTAL"},
  {id:"PLM.CREATE_REVISION",domain:"plm",purpose:"Create or prepare an engineering revision",inputs:["itemId","changeDescription"],outputs:["revision"],risk:"HIGH",providers:["plm.odooplm"],status:"EXPERIMENTAL"}
];
