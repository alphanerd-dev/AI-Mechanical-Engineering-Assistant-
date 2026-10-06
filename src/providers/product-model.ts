import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityProvider} from "../capabilities/registry.js";
import {ProductModelGraph} from "../product-model/graph.js";
import {EngineeringDecisionRecord,ProductModelLink,ProductModelNode,ProductModelNodeRef} from "../product-model/types.js";
import {validateProductModelSnapshot} from "../product-model/validation.js";

export class ProductModelProvider implements CapabilityProvider{
  readonly id="product-model.core";
  readonly capabilities=[
    "DIGITAL_THREAD.ADD_NODE",
    "DIGITAL_THREAD.ADD_TYPED_LINK",
    "DIGITAL_THREAD.RECORD_DECISION",
    "DIGITAL_THREAD.GET_MODEL"
  ];
  readonly graph=new ProductModelGraph();

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      if(request.capability==="DIGITAL_THREAD.ADD_NODE"){
        const node=request.input.node as ProductModelNode|undefined;
        if(!node)return {capability:request.capability,provider:this.id,success:false,error:"A product-model node is required."};
        return {capability:request.capability,provider:this.id,success:true,output:this.graph.registerNode(node)};
      }
      if(request.capability==="DIGITAL_THREAD.ADD_TYPED_LINK"){
        const link=request.input.link as ProductModelLink|undefined;
        if(!link)return {capability:request.capability,provider:this.id,success:false,error:"A typed product-model link is required."};
        return {capability:request.capability,provider:this.id,success:true,output:this.graph.addLink(link),evidenceIds:link.evidenceIds};
      }
      if(request.capability==="DIGITAL_THREAD.RECORD_DECISION"){
        const decision=request.input.decision as EngineeringDecisionRecord|undefined;
        if(!decision)return {capability:request.capability,provider:this.id,success:false,error:"An engineering decision record is required."};
        return {capability:request.capability,provider:this.id,success:true,output:this.graph.saveDecision(decision),evidenceIds:decision.evidenceIds};
      }
      if(request.capability==="DIGITAL_THREAD.GET_MODEL"){
        const projectId=typeof request.input.projectId==="string"?request.input.projectId:"";
        if(!projectId.trim())return {capability:request.capability,provider:this.id,success:false,error:"A project id is required."};
        const revision=Number(request.input.revision);
        if(!Number.isInteger(revision)||revision<1)return {capability:request.capability,provider:this.id,success:false,error:"A positive integer model revision is required."};
        const snapshot=this.graph.snapshot(projectId,revision,new Date().toISOString());
        const validation=validateProductModelSnapshot(snapshot);
        if(validation.status!=="PASS")
          return {capability:request.capability,provider:this.id,success:false,error:validation.errors.join(" ")};
        return {capability:request.capability,provider:this.id,success:true,output:snapshot};
      }
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported product-model capability."};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Product-model capability failed."};
    }
  }
}
