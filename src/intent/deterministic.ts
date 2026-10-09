import {EngineeringContext} from "../experience/context";
import {EngineeringIntentInterpreter,EngineeringIntentInterpretation} from "./types";
import {DeterministicShaftIntentInterpreter} from "./shaft";
import {DeterministicElectricalIntentInterpreter,isElectricalIntentCandidate} from "./electrical";
import {DeterministicThermalIntentInterpreter,isThermalIntentCandidate} from "./thermal";

export class DeterministicEngineeringIntentInterpreter implements EngineeringIntentInterpreter{
  constructor(
    private readonly shaft=new DeterministicShaftIntentInterpreter(),
    private readonly electrical=new DeterministicElectricalIntentInterpreter(),
    private readonly thermal=new DeterministicThermalIntentInterpreter()
  ){}

  async interpret(raw:string,context?:EngineeringContext):Promise<EngineeringIntentInterpretation>{
    if(isThermalIntentCandidate(raw,context)){
      return this.thermal.interpret(raw,context);
    }
    if(isElectricalIntentCandidate(raw,context)){
      return this.electrical.interpret(raw,context);
    }
    return this.shaft.interpret(raw,context);
  }
}

export function createDefaultDeterministicEngineeringIntentInterpreter():DeterministicEngineeringIntentInterpreter{
  return new DeterministicEngineeringIntentInterpreter();
}
