import {CapabilityDefinition} from "../core/types.js";

export const V1_22_CAPABILITIES:CapabilityDefinition[]=[
  {id:"DIGITAL_THREAD.ADD_NODE",domain:"validation",purpose:"Register a typed engineering object in a project-scoped product model",inputs:["node"],outputs:["node"],risk:"LOW",providers:["product-model.core"],status:"PILOT"},
  {id:"DIGITAL_THREAD.ADD_TYPED_LINK",domain:"validation",purpose:"Add a project-scoped typed relationship with referential-integrity checks",inputs:["link"],outputs:["link"],risk:"MEDIUM",providers:["product-model.core"],status:"PILOT"},
  {id:"DIGITAL_THREAD.RECORD_DECISION",domain:"validation",purpose:"Persist a versioned engineering decision record linked to registered project objects",inputs:["decision"],outputs:["decision"],risk:"MEDIUM",providers:["product-model.core"],status:"PILOT"},
  {id:"DIGITAL_THREAD.GET_MODEL",domain:"validation",purpose:"Produce a validated project-scoped product-model snapshot",inputs:["projectId","revision"],outputs:["product_model"],risk:"MEDIUM",providers:["product-model.core"],status:"PILOT"}
];
