import {CapabilityRouter} from "../capabilities/router";
import {EngineeringCompletionUnit,EngineeringCompletionUnitRequest,EngineeringCompletionReport} from "./types";

export class ShaftEngineeringCompletionUnit implements EngineeringCompletionUnit{
  id="ENGINEERING.COMPLETE_SHAFT";
  capability="ENGINEERING.COMPLETE_SHAFT";
  requiredInputs=[
    {key:"powerKw",label:"power"},
    {key:"speedRpm",label:"speed"},
    {key:"bendingMomentNm",label:"bending moment"},
    {key:"allowableShearStressMpa",label:"allowable shear stress"},
    {key:"proposedDiameterMm",label:"proposed shaft diameter"}
  ];

  async execute(
    request:EngineeringCompletionUnitRequest,
    router:CapabilityRouter
  ):Promise<EngineeringCompletionReport>{
    const result=await router.execute({
      capability:this.capability,
      risk:"HIGH",
      input:{
        projectId:request.projectId,
        ...request.inputs,
        ...(request.approval?{approval:request.approval}:{})
      }
    });
    if(!result.output){
      throw new Error(result.error??"Completion unit returned no report.");
    }
    return result.output as EngineeringCompletionReport;
  }
}
