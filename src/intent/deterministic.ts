import {EngineeringContext} from "../experience/context.js";
import {EngineeringIntentInterpreter,EngineeringIntentInterpretation} from "./types.js";
import {DeterministicShaftIntentInterpreter} from "./shaft.js";
import {DeterministicElectricalIntentInterpreter,isElectricalIntentCandidate} from "./electrical.js";

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
