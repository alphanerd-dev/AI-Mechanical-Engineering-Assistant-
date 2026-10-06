import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {RoboticsProvider as RoboticsProviderContract} from "./contracts.js";
import {CADToRoboticsRequest,RoboticsAsset} from "../robotics/types.js";
import {validateRoboticsAsset} from "../robotics/validation.js";

export interface RoboticsAssetConverter{
  convertCAD(input:CADToRoboticsRequest):Promise<RoboticsAsset>;
}

export class RoboticsProvider implements RoboticsProviderContract{
  readonly id="robotics.asset";
  readonly capabilities=["ROBOTICS.CONVERT_CAD_ASSET","ROBOTICS.VALIDATE_ASSET"];
  readonly descriptor={
    id:this.id,
    domain:"robotics" as const,
    status:"PILOT" as const,
    version:"1.0",
    capabilities:this.capabilities,
    requires:["CAD conversion runtime or external robotics asset converter"]
  };

  constructor(private readonly converter:RoboticsAssetConverter){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability==="ROBOTICS.CONVERT_CAD_ASSET"){
      const input=request.input as unknown as CADToRoboticsRequest;
      if(!input.sourceArtifactId?.trim()) return {capability:request.capability,provider:this.id,success:false,error:"sourceArtifactId is required."};
      if(!input.targetFormat) return {capability:request.capability,provider:this.id,success:false,error:"targetFormat is required."};
      try{
        const asset=await this.converter.convertCAD(input);
        if(asset.sourceCadArtifactId!==input.sourceArtifactId)
          return {capability:request.capability,provider:this.id,success:false,error:"Converted robotics asset must preserve source CAD artifact lineage."};
        if(asset.format!==input.targetFormat)
          return {capability:request.capability,provider:this.id,success:false,error:"Converted robotics asset format does not match the requested target format."};
        const validation=validateRoboticsAsset(asset);
        if(!validation.valid)
          return {capability:request.capability,provider:this.id,success:false,error:validation.errors.join("; ")};
        return {capability:request.capability,provider:this.id,success:true,output:asset,artifactIds:[asset.id]};
      }catch(error){
        return {capability:request.capability,provider:this.id,success:false,error:String(error)};
      }
    }
    if(request.capability==="ROBOTICS.VALIDATE_ASSET"){
      const asset=request.input.asset as RoboticsAsset|undefined;
      if(!asset) return {capability:request.capability,provider:this.id,success:false,error:"A robotics asset is required."};
      const validation=validateRoboticsAsset(asset);
      return {capability:request.capability,provider:this.id,success:true,output:validation,artifactIds:[asset.id]};
    }
    return {capability:request.capability,provider:this.id,success:false,error:"Unsupported robotics capability."};
  }
}
