import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {RoboticsAsset} from "../robotics/types.js";
import {validateRoboticsRuntimeAsset,RoboticsRuntimeHandle,RoboticsRuntimeLoader} from "../robotics/runtime.js";

export class RoboticsRuntimeProvider implements EngineeringProvider{
  readonly id="robotics.runtime";
  readonly capabilities=["ROBOTICS.LOAD_ASSET_RUNTIME"];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"robotics",
    status:"EXPERIMENTAL",
    capabilities:this.capabilities,
    version:"1.0",
    requires:["configured robotics simulation runtime"]
  };

  constructor(private readonly loader:RoboticsRuntimeLoader){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ROBOTICS.LOAD_ASSET_RUNTIME")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported robotics runtime capability."};

    const asset=request.input.asset as RoboticsAsset|undefined;
    if(!asset)
      return {capability:request.capability,provider:this.id,success:false,error:"A robotics asset is required."};

    const validation=validateRoboticsRuntimeAsset(asset);
    if(!validation.valid)
      return {capability:request.capability,provider:this.id,success:false,error:validation.errors.join("; ")};

    try{
      const handle=await this.loader.load(asset);
      if(!handle||handle.assetId!==asset.id||!handle.runtime.trim()||!handle.handle.trim())
        return {capability:request.capability,provider:this.id,success:false,error:"Robotics runtime loader returned an invalid handle."};

      return {capability:request.capability,provider:this.id,success:true,output:handle as RoboticsRuntimeHandle};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Robotics runtime loading failed."};
    }
  }
}
