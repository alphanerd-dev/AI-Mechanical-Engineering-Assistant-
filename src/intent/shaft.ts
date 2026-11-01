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

function contextString(context: EngineeringContext | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = context?.knownInputs?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function parseMaterialGrade(text: string, context: EngineeringContext | undefined): string | undefined {
  const match = text.match(/\b(AISI\s*\d{3,5}(?:\s+(?:annealed|normalized|quenched\s+and\s+tempered|Q&T))?)/i);
  return match?.[1].replace(/\s+/g, " ").trim() ?? contextString(context, ["materialGrade", "material"]);
}

function parseDistanceFromLeft(text: string, spanMm: number | undefined, context: EngineeringContext | undefined): number | undefined {
  if (spanMm !== undefined && /\bmid(?:dle)?[-\s]?span\b|\bmidpoint\b|\bat the middle\b/i.test(text)) {
    return spanMm / 2;
  }
  return numberAfter(
    /(?:gear\s+(?:is\s+)?(?:mounted|located|positioned)?\s*(?:at\s*)?|gear position(?:ed)?(?:\s+from the left(?: bearing| support)?)?\s*(?:is|at|=)?\s*)([0-9]+(?:\.[0-9]+)?)\s*mm\s*(?:from\s+the\s+left(?:\s+bearing|\s+support)?|after\s+the\s+left(?:\s+bearing|\s+support)?)/i,
    text
  ) ?? numberAfter(
    /(?:gear\s+(?:is\s+)?(?:mounted|located|positioned)?\s*(?:at\s*)?|gear position(?:ed)?(?:\s+from the left(?: bearing| support)?)?\s*(?:is|at|=)?\s*)([0-9]+(?:\.[0-9]+)?)\s*mm\b/i,
    text
  ) ?? contextNumber(context, ["gearPositionFromLeftMm", "gear position from left"]);
}

function parseAxialLoadN(text: string, context: EngineeringContext | undefined): number | undefined {
  const known = contextNumber(context, ["axialLoadN", "axialForceN"]);
  if (known !== undefined) return known;
  if (/\bneglect\b[^.]{0,100}\baxial\s+(?:force|forces|load|loads)\b|\bno\s+axial\s+(?:force|load)\b/i.test(text)) return 0;
  const match = text.match(/axial\s+(?:force|load)\s*(?:of|is|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(kN|N)\b/i);
  if (!match) return undefined;
  return Number(match[1]) * (match[2].toLowerCase() === "kn" ? 1000 : 1);
}

function parseStressMultiplier(text: string, key: "Kb" | "Kts", context: EngineeringContext | undefined): number | undefined {
  const known = contextNumber(context, [key, key.toLowerCase()]);
  if (known !== undefined) return known;
  const expression = key === "Kb"
    ? /\bKb\s*(?:=|of|is)?\s*([0-9]+(?:\.[0-9]+)?)/i
    : /\bKts?\s*(?:=|of|is)?\s*([0-9]+(?:\.[0-9]+)?)/i;
  const parsed = numberAfter(expression, text);
  if (parsed !== undefined) return parsed;
  if (/\bneglect\b[^.]{0,100}\b(?:shock|impact)\s*(?:\/\s*(?:shock|impact)\s*)?factors?\b|\bno\s+(?:shock|impact)\s*factors?\b/i.test(text)) return 1;
  return undefined;
}

export class DeterministicShaftIntentInterpreter implements EngineeringIntentInterpreter {
  async interpret(raw: string, context?: EngineeringContext): Promise<EngineeringIntentInterpretation> {
    const text = raw.trim();
    const lower = text.toLowerCase();
    const projectId = typeof context?.projectId === "string" && context.projectId.trim()
      ? context.projectId.trim()
      : undefined;

    const powerKw = numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*kW\b/i, text) ?? contextNumber(context, ["powerKw", "power"]);
    const speedRpm = numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*rpm\b/i, text) ?? contextNumber(context, ["speedRpm", "speed"]);
    const bearingSpanMm = numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*mm\s*apart\b/i, text)
      ?? numberAfter(/bearing span\s*(?:of|is|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i, text)
      ?? contextNumber(context, ["bearingSpanMm", "bearing span"]);
    const gearPositionFromLeftMm = parseDistanceFromLeft(text, bearingSpanMm, context);
    const pitchDiameterMm = numberAfter(
      /pitch diameter(?:\s+(?:of|is|=))?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i,
      text
    ) ?? numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*mm\s+pitch diameter\b/i, text)
      ?? contextNumber(context, ["pitchDiameterMm", "pitch diameter"]);
    const pressureAngleDeg = numberAfter(
      /pressure angle(?:\s+(?:of|is|=))?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:degrees?|°)/i,
      text
    ) ?? contextNumber(context, ["pressureAngleDeg", "pressure angle"]);

    const materialGrade = parseMaterialGrade(text, context);
    const yieldStrengthMpa = numberAfter(/\bSy\s*(?:=|of|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text)
      ?? numberAfter(/yield strength\s*(?:of|is|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text)
      ?? contextNumber(context, ["yieldStrengthMpa", "Sy", "yield strength"]);
    const ultimateTensileStrengthMpa = numberAfter(/\bSut\s*(?:=|of|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text)
      ?? numberAfter(/ultimate tensile strength\s*(?:of|is|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text)
      ?? contextNumber(context, ["ultimateTensileStrengthMpa", "Sut", "ultimate tensile strength"]);
    const designFactor = numberAfter(/(?:design factor|factor of safety|\bnd)\s*(?:of|is|=)?\s*([0-9]+(?:\.[0-9]+)?)/i, text)
      ?? contextNumber(context, ["designFactor", "nd", "design factor"]);
    const axialLoadN = parseAxialLoadN(text, context);
    const bendingStressFactorKb = parseStressMultiplier(text, "Kb", context);
    const torsionalStressFactorKts = parseStressMultiplier(text, "Kts", context);

    // Never infer a shaft diameter from an unrelated span or gear pitch diameter.
    const candidateDiameterMm = numberAfter(
      /(?:proposed|candidate|selected|shaft)\s+diameter(?:\s+(?:of|is|=))?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i,
      text
    ) ?? numberAfter(
      /(?:propos(?:e|ed|ing)|candidate|selected)\s+(?:a\s+)?([0-9]+(?:\.[0-9]+)?)\s*mm\s+diameter\b/i,
      text
    ) ?? contextNumber(context, ["candidateDiameterMm", "proposedDiameterMm", "proposed shaft diameter"]);
    const bendingMomentNm = numberAfter(
      /bending moment\s*(?:of|is|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*N(?:·|\.)?\s*m\b/i,
      text
    ) ?? contextNumber(context, ["bendingMomentNm", "bending moment"]);
    const allowableShearStressMpa = numberAfter(
      /allowable shear(?: stress)?\s*(?:of|is|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i,
      text
    ) ?? contextNumber(context, ["allowableShearStressMpa", "allowable shear stress"]);

    const staticDesign = bearingSpanMm !== undefined || pitchDiameterMm !== undefined ||
      pressureAngleDeg !== undefined || materialGrade !== undefined || yieldStrengthMpa !== undefined;
    const assumptions: string[] = [];
    if (staticDesign && axialLoadN === 0) assumptions.push("Axial loading was explicitly neglected as requested.");
    if (staticDesign && bendingStressFactorKb === 1) assumptions.push("Kb = 1.0 was used because shock/impact loading factors were explicitly neglected.");
    if (staticDesign && torsionalStressFactorKts === 1) assumptions.push("Kts = 1.0 was used because shock/impact loading factors were explicitly neglected.");

    const extractedInputs: Record<string, number | string> = {
      ...(projectId ? { projectId } : {}),
      ...(powerKw !== undefined ? { powerKw } : {}),
      ...(speedRpm !== undefined ? { speedRpm } : {}),
      ...(staticDesign ? {
        ...(bearingSpanMm !== undefined ? { bearingSpanMm } : {}),
        ...(gearPositionFromLeftMm !== undefined ? { gearPositionFromLeftMm } : {}),
        ...(pitchDiameterMm !== undefined ? { pitchDiameterMm } : {}),
        ...(pressureAngleDeg !== undefined ? { pressureAngleDeg } : {}),
        ...(materialGrade ? { materialGrade } : {}),
        ...(yieldStrengthMpa !== undefined ? { yieldStrengthMpa } : {}),
        ...(ultimateTensileStrengthMpa !== undefined ? { ultimateTensileStrengthMpa } : {}),
        ...(designFactor !== undefined ? { designFactor } : {}),
        ...(axialLoadN !== undefined ? { axialLoadN } : {}),
        ...(bendingStressFactorKb !== undefined ? { bendingStressFactorKb } : {}),
        ...(torsionalStressFactorKts !== undefined ? { torsionalStressFactorKts } : {}),
        ...(candidateDiameterMm !== undefined ? { candidateDiameterMm } : {})
      } : {
        ...(bendingMomentNm !== undefined ? { bendingMomentNm } : {}),
        ...(allowableShearStressMpa !== undefined ? { allowableShearStressMpa } : {}),
        ...(candidateDiameterMm !== undefined ? { proposedDiameterMm: candidateDiameterMm } : {})
      })
    };

    const staticRequired = [
      { value: powerKw, label: "power" },
      { value: speedRpm, label: "speed" },
      { value: bearingSpanMm, label: "bearing span" },
      { value: gearPositionFromLeftMm, label: "gear position relative to the left bearing" },
      { value: pitchDiameterMm, label: "gear pitch diameter" },
      { value: pressureAngleDeg, label: "gear pressure angle" },
      { value: materialGrade, label: "material grade" },
      { value: yieldStrengthMpa, label: "yield strength Sy" },
      { value: ultimateTensileStrengthMpa, label: "ultimate tensile strength Sut" },
      { value: designFactor, label: "design factor" },
      { value: axialLoadN, label: "axial load (state the value or explicitly neglect it)" },
      { value: bendingStressFactorKb, label: "bending multiplier Kb" },
      { value: torsionalStressFactorKts, label: "torsional multiplier Kts" }
    ];
    const legacyRequired = [
      { value: powerKw, label: "power" },
      { value: speedRpm, label: "speed" },
      { value: bendingMomentNm, label: "bending moment" },
      { value: allowableShearStressMpa, label: "allowable shear stress" },
      { value: candidateDiameterMm, label: "proposed shaft diameter" }
    ];
    const missingInputs = (staticDesign ? staticRequired : legacyRequired)
      .filter((item) => item.value === undefined)
      .map((item) => item.label);

    const contextUsed = Object.keys(extractedInputs)
      .filter((key) => key !== "projectId" && !new RegExp(String(extractedInputs[key]), "i").test(text));
    const goal = /\b(shaft|shaft design|shaft sizing)\b/i.test(text) ? "shaft design" : "engineering task";
    const completionUnit = goal === "shaft design" && /\bdesign\b|\bsize\b|\bverify\b|\btransmit\b/i.test(lower)
      ? "ENGINEERING.COMPLETE_SHAFT"
      : undefined;
    const ambiguity = missingInputs.length === 0 ? "LOW" : missingInputs.length <= 2 ? "MEDIUM" : "HIGH";
    const confidence = completionUnit && missingInputs.length === 0 ? "HIGH" : completionUnit ? "MEDIUM" : "LOW";

    return {
      raw: text,
      goal,
      completionUnit,
      extractedInputs,
      missingInputs,
      confidence,
      ambiguity,
      contextUsed: [...new Set(contextUsed)],
      assumptions,
      interpretationSource: "DETERMINISTIC"
    };
  }
}
