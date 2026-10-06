import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {PLMProvider,ProviderDescriptor} from "./contracts.js";
import {analyzePLMChangeImpact} from "../plm/impact.js";
import {PLMChangeRequest,PLMItem,PLMRevision,PLMRevisionRequest} from "../plm/types.js";
import {nextPLMRevisionVersion} from "../plm/workflow.js";
import {validatePLMItem,validatePLMRevision} from "../plm/validation.js";

export interface OdooPLMClient{
  queryItem(itemId:string):Promise<PLMItem|undefined>;
  createRevision(request:PLMRevisionRequest):Promise<PLMRevision>;
}

export class OdooPLMProvider implements PLMProvider{
  readonly id="plm.odooplm";
  readonly capabilities=["PLM.QUERY_ITEM","PLM.CREATE_REVISION","PLM.ANALYZE_CHANGE_IMPACT"];
  readonly descriptor:ProviderDescriptor&{domain:"plm"}={
    id:this.id,
    domain:"plm",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"1.0"
  };

  constructor(private readonly client:OdooPLMClient){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      if(request.capability==="PLM.QUERY_ITEM"){
        const itemId=typeof request.input.itemId==="string"?request.input.itemId:"";
        if(!itemId.trim()) return {capability:request.capability,provider:this.id,success:false,error:"A PLM item id is required."};
        const item=await this.client.queryItem(itemId);
        if(!item) return {capability:request.capability,provider:this.id,success:false,error:`PLM item not found: ${itemId}.`};
        const validation=validatePLMItem(item);
        if(!validation.valid) return {capability:request.capability,provider:this.id,success:false,error:validation.errors.join(" ")};
        return {capability:request.capability,provider:this.id,success:true,output:item};
      }

      if(request.capability==="PLM.CREATE_REVISION"){
        const itemId=typeof request.input.itemId==="string"?request.input.itemId:"";
        const changeDescription=typeof request.input.changeDescription==="string"?request.input.changeDescription:"";
        if(!itemId.trim()) return {capability:request.capability,provider:this.id,success:false,error:"A PLM item id is required."};
        if(!changeDescription.trim()) return {capability:request.capability,provider:this.id,success:false,error:"A PLM change description is required."};
        const item=await this.client.queryItem(itemId);
        if(!item) return {capability:request.capability,provider:this.id,success:false,error:`PLM item not found: ${itemId}.`};
        const itemValidation=validatePLMItem(item);
        if(!itemValidation.valid) return {capability:request.capability,provider:this.id,success:false,error:itemValidation.errors.join(" ")};
        const revision=await this.client.createRevision({
          itemId,
          projectId:typeof request.input.projectId==="string"?request.input.projectId:undefined,
          changeDescription,
          changes:Array.isArray(request.input.changes)?request.input.changes as PLMRevisionRequest["changes"]:undefined
        });
        const revisionValidation=validatePLMRevision(revision);
        if(!revisionValidation.valid) return {capability:request.capability,provider:this.id,success:false,error:revisionValidation.errors.join(" ")};
        if(revision.itemId!==item.id) return {capability:request.capability,provider:this.id,success:false,error:"Odoo PLM revision item does not match the requested item."};
        if(revision.baseVersion!==item.version) return {capability:request.capability,provider:this.id,success:false,error:"Odoo PLM revision base version does not match the current item version."};
        if(revision.version!==nextPLMRevisionVersion(item.version))
          return {capability:request.capability,provider:this.id,success:false,error:"Odoo PLM revision version is not the next expected revision."};
        return {capability:request.capability,provider:this.id,success:true,output:revision};
      }

      if(request.capability==="PLM.ANALYZE_CHANGE_IMPACT"){
        const changeRequest=request.input.changeRequest;
        const items=request.input.items;
        if(!changeRequest||typeof changeRequest!=="object") return {capability:request.capability,provider:this.id,success:false,error:"A PLM change request is required."};
        if(!Array.isArray(items)) return {capability:request.capability,provider:this.id,success:false,error:"A PLM item array is required for impact analysis."};
        const output=analyzePLMChangeImpact(changeRequest as PLMChangeRequest,items as PLMItem[]);
        return {capability:request.capability,provider:this.id,success:true,output};
      }

      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported PLM capability."};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"PLM capability failed."};
    }
  }
}
