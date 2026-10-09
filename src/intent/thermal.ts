import { EngineeringContext } from "../experience/context.js";
import { EngineeringIntentInterpreter, EngineeringIntentInterpretation } from "./types.js";

function numberAfter(pattern: RegExp, raw: string): number | undefined {
  const match = raw.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function contextNumber(context: EngineeringContext | undefined, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = context?.knownInputs?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function isThermalIntentCandidate(raw: string, context?: EngineeringContext): boolean {
  const text = raw.toLowerCase();
  const explicitThermalLanguage = /\b(?:thermal|thermodynamic|sensible heating|heating duty|heat duty|heat load)\b/.test(text);
  const contextHasThermalInputs = [
    "massFlowKgPerS",
    "specificHeatJPerKgK",
    "inletTemperatureC",
    "outletTemperatureC",
    "maximumHeatDutyKw"
  ].some((key) => typeof context?.knownInputs?.[key] === "number");
  return explicitThermalLanguage || contextHasThermalInputs;
}

export class DeterministicThermalIntentInterpreter implements EngineeringIntentInterpreter {
  async interpret(raw: string, context?: EngineeringContext): Promise<EngineeringIntentInterpretation> {
    const text = raw.trim();
    const massFlowKgPerS =
      numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*kg\s*\/\s*s\b/i, text) ??
      contextNumber(context, ["massFlowKgPerS", "massFlow"]);
    const specificHeatJPerKgK =
      numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*J\s*\/\s*kg\s*(?:\/\s*K|K)\b/i, text) ??
      contextNumber(context, ["specificHeatJPerKgK", "specificHeat"]);
    const inletTemperatureC =
      numberAfter(/\binlet(?:\s+temperature)?(?:\s*(?:is|of|=|:))?\s*(-?[0-9]+(?:\.[0-9]+)?)\s*(?:°\s*)?C\b/i, text) ??
      contextNumber(context, ["inletTemperatureC", "inletTemperature"]);
    const outletTemperatureC =
      numberAfter(/\b(?:outlet|target outlet)(?:\s+temperature)?(?:\s*(?:is|of|=|:))?\s*(-?[0-9]+(?:\.[0-9]+)?)\s*(?:°\s*)?C\b/i, text) ??
      contextNumber(context, ["outletTemperatureC", "outletTemperature"]);
    const maximumHeatDutyKw =
      numberAfter(/maximum(?:\s+allowable)?\s+(?:heat\s+duty|thermal\s+load)(?:\s+(?:is|of|=|:))?\s*([0-9]+(?:\.[0-9]+)?)\s*kW\b/i, text) ??
      contextNumber(context, ["maximumHeatDutyKw", "maxHeatDutyKw"]);

    const extractedInputs: Record<string, number | string> = {};
    if (massFlowKgPerS !== undefined) extractedInputs.massFlowKgPerS = massFlowKgPerS;
    if (specificHeatJPerKgK !== undefined) extractedInputs.specificHeatJPerKgK = specificHeatJPerKgK;
    if (inletTemperatureC !== undefined) extractedInputs.inletTemperatureC = inletTemperatureC;
    if (outletTemperatureC !== undefined) extractedInputs.outletTemperatureC = outletTemperatureC;
    if (maximumHeatDutyKw !== undefined) extractedInputs.maximumHeatDutyKw = maximumHeatDutyKw;

    const missingInputs: string[] = [];
    if (massFlowKgPerS === undefined) missingInputs.push("mass flow rate");
    if (specificHeatJPerKgK === undefined) missingInputs.push("specific heat capacity");
    if (inletTemperatureC === undefined) missingInputs.push("inlet temperature");
    if (outletTemperatureC === undefined) missingInputs.push("outlet temperature");
    if (maximumHeatDutyKw === undefined) missingInputs.push("maximum heat duty");

    const contextUsed = Object.entries(extractedInputs)
      .filter(([key, value]) => !new RegExp(String(value), "i").test(text))
      .map(([key]) => key);
    const candidate = isThermalIntentCandidate(text, context);
    const hasAction = /\b(?:calculate|check|verify|determine|estimate|design|evaluate)\b/i.test(text);
    const completionUnit = candidate && hasAction ? "ENGINEERING.COMPLETE_SENSIBLE_HEATING" : undefined;
    const ambiguity = missingInputs.length === 0 ? "LOW" : missingInputs.length <= 2 ? "MEDIUM" : "HIGH";
    const confidence = completionUnit && missingInputs.length === 0 ? "HIGH" : completionUnit ? "MEDIUM" : "LOW";

    return {
      raw: text,
      goal: candidate ? "sensible heating duty" : "engineering task",
      completionUnit,
      extractedInputs,
      missingInputs,
      confidence,
      ambiguity,
      contextUsed: [...new Set(contextUsed)],
      assumptions: [
        "Single-phase steady-state heating with explicitly supplied constant specific heat."
      ]
    };
  }
}
