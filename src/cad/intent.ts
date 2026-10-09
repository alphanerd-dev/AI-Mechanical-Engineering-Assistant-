export type CADPartKind = "CYLINDER";
export type CADPartName = "shaft" | "cylinder";

export interface CADPartSpecification {
  kind: CADPartKind;
  name: CADPartName;
  diameterMm: number;
  lengthMm: number;
}

export interface CADPartSpecificationValidation {
  valid: boolean;
  errors: string[];
}

export type CADIntentResolution =
  | { status: "READY"; specification: CADPartSpecification; warnings: string[] }
  | { status: "NEEDS_INPUT"; missingInputs: string[]; nextQuestion: string; warnings: string[] }
  | { status: "UNSUPPORTED"; reason: string; warnings: string[] };

export interface CADPartIntentParserOptions {
  minDimensionMm?: number;
  maxDimensionMm?: number;
}

const DEFAULT_MIN_DIMENSION_MM = 0.01;
const DEFAULT_MAX_DIMENSION_MM = 10_000;
const NUMBER_PATTERN = "(?<value>\\d+(?:\\.\\d+)?|\\.\\d+)";
const UNIT_PATTERN = "(?<unit>millimeters?|millimetres?|mm|centimeters?|centimetres?|cm|meters?|metres?|m|inches?|in)\\b";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unitToMm(unit: string): number | undefined {
  const normalized = unit.toLowerCase();
  if (normalized === "mm" || normalized.startsWith("millimeter") || normalized.startsWith("millimetre")) return 1;
  if (normalized === "cm" || normalized.startsWith("centimeter") || normalized.startsWith("centimetre")) return 10;
  if (normalized === "m" || normalized === "meter" || normalized === "meters" || normalized === "metre" || normalized === "metres") return 1000;
  if (normalized === "in" || normalized === "inch" || normalized === "inches") return 25.4;
  return undefined;
}

type DimensionExtraction =
  | { status: "FOUND"; valueMm: number }
  | { status: "MISSING" }
  | { status: "AMBIGUOUS" }
  | { status: "INVALID"; reason: string };

function extractDimension(raw: string, dimension: "diameter" | "length"): DimensionExtraction {
  const label = dimension === "diameter"
    ? "(?:diameter|dia(?:meter)?|ø|⌀)"
    : "(?:length|height)";
  const reverseLabel = dimension === "diameter"
    ? "(?:diameter|dia(?:meter)?|ø|⌀)"
    : "(?:long|length|height)";
  const expressions = [
    new RegExp(label + "\\s*(?:of|is|=|:)?\\s*" + NUMBER_PATTERN + "\\s*" + UNIT_PATTERN, "gi"),
    new RegExp(NUMBER_PATTERN + "\\s*" + UNIT_PATTERN + "\\s*" + reverseLabel + "\\b", "gi")
  ];
  const values: number[] = [];

  for (const expression of expressions) {
    let match: RegExpExecArray | null;
    while ((match = expression.exec(raw)) !== null) {
      const groups = match.groups;
      if (!groups || groups.value === undefined || groups.unit === undefined) continue;
      const multiplier = unitToMm(groups.unit);
      if (multiplier === undefined) {
        return { status: "INVALID", reason: "Unsupported unit for " + dimension + "." };
      }
      const numeric = Number(groups.value);
      const valueMm = numeric * multiplier;
      if (!Number.isFinite(valueMm) || valueMm <= 0) {
        return { status: "INVALID", reason: "The " + dimension + " must be a finite positive value." };
      }
      values.push(Number(valueMm.toFixed(9)));
    }
  }

  if (values.length === 0) return { status: "MISSING" };
  const distinctValues = [...new Set(values)];
  if (distinctValues.length > 1) return { status: "AMBIGUOUS" };
  return { status: "FOUND", valueMm: distinctValues[0] };
}

export function validateCADPartSpecification(
  value: unknown,
  options: CADPartIntentParserOptions = {}
): CADPartSpecificationValidation {
  const errors: string[] = [];
  const minDimensionMm = options.minDimensionMm ?? DEFAULT_MIN_DIMENSION_MM;
  const maxDimensionMm = options.maxDimensionMm ?? DEFAULT_MAX_DIMENSION_MM;

  if (!isRecord(value)) return { valid: false, errors: ["CAD part specification must be an object."] };
  if (value.kind !== "CYLINDER") errors.push("Only the CYLINDER CAD part kind is supported by this reference generator.");
  if (value.name !== "shaft" && value.name !== "cylinder") errors.push("CAD part name must be shaft or cylinder.");

  for (const key of ["diameterMm", "lengthMm"] as const) {
    const dimension = value[key];
    if (typeof dimension !== "number" || !Number.isFinite(dimension)) {
      errors.push(key + " must be a finite number expressed in millimetres.");
    } else if (dimension < minDimensionMm || dimension > maxDimensionMm) {
      errors.push(key + " must be between " + minDimensionMm + " mm and " + maxDimensionMm + " mm.");
    }
  }
  if (!Number.isFinite(minDimensionMm) || minDimensionMm <= 0) {
    errors.push("minDimensionMm must be a finite positive number.");
  }
  if (!Number.isFinite(maxDimensionMm) || maxDimensionMm < minDimensionMm) {
    errors.push("maxDimensionMm must be finite and not less than minDimensionMm.");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Bounded natural-language interpretation for the first CAD completion path.
 * Supports cylindrical shafts/cylinders with explicit, unit-bearing dimensions.
 * Unsupported geometry is never guessed.
 */
export function parseCADPartIntent(
  rawIntent: unknown,
  options: CADPartIntentParserOptions = {}
): CADIntentResolution {
  if (typeof rawIntent !== "string" || rawIntent.trim().length === 0) {
    return {
      status: "NEEDS_INPUT",
      missingInputs: ["part description"],
      nextQuestion: "Describe the part to create, including its shape and dimensions with units.",
      warnings: []
    };
  }

  const raw = rawIntent.trim();
  if (!/\b(shaft|cylinder|cylindrical)\b/i.test(raw)) {
    return {
      status: "UNSUPPORTED",
      reason: "This reference CAD path currently supports cylindrical shafts and cylinders only.",
      warnings: ["No geometry was generated or executed."]
    };
  }

  const diameter = extractDimension(raw, "diameter");
  const length = extractDimension(raw, "length");
  const invalid = [diameter, length].find((result) => result.status === "INVALID");
  if (invalid && invalid.status === "INVALID") {
    return { status: "NEEDS_INPUT", missingInputs: [], nextQuestion: invalid.reason + " Use mm, cm, m, or inches.", warnings: [] };
  }

  const missingInputs: string[] = [];
  const clarification: string[] = [];
  if (diameter.status === "MISSING") missingInputs.push("diameter");
  if (length.status === "MISSING") missingInputs.push("length");
  if (diameter.status === "AMBIGUOUS") clarification.push("diameter");
  if (length.status === "AMBIGUOUS") clarification.push("length");

  if (missingInputs.length > 0 || clarification.length > 0) {
    const questions: string[] = [];
    if (clarification.length > 0) questions.push("There are conflicting " + clarification.join(" and ") + " values; specify one unambiguous value for each.");
    if (missingInputs.length > 0) questions.push("Specify the " + missingInputs.join(" and ") + " with units, for example 30 mm diameter and 200 mm length.");
    return { status: "NEEDS_INPUT", missingInputs, nextQuestion: questions.join(" "), warnings: [] };
  }

  if (diameter.status !== "FOUND" || length.status !== "FOUND") {
    return { status: "NEEDS_INPUT", missingInputs: [], nextQuestion: "Specify one diameter and one length using explicit units.", warnings: [] };
  }

  const specification: CADPartSpecification = {
    kind: "CYLINDER",
    name: /\bshaft\b/i.test(raw) ? "shaft" : "cylinder",
    diameterMm: diameter.valueMm,
    lengthMm: length.valueMm
  };
  const validation = validateCADPartSpecification(specification, options);
  if (!validation.valid) {
    return { status: "NEEDS_INPUT", missingInputs: [], nextQuestion: validation.errors.join(" "), warnings: [] };
  }

  return { status: "READY", specification, warnings: [] };
}
