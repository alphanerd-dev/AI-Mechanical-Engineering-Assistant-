import {EngineeringContext} from "../experience/context";
import {EngineeringIntentInterpreter,EngineeringIntentInterpretation} from "./types";
import {DeterministicShaftIntentInterpreter} from "./shaft";
import {DeterministicElectricalIntentInterpreter,isElectricalIntentCandidate} from "./electrical";

export class DeterministicEngineeringIntentInterpreter implements EngineeringIntentInterpreter{
  constructor(
    private readonly shaft=new DeterministicShaftIntentInterpreter(),
    private readonly electrical=new DeterministicElectricalIntentInterpreter()
  ){}

  async interpret(raw:string,context?:EngineeringContext):Promise<EngineeringIntentInterpretation>{
    if(isElectricalIntentCandidate(raw,context)){
      return this.electrical.interpret(raw,context);
    }
    return this.shaft.interpret(raw,context);
  }
}

export function createDefaultDeterministicEngineeringIntentInterpreter():DeterministicEngineeringIntentInterpreter{
  return new DeterministicEngineeringIntentInterpreter();
}
