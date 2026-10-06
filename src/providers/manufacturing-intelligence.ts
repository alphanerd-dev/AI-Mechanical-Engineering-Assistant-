import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringProvider,ProviderDescriptor} from "./contracts.js";
import {evaluateManufacturingDFM} from "../manufacturing/dfm.js";
import {estimateManufacturingEconomics} from "../manufacturing/estimation.js";
import {generateManufacturingBOM} from "../manufacturing/bom.js";
import {prepareManufacturingRelease} from "../manufacturing/release.js";

export class ManufacturingIntelligenceProvider implements EngineeringProvider{
  readonly id="manufacturing.intelligence";
  readonly capabilities=[
    "MANUFACTURING.CHECK_DFM",
    "MANUFACTURING.ESTIMATE_ECONOMICS",
    "MANUFACTURING.GENERATE_BOM",
    "MANUFACTURING.PREPARE_RELEASE"
  ];
  readonly descriptor:ProviderDescriptor={
    id:this.id,
    domain:"manufacturing",
    status:"PILOT",
    capabilities:this.capabilities,
    version:"1.0"
  };

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      switch(request.capability){
        case "MANUFACTURING.CHECK_DFM":
          return {capability:request.capability,provider:this.id,success:true,output:evaluateManufacturingDFM(request.input as any)};
        case "MANUFACTURING.ESTIMATE_ECONOMICS":
          return {capability:request.capability,provider:this.id,success:true,output:estimateManufacturingEconomics(request.input as any)};
        case "MANUFACTURING.GENERATE_BOM":{
          const input=request.input as any;
          const output=generateManufacturingBOM(input.id,input.projectId,input.revision,input.components);
          return {capability:request.capability,provider:this.id,success:output.status==="GENERATED",output};
        }
        case "MANUFACTURING.PREPARE_RELEASE":{
          const output=prepareManufacturingRelease(request.input as any);
          return {capability:request.capability,provider:this.id,success:output.status!=="BLOCKED",output};
        }
        default:
          return {capability:request.capability,provider:this.id,success:false,error:"Unsupported manufacturing intelligence capability"};
      }
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Manufacturing intelligence failed"};
    }
  }
}
