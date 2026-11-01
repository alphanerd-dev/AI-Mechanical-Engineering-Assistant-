import {CapabilityRouter} from "../capabilities/router";
import {EngineeringCompletionUnit,EngineeringCompletionUnitRequest,EngineeringCompletionReport} from "./types";

const LEGACY_REQUIRED_INPUTS=[
  {key:"powerKw",label:"power"},
  {key:"speedRpm",label:"speed"},
  {key:"bendingMomentNm",label:"bending moment"},
  {key:"allowableShearStressMpa",label:"allowable shear stress"},
  {key:"proposedDiameterMm",label:"proposed shaft diameter"}
];

const STATIC_REQUIRED_INPUTS=[
  {key:"powerKw",label:"power"},
  {key:"speedRpm",label:"speed"},
  {key:"bearingSpanMm",label:"bearing span"},
  {key:"gearPositionFromLeftMm",label:"gear position from the left bearing"},
  {key:"pitchDiameterMm",label:"gear pitch diameter"},
  {key:"pressureAngleDeg",label:"gear pressure angle"},
  {key:"materialGrade",label:"material grade"},
  {key:"yieldStrengthMpa",label:"yield strength Sy"},
  {key:"ultimateTensileStrengthMpa",label:"ultimate tensile strength Sut"},
  {key:"designFactor",label:"design factor"},
  {key:"axialLoadN",label:"axial load or explicit zero"},
  {key:"bendingStressFactorKb",label:"bending multiplier Kb"},
  {key:"torsionalStressFactorKts",label:"torsional multiplier Kts"}
];

export class ShaftEngineeringCompletionUnit implements EngineeringCompletionUnit{
  id="ENGINEERING.COMPLETE_SHAFT";
  capability="ENGINEERING.COMPLETE_SHAFT";
  requiredInputs=LEGACY_REQUIRED_INPUTS;

  getRequiredInputs(inputs:Record<string,number|string>){
    const usesGeometryBasedSizing =
      typeof inputs.bearingSpanMm==="number" &&
      typeof inputs.pitchDiameterMm==="number";
    return usesGeometryBasedSizing ? STATIC_REQUIRED_INPUTS : LEGACY_REQUIRED_INPUTS;
  }

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
        assumptions:request.assumptions??[],
        ...(request.approval?{approval:request.approval}:{})
      }
    });
    if(!result.output){
      throw new Error(result.error??"Completion unit returned no report.");
    }
    return result.output as EngineeringCompletionReport;
  }
}
