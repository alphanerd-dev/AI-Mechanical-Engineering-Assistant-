import { EngineeringContext } from "../experience/context.js";
import { EngineeringIntentInterpreter, EngineeringIntentInterpretation } from "./types.js";

const MAX_SHAFT_INTENT_CHARACTERS = 12_000;

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
  return /\b(?:neglect|ignore|neglecting|ignoring)[\t ]{1,16}(?:the[\t ]{1,16})?axial[\t ]{1,16}(?:force|forces|load|loads)\b/i.test(text) ||
    /\bno[\t ]{1,16}axial[\t ]{1,16}(?:force|forces|load|loads)\b/i.test(text);
}

export class DeterministicShaftIntentInterpreter implements EngineeringIntentInterpreter {
  async interpret(raw: string, context?: EngineeringContext): Promise<EngineeringIntentInterpretation> {
    if (raw.length > MAX_SHAFT_INTENT_CHARACTERS) {
      throw new Error(`Shaft design intent exceeds the ${MAX_SHAFT_INTENT_CHARACTERS}-character limit.`);
    }
    const text = raw.trim();
    const lower = text.toLowerCase();
    const projectId = typeof context?.projectId === "string" && context.projectId.trim()
      ? context.projectId.trim()
      : undefined;

    const powerKw = numberAfter(/([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}kW\b/i, text) ??
      contextNumber(context, ["powerKw", "power"]);
    const speedRpm = numberAfter(/([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}rpm\b/i, text) ??
      contextNumber(context, ["speedRpm", "speed"]);

    const bearingSpanMm =
      numberAfter(/([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}mm[\t ]{1,16}apart\b/i, text) ??
      numberAfter(/\bbearing[\t ]{1,16}span(?:[\t ]{1,16}of)?[\t ]{0,16}(?:=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}mm\b/i, text) ??
      numberAfter(/\bspan[\t ]{1,16}between[\t ]{1,16}(?:the[\t ]{1,16})?bearings?[\t ]{0,16}(?:of|=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}mm\b/i, text) ??
      contextNumber(context, ["bearingSpanMm", "bearingSpan"]);

    let gearPositionFromLeftMm =
      numberAfter(/\bgear\b[^.\n]{0,100}\b(?:at|located|positioned)[\t ]{0,16}(?:x[\t ]{0,16}=[\t ]{0,16})?([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}mm\b/i, text) ??
      contextNumber(context, ["gearPositionFromLeftMm", "gearPositionMm"]);
    const gearAtMidpoint = /\bgear\b[^.\n]{0,120}\bmidpoint\b/i.test(text) ||
      /\bmidpoint\b[^.\n]{0,80}\bgear\b/i.test(text);
    if (gearPositionFromLeftMm === undefined && gearAtMidpoint && bearingSpanMm !== undefined) {
      gearPositionFromLeftMm = bearingSpanMm / 2;
    }

    const pitchDiameterMm =
      numberAfter(/\bpitch[\t ]{1,16}diameter(?:[\t ]{1,16}of)?[\t ]{0,16}(?:=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}mm\b/i, text) ??
      contextNumber(context, ["pitchDiameterMm", "gearPitchDiameterMm"]);
    const pressureAngleDeg =
      numberAfter(/\bpressure[\t ]{1,16}angle(?:[\t ]{1,16}of)?[\t ]{0,16}(?:=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}(?:°|deg(?:rees?)?)?/i, text) ??
      contextNumber(context, ["pressureAngleDeg", "pressureAngle"]);

    const materialMatch = text.match(/\bAISI[\t ]{0,16}[- ]?[\t ]{0,16}(\d{3,5})\b/i);
    const materialGrade = (materialMatch ? "AISI " + materialMatch[1] : undefined) ??
      contextString(context, ["materialGrade", "material"]);
    const yieldStrengthMpa =
      numberAfter(/\bSy[\t ]{0,16}(?:=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}MPa\b/i, text) ??
      numberAfter(/\byield[\t ]{1,16}strength(?:[\t ]{1,16}of)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}MPa\b/i, text) ??
      contextNumber(context, ["yieldStrengthMpa", "Sy"]);
    const ultimateTensileStrengthMpa =
      numberAfter(/\bSut[\t ]{0,16}(?:=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}MPa\b/i, text) ??
      numberAfter(/\bultimate[\t ]{1,16}tensile[\t ]{1,16}strength(?:[\t ]{1,16}of)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}MPa\b/i, text) ??
      contextNumber(context, ["ultimateTensileStrengthMpa", "Sut"]);
    const designFactor =
      numberAfter(/\b(?:design[\t ]{1,16}factor|factor[\t ]{1,16}of[\t ]{1,16}safety|nd)[\t ]{0,16}(?:of|=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)/i, text) ??
      contextNumber(context, ["designFactor", "nd", "factorOfSafety"]);

    const explicitAxialLoadN = numberAfter(/\baxial[\t ]{1,16}(?:load|force)[\t ]{0,16}(?:of|=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}N\b/i, text);
    const axialLoadN = explicitAxialLoadN ??
      (isAxialLoadNeglected(text) ? 0 : contextNumber(context, ["axialLoadN", "axialForceN"]) ?? 0);

    const bendingStressFactorKb =
      numberAfter(/\bKb[\t ]{0,16}(?:=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)/i, text) ??
      contextNumber(context, ["bendingStressFactorKb", "Kb"]);
    const torsionalStressFactorKts =
      numberAfter(/\bKts[\t ]{0,16}(?:=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)/i, text) ??
      contextNumber(context, ["torsionalStressFactorKts", "Kts"]);
    const candidateDiameterMm =
      numberAfter(/\b(?:candidate|proposed|selected)[\t ]{1,16}(?:shaft[\t ]{1,16})?diameter[\t ]{0,16}(?:of|=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}mm\b/i, text) ??
      contextNumber(context, ["candidateDiameterMm", "proposedDiameterMm", "diameter"]);

    // Compatibility extraction for the earlier explicit-M / allowable-shear workflow.
    const bendingMomentNm =
      numberAfter(/\b(?:bending[\t ]{1,16}moment|bending)[\t ]{0,16}(?:is|of|=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}(?:N(?:·|\.)?[\t ]{0,16}m|Nm)\b/i, text) ??
      contextNumber(context, ["bendingMomentNm", "bending moment"]);
    const allowableShearStressMpa =
      numberAfter(/\ballowable[\t ]{1,16}shear(?:[\t ]{1,16}stress)?[\t ]{0,16}(?:is|of|=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}MPa\b/i, text) ??
      contextNumber(context, ["allowableShearStressMpa", "allowable shear stress"]);
    const proposedDiameterMm =
      numberAfter(/\bproposed[\t ]{1,16}(?:shaft[\t ]{1,16})?diameter[\t ]{0,16}(?:is|of|=|:)?[\t ]{0,16}([0-9]{1,12}(?:\.[0-9]{1,12})?)[\t ]{0,16}mm\b/i, text) ??
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
