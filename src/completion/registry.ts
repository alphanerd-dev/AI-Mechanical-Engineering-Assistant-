import {EngineeringCompletionUnit} from "./types";
import {ShaftEngineeringCompletionUnit} from "./shaft-unit";
import {DcLoadEngineeringCompletionUnit} from "./electrical-unit";

export class EngineeringCompletionUnitRegistry{
  private readonly units=new Map<string,EngineeringCompletionUnit>();

  register(unit:EngineeringCompletionUnit):void{
    if(this.units.has(unit.id)) throw new Error(`Completion unit already registered: ${unit.id}`);
    this.units.set(unit.id,unit);
  }

  resolve(id:string):EngineeringCompletionUnit|undefined{
    return this.units.get(id);
  }

  list():EngineeringCompletionUnit[]{
    return [...this.units.values()];
  }
}

export function createDefaultEngineeringCompletionUnitRegistry():EngineeringCompletionUnitRegistry{
  const registry=new EngineeringCompletionUnitRegistry();
  registry.register(new ShaftEngineeringCompletionUnit());
  registry.register(new DcLoadEngineeringCompletionUnit());
  return registry;
}
