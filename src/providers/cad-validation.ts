import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";

export interface GeometryValidator {
  validate(input:Record<string,unknown>):Promise<unknown>;
}

export class CADValidationProvider implements CapabilityProvider {
  readonly id:string;
  readonly capabilities=["CAD.VALIDATE_GEOMETRY"];
  constructor(private readonly backend:string,private readonly validator:GeometryValidator){
    this.id=`cad.${backend}`;
  }
  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="CAD.VALIDATE_GEOMETRY")
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported geometry validation capability"};
    try {
      return {capability:request.capability,provider:this.id,success:true,
        output:await this.validator.validate(request.input)};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}
