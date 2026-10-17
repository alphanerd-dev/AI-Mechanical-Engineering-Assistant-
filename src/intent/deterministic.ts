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
    const result=isThermalIntentCandidate(raw,context)
      ? await this.thermal.interpret(raw,context)
      : isElectricalIntentCandidate(raw,context)
        ? await this.electrical.interpret(raw,context)
        : await this.shaft.interpret(raw,context);
    return {...result,interpretationSource:"DETERMINISTIC"};
  }
}

export function createDefaultDeterministicEngineeringIntentInterpreter():DeterministicEngineeringIntentInterpreter{
  return new DeterministicEngineeringIntentInterpreter();
}
