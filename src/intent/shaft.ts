import { EngineeringContext } from "../experience/context.js";
import { EngineeringIntentInterpreter, EngineeringIntentInterpretation } from "./types.js";

function numberAfter(pattern: RegExp, raw: string): number | undefined {
  const match = raw.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
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

function isAxialLoadNeglected(text: string): boolean {
  return /\b(?:neglect|ignore|neglecting|ignoring)\s+(?:the\s+)?axial\s+(?:force|forces|load|loads)\b/i.test(text) ||
    /\bno\s+axial\s+(?:force|forces|load|loads)\b/i.test(text);
}

export class DeterministicShaftIntentInterpreter implements EngineeringIntentInterpreter {
  async interpret(raw: string, context?: EngineeringContext): Promise<EngineeringIntentInterpretation> {
    const text = raw.trim();
    const lower = text.toLowerCase();
    const projectId = typeof context?.projectId === "string" && context.projectId.trim()
      ? context.projectId.trim()
      : undefined;

    const powerKw = numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*kW\b/i, text) ??
      contextNumber(context, ["powerKw", "power"]);
    const speedRpm = numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*rpm\b/i, text) ??
      contextNumber(context, ["speedRpm", "speed"]);

    const bearingSpanMm =
      numberAfter(/([0-9]+(?:\.[0-9]+)?)\s*mm\s+apart\b/i, text) ??
      numberAfter(/\bbearing\s+span(?:\s+of)?\s*(?:=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i, text) ??
      numberAfter(/\bspan\s+between\s+(?:the\s+)?bearings?\s*(?:of|=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i, text) ??
      contextNumber(context, ["bearingSpanMm", "bearingSpan"]);

    let gearPositionFromLeftMm =
      numberAfter(/\bgear\b[^.\n]{0,100}\b(?:at|located|positioned)\s*(?:x\s*=\s*)?([0-9]+(?:\.[0-9]+)?)\s*mm\b/i, text) ??
      contextNumber(context, ["gearPositionFromLeftMm", "gearPositionMm"]);
    const gearAtMidpoint = /\bgear\b[^.\n]{0,120}\bmidpoint\b/i.test(text) ||
      /\bmidpoint\b[^.\n]{0,80}\bgear\b/i.test(text);
    if (gearPositionFromLeftMm === undefined && gearAtMidpoint && bearingSpanMm !== undefined) {
      gearPositionFromLeftMm = bearingSpanMm / 2;
    }

    const pitchDiameterMm =
      numberAfter(/\bpitch\s+diameter(?:\s+of)?\s*(?:=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i, text) ??
      contextNumber(context, ["pitchDiameterMm", "gearPitchDiameterMm"]);
    const pressureAngleDeg =
      numberAfter(/\bpressure\s+angle(?:\s+of)?\s*(?:=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:°|deg(?:rees?)?)?/i, text) ??
      contextNumber(context, ["pressureAngleDeg", "pressureAngle"]);

    const materialMatch = text.match(/\bAISI\s*[- ]?\s*(\d{3,5})\b/i);
    const materialGrade = (materialMatch ? "AISI " + materialMatch[1] : undefined) ??
      contextString(context, ["materialGrade", "material"]);
    const yieldStrengthMpa =
      numberAfter(/\bSy\s*(?:=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text) ??
      numberAfter(/\byield\s+strength(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text) ??
      contextNumber(context, ["yieldStrengthMpa", "Sy"]);
    const ultimateTensileStrengthMpa =
      numberAfter(/\bSut\s*(?:=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text) ??
      numberAfter(/\bultimate\s+tensile\s+strength(?:\s+of)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text) ??
      contextNumber(context, ["ultimateTensileStrengthMpa", "Sut"]);
    const designFactor =
      numberAfter(/\b(?:design\s+factor|factor\s+of\s+safety|nd)\s*(?:of|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, text) ??
      contextNumber(context, ["designFactor", "nd", "factorOfSafety"]);

    const explicitAxialLoadN = numberAfter(/\baxial\s+(?:load|force)\s*(?:of|=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*N\b/i, text);
    const axialLoadN = explicitAxialLoadN ??
      (isAxialLoadNeglected(text) ? 0 : contextNumber(context, ["axialLoadN", "axialForceN"]) ?? 0);

    const bendingStressFactorKb =
      numberAfter(/\bKb\s*(?:=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, text) ??
      contextNumber(context, ["bendingStressFactorKb", "Kb"]);
    const torsionalStressFactorKts =
      numberAfter(/\bKts\s*(?:=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, text) ??
      contextNumber(context, ["torsionalStressFactorKts", "Kts"]);
    const candidateDiameterMm =
      numberAfter(/\b(?:candidate|proposed|selected)\s+(?:shaft\s+)?diameter\s*(?:of|=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i, text) ??
      contextNumber(context, ["candidateDiameterMm", "proposedDiameterMm", "diameter"]);

    // Compatibility extraction for the earlier explicit-M / allowable-shear workflow.
    const bendingMomentNm =
      numberAfter(/\b(?:bending\s+moment|bending)\s*(?:is|of|=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:N(?:·|\.)?\s*m|Nm)\b/i, text) ??
      contextNumber(context, ["bendingMomentNm", "bending moment"]);
    const allowableShearStressMpa =
      numberAfter(/\ballowable\s+shear(?:\s+stress)?\s*(?:is|of|=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*MPa\b/i, text) ??
      contextNumber(context, ["allowableShearStressMpa", "allowable shear stress"]);
    const proposedDiameterMm =
      numberAfter(/\bproposed\s+(?:shaft\s+)?diameter\s*(?:is|of|=|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i, text) ??
      contextNumber(context, ["proposedDiameterMm", "proposed shaft diameter"]);
    const requestedCriterion = /ASME.{0,40}\belliptic\b|\belliptic\b.{0,40}ASME/i.test(text)
      ? "ASME_ELLIPTIC"
      : undefined;

    const extractedInputs: Record<string, number | string> = {
      ...(projectId ? { projectId } : {}),
      ...(powerKw !== undefined ? { powerKw } : {}),
      ...(speedRpm !== undefined ? { speedRpm } : {}),
      ...(bearingSpanMm !== undefined ? { bearingSpanMm } : {}),
      ...(gearPositionFromLeftMm !== undefined ? { gearPositionFromLeftMm } : {}),
      ...(pitchDiameterMm !== undefined ? { pitchDiameterMm } : {}),
      ...(pressureAngleDeg !== undefined ? { pressureAngleDeg } : {}),
      ...(materialGrade ? { materialGrade } : {}),
      ...(yieldStrengthMpa !== undefined ? { yieldStrengthMpa } : {}),
      ...(ultimateTensileStrengthMpa !== undefined ? { ultimateTensileStrengthMpa } : {}),
      ...(designFactor !== undefined ? { designFactor } : {}),
      axialLoadN,
      ...(bendingStressFactorKb !== undefined ? { bendingStressFactorKb } : {}),
      ...(torsionalStressFactorKts !== undefined ? { torsionalStressFactorKts } : {}),
      ...(candidateDiameterMm !== undefined ? { candidateDiameterMm } : {}),
      ...(bendingMomentNm !== undefined ? { bendingMomentNm } : {}),
      ...(allowableShearStressMpa !== undefined ? { allowableShearStressMpa } : {}),
      ...(proposedDiameterMm !== undefined ? { proposedDiameterMm } : {}),
      ...(requestedCriterion ? { requestedCriterion } : {})
    };

    const hasGeometryInputs = bearingSpanMm !== undefined || gearPositionFromLeftMm !== undefined ||
      pitchDiameterMm !== undefined || pressureAngleDeg !== undefined || materialGrade !== undefined ||
      yieldStrengthMpa !== undefined || ultimateTensileStrengthMpa !== undefined || designFactor !== undefined;
    const hasLegacyModeSignal = !hasGeometryInputs && (bendingMomentNm !== undefined ||
      allowableShearStressMpa !== undefined || proposedDiameterMm !== undefined);
    const hasCompleteLegacyInputs = hasLegacyModeSignal && bendingMomentNm !== undefined &&
      allowableShearStressMpa !== undefined && (proposedDiameterMm !== undefined || candidateDiameterMm !== undefined);
    const missingInputs: string[] = [];
    if (powerKw === undefined) missingInputs.push("transmitted power");
    if (speedRpm === undefined) missingInputs.push("shaft speed");
    if (hasLegacyModeSignal) {
      if (bendingMomentNm === undefined) missingInputs.push("bending moment");
      if (allowableShearStressMpa === undefined) missingInputs.push("allowable shear stress");
      if (proposedDiameterMm === undefined && candidateDiameterMm === undefined) missingInputs.push("proposed shaft diameter");
    } else if (!hasCompleteLegacyInputs) {
      if (bearingSpanMm === undefined) missingInputs.push("bearing span");
      if (gearPositionFromLeftMm === undefined) missingInputs.push("gear position or a statement that the gear is at midspan");
      if (pitchDiameterMm === undefined) missingInputs.push("gear pitch diameter");
      if (pressureAngleDeg === undefined) missingInputs.push("gear pressure angle");
      if (!materialGrade) missingInputs.push("material grade");
      if (yieldStrengthMpa === undefined) missingInputs.push("material yield strength Sy");
      if (ultimateTensileStrengthMpa === undefined) missingInputs.push("material ultimate tensile strength Sut");
      if (designFactor === undefined) missingInputs.push("design factor");
    }

    const assumptions: string[] = [];
    if (explicitAxialLoadN === undefined && !isAxialLoadNeglected(text) &&
      contextNumber(context, ["axialLoadN", "axialForceN"]) === undefined) {
      assumptions.push("No axial load was provided; 0 N is assumed for this preliminary spur-gear model.");
    } else if (isAxialLoadNeglected(text)) {
      assumptions.push("The user explicitly requested that axial force be neglected (0 N).");
    }
    if (bendingStressFactorKb === undefined || torsionalStressFactorKts === undefined) {
      assumptions.push("Kb and Kts default to 1.0 because no geometry-based stress multipliers were supplied. These are not shock/impact service factors or fatigue factors.");
    }
    if (requestedCriterion) {
      assumptions.push("The request specifies ASME elliptic criteria. The current deterministic shaft pilot implements von Mises static-yield only, so ASME elliptic compliance is not claimed.");
    }

    const contextKeys = [
      "powerKw", "speedRpm", "bearingSpanMm", "gearPositionFromLeftMm", "pitchDiameterMm",
      "pressureAngleDeg", "materialGrade", "yieldStrengthMpa", "ultimateTensileStrengthMpa",
      "designFactor", "axialLoadN", "bendingStressFactorKb", "torsionalStressFactorKts", "candidateDiameterMm",
      "bendingMomentNm", "allowableShearStressMpa", "proposedDiameterMm"
    ];
    const contextUsed = contextKeys.filter((key) => {
      const value = extractedInputs[key];
      return value !== undefined && !text.toLowerCase().includes(String(value).toLowerCase());
    });
    if (gearAtMidpoint && bearingSpanMm !== undefined) contextUsed.push("gearPositionFromLeftMm:derived-from-midpoint");

    const assumptionNotes = assumptions.join(" ");
    if (assumptionNotes) extractedInputs.assumptionNotes = assumptionNotes;
    const goal = /\b(shaft|shaft design|shaft sizing)\b/i.test(text) ? "shaft design" : "engineering task";
    const completionUnit = goal === "shaft design" &&
      /\bdesign\b|\bsize\b|\bverify\b|\btransmit\b/i.test(lower)
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
      assumptions
    };
  }
}
