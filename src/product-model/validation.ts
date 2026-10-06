import {ProductModelSnapshot,PRODUCT_MODEL_SCHEMA_VERSION} from "./types.js";

function nodeKey(kind:string,id:string){return kind+"::"+id;}

export interface ProductModelValidation{
  status:"PASS"|"INCOMPLETE"|"FAIL";
  errors:string[];
  warnings:string[];
}

export function validateProductModelSnapshot(snapshot:ProductModelSnapshot):ProductModelValidation{
  const errors:string[]=[];
  const warnings:string[]=[];

  if(snapshot.schemaVersion!==PRODUCT_MODEL_SCHEMA_VERSION)
    errors.push("Unsupported product-model schema version.");
  if(!snapshot.projectId.trim())errors.push("Product-model snapshot projectId is required.");
  if(!Number.isInteger(snapshot.revision)||snapshot.revision<1)errors.push("Product-model snapshot revision must be a positive integer.");
  if(Number.isNaN(Date.parse(snapshot.savedAt)))errors.push("Product-model snapshot savedAt must be a valid date string.");

  const nodes=new Map<string,string>();
  for(const node of snapshot.nodes){
    if(!node.projectId.trim())errors.push("Every product-model node requires a project id.");
    if(!node.ref.id.trim())errors.push("Every product-model node requires an id.");
    if(!node.name.trim())errors.push("Every product-model node requires a name.");
    const k=nodeKey(node.ref.kind,node.ref.id);
    if(nodes.has(k))errors.push("Duplicate product-model node: "+k+".");
    nodes.set(k,node.projectId);
    if(node.projectId!==snapshot.projectId)errors.push("Product-model node belongs to a different project: "+k+".");
  }

  const links=new Set<string>();
  for(const link of snapshot.links){
    if(links.has(link.id))errors.push("Duplicate product-model link: "+link.id+".");
    links.add(link.id);
    const fromProject=nodes.get(nodeKey(link.from.kind,link.from.id));
    const toProject=nodes.get(nodeKey(link.to.kind,link.to.id));
    if(!fromProject||!toProject)errors.push("Product-model link "+link.id+" references an unregistered node.");
    else if(fromProject!==link.projectId||toProject!==link.projectId)
      errors.push("Product-model link "+link.id+" crosses project boundaries.");
    if(nodeKey(link.from.kind,link.from.id)===nodeKey(link.to.kind,link.to.id))
      errors.push("Product-model link "+link.id+" is self-referential.");
    if(Number.isNaN(Date.parse(link.createdAt)))errors.push("Product-model link "+link.id+" has an invalid createdAt timestamp.");
  }

  for(const decision of snapshot.decisions){
    if(!decision.id.trim()||!decision.projectId.trim()||!decision.title.trim()||!decision.decision.trim()||!decision.rationale.trim())
      errors.push("Every decision requires id, project, title, decision, and rationale.");
    if(decision.projectId!==snapshot.projectId)errors.push("Decision "+decision.id+" belongs to a different project.");
    if(!Number.isInteger(decision.revision)||decision.revision<1)errors.push("Decision "+decision.id+" has an invalid revision.");
    for(const id of decision.requirementIds??[])
      if(!nodes.has(nodeKey("REQUIREMENT",id)))errors.push("Decision "+decision.id+" references missing requirement "+id+".");
    for(const id of decision.artifactIds??[])
      if(!nodes.has(nodeKey("ARTIFACT",id)))errors.push("Decision "+decision.id+" references missing artifact "+id+".");
    for(const id of decision.evidenceIds??[])
      if(!nodes.has(nodeKey("EVIDENCE",id)))errors.push("Decision "+decision.id+" references missing evidence "+id+".");
    if(decision.status==="APPROVED"&&(!decision.approvedBy?.trim()||!decision.approvedAt||Number.isNaN(Date.parse(decision.approvedAt)))
      )errors.push("Approved decision "+decision.id+" lacks valid approval metadata.");
  }

  if(snapshot.nodes.length===0)warnings.push("Product-model snapshot contains no nodes.");
  if(snapshot.links.length===0)warnings.push("Product-model snapshot contains no links.");
  if(snapshot.decisions.length===0)warnings.push("Product-model snapshot contains no decision records.");

  return {status:errors.length?"FAIL":"PASS",errors,warnings};
}
