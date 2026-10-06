import {
  ProductModelLink,
  ProductModelNode,
  ProductModelNodeRef,
  ProductModelSnapshot,
  EngineeringDecisionRecord,
  PRODUCT_MODEL_SCHEMA_VERSION
} from "./types.js";

function key(ref:ProductModelNodeRef){return ref.kind+"::"+ref.id;}

function requireText(value:string,name:string){
  if(typeof value!=="string"||!value.trim())throw new Error(name+" is required.");
}

function clone<T>(value:T):T{return structuredClone(value);}

export class ProductModelGraph{
  private readonly nodes=new Map<string,ProductModelNode>();
  private readonly links=new Map<string,ProductModelLink>();
  private readonly decisions=new Map<string,EngineeringDecisionRecord>();

  registerNode(node:ProductModelNode):ProductModelNode{
    requireText(node.ref.id,"Product-model node id");
    requireText(node.projectId,"Product-model node project id");
    requireText(node.name,"Product-model node name");
    const nodeKey=key(node.ref);
    const existing=this.nodes.get(nodeKey);
    if(existing)throw new Error("Product-model node already exists: "+nodeKey+".");
    const stored=clone(node);
    this.nodes.set(nodeKey,stored);
    return clone(stored);
  }

  getNode(ref:ProductModelNodeRef):ProductModelNode|undefined{
    const node=this.nodes.get(key(ref));
    return node?clone(node):undefined;
  }

  allNodes():ProductModelNode[]{return [...this.nodes.values()].map(clone);}

  addLink(link:ProductModelLink):ProductModelLink{
    requireText(link.id,"Product-model link id");
    requireText(link.projectId,"Product-model link project id");
    requireText(link.createdAt,"Product-model link createdAt");
    if(key(link.from)===key(link.to))throw new Error("A product-model link cannot point to itself.");

    const from=this.nodes.get(key(link.from));
    const to=this.nodes.get(key(link.to));
    if(!from||!to)throw new Error("Product-model link references a node that is not registered.");
    if(from.projectId!==link.projectId||to.projectId!==link.projectId)
      throw new Error("Product-model link nodes must belong to the same project as the link.");
    if(this.links.has(link.id))throw new Error("Product-model link already exists: "+link.id+".");

    const stored=clone(link);
    this.links.set(stored.id,stored);
    return clone(stored);
  }

  allLinks():ProductModelLink[]{return [...this.links.values()].map(clone);}

  linksFor(ref:ProductModelNodeRef):ProductModelLink[]{
    return [...this.links.values()]
      .filter(link=>key(link.from)===key(ref)||key(link.to)===key(ref))
      .map(clone);
  }

  saveDecision(record:EngineeringDecisionRecord):EngineeringDecisionRecord{
    requireText(record.id,"Decision id");
    requireText(record.projectId,"Decision project id");
    requireText(record.title,"Decision title");
    requireText(record.decision,"Decision text");
    requireText(record.rationale,"Decision rationale");
    if(!Number.isInteger(record.revision)||record.revision<1)throw new Error("Decision revision must be a positive integer.");
    if(Number.isNaN(Date.parse(record.createdAt))||Number.isNaN(Date.parse(record.updatedAt)))
      throw new Error("Decision timestamps must be valid date strings.");

    for(const id of record.requirementIds??[])
      if(!this.nodes.has(key({kind:"REQUIREMENT",id})))throw new Error("Decision references missing requirement node: "+id+".");
    for(const id of record.artifactIds??[])
      if(!this.nodes.has(key({kind:"ARTIFACT",id})))throw new Error("Decision references missing artifact node: "+id+".");
    for(const id of record.evidenceIds??[])
      if(!this.nodes.has(key({kind:"EVIDENCE",id})))throw new Error("Decision references missing evidence node: "+id+".");

    const existing=this.decisions.get(record.id);
    if(existing){
      if(record.revision!==existing.revision+1)
        throw new Error("Decision revision must advance by one: "+record.id+".");
    }else if(record.revision!==1){
      throw new Error("New decisions must start at revision 1: "+record.id+".");
    }

    if(record.status==="APPROVED"){
      if(!record.approvedBy?.trim()||!record.approvedAt||Number.isNaN(Date.parse(record.approvedAt)))
        throw new Error("Approved decisions require explicit approval identity and timestamp.");
    }

    const stored=clone(record);
    this.decisions.set(stored.id,stored);
    return clone(stored);
  }

  getDecision(id:string):EngineeringDecisionRecord|undefined{
    const record=this.decisions.get(id);
    return record?clone(record):undefined;
  }

  allDecisions():EngineeringDecisionRecord[]{return [...this.decisions.values()].map(clone);}

  snapshot(projectId:string,revision:number,savedAt:string):ProductModelSnapshot{
    requireText(projectId,"Product-model snapshot project id");
    if(!Number.isInteger(revision)||revision<1)throw new Error("Product-model snapshot revision must be a positive integer.");
    if(Number.isNaN(Date.parse(savedAt)))throw new Error("Product-model snapshot savedAt must be a valid date string.");

    return clone({
      schemaVersion:PRODUCT_MODEL_SCHEMA_VERSION,
      projectId,
      revision,
      nodes:this.allNodes().filter(node=>node.projectId===projectId),
      links:this.allLinks().filter(link=>link.projectId===projectId),
      decisions:this.allDecisions().filter(record=>record.projectId===projectId),
      savedAt
    });
  }
}
