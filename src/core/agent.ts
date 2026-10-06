import {EngineeringIntent, ProjectState, CapabilityRequest} from "./types";
import {createProject,recordEvent} from "../state/project";
import {shaftTorque} from "../engineering/calculations";
import {CapabilityRouter} from "../capabilities/router";

export class EngineeringAgent {
  constructor(private router:CapabilityRouter){}
  understand(raw:string):EngineeringIntent{
    const m=raw.match(/(\d+(?:\.\d+)?)\s*kW/i), s=raw.match(/(\d+(?:\.\d+)?)\s*rpm/i);
    const knownInputs:Record<string,number|string>={};
    if(m) knownInputs.powerKw=Number(m[1]);
    if(s) knownInputs.speedRpm=Number(s[1]);
    const missingInputs=["shaft length","loading arrangement","material","allowable stress","safety factor","fatigue requirement","key/coupling","bearing arrangement"];
    return {raw,goal:"shaft design",knownInputs,missingInputs,
      requestedCapabilities:["ANALYSIS.SHAFT_TORQUE","CAD.CREATE_PART"]};
  }
  start(raw:string):{project:ProjectState;intent:EngineeringIntent;torque?:ReturnType<typeof shaftTorque>}{    
    const intent=this.understand(raw), project=createProject(intent.goal);
    if(intent.knownInputs.powerKw && intent.knownInputs.speedRpm){
      const torque=shaftTorque(Number(intent.knownInputs.powerKw),Number(intent.knownInputs.speedRpm));
      project.stage="PRELIMINARY_ANALYSIS";
      project.openQuestions=[...intent.missingInputs];
      project.nextAction="Resolve critical shaft loading, material and safety-factor requirements before sizing.";
      recordEvent(project,{actor:"EngineeringAgent",action:"SHAFT_TORQUE_CALCULATED",input:intent.knownInputs,output:torque});
      return {project,intent,torque};
    }
    project.openQuestions=intent.missingInputs;
    return {project,intent};
  }

  async executeCapability(request:CapabilityRequest){
    const result=await this.router.execute(request);
    return result;
  }
}
