import {CapabilityRequest, CapabilityResult} from "../core/types.js";
import {CapabilityProvider} from "../capabilities/registry.js";

export interface OnshapeMcpExecutor {
  call(toolName:string, input:Record<string,unknown>):Promise<unknown>;
}

export type OnshapeProviderKind = "gpambrozio"|"casys";

const TOOL_MAP:Record<OnshapeProviderKind,Record<string,string>>={
  gpambrozio:{
    "CAD.CREATE_PART":"onshape_create_part",
    "CAD.CREATE_DRAWING":"onshape_create_drawing",
    "CAD.EXPORT_DRAWING":"onshape_export_drawing",
    "CAD.GET_DRAWING_VIEWS":"onshape_get_drawing_views"
  },
  casys:{
    "CAD.CREATE_PART":"onshape_part_create",
    "CAD.CREATE_DRAWING":"onshape_drawing_create",
    "CAD.EXPORT_DRAWING":"onshape_drawing_export",
    "CAD.GET_DRAWING_VIEWS":"onshape_drawing_views"
  }
};

export class OnshapeMcpProvider implements CapabilityProvider {
  readonly id:string;
  readonly capabilities=Object.keys(TOOL_MAP.gpambrozio);

  constructor(private readonly kind:OnshapeProviderKind, private readonly executor:OnshapeMcpExecutor){
    this.id=`onshape.${kind}`;
  }

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    const toolName=TOOL_MAP[this.kind][request.capability];
    if(!toolName) return {capability:request.capability,provider:this.id,success:false,error:"Unsupported Onshape capability"};
    try {
      const output=await this.executor.call(toolName,request.input);
      return {capability:request.capability,provider:this.id,success:true,output};
    } catch(error) {
      return {capability:request.capability,provider:this.id,success:false,error:String(error)};
    }
  }
}

export function getOnshapeToolName(kind:OnshapeProviderKind,capability:string){
  return TOOL_MAP[kind][capability];
}