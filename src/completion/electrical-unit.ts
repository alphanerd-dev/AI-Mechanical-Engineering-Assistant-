import {CapabilityRouter} from "../capabilities/router";
import {EngineeringCompletionUnit,EngineeringCompletionUnitRequest,EngineeringCompletionReport} from "./types";

export class DcLoadEngineeringCompletionUnit implements EngineeringCompletionUnit{
  id="ENGINEERING.COMPLETE_DC_LOAD";
  capability="ENGINEERING.COMPLETE_DC_LOAD";
  requiredInputs=[
    {key:"voltageV",label:"voltage"},
    {key:"currentA",label:"current"},
    {key:"maximumPowerW",label:"maximum allowable power"}
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
      throw new Error(result.error??"DC load completion unit returned no report.");
    }
    return result.output as EngineeringCompletionReport;
  }
}
