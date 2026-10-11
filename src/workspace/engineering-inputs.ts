import type { Requirement, RequirementPriority } from "../core/types.js";

const PRIORITIES = new Set<RequirementPriority>(["MUST", "SHOULD", "COULD"]);
const UUID_LIKE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new Error(`${field} must be a string of at most ${maxLength} characters.`);
  }
  return value.trim() || undefined;
}

function optionalValue(value: unknown): number | string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Requirement values must be finite numbers or text.");
    return value;
  }
  if (typeof value === "string" && value.trim().length <= 160) return value.trim() || undefined;
  throw new Error("Requirement values must be finite numbers or text up to 160 characters.");
}

export function normalizeRequirements(value: unknown): Requirement[] {
  if (!Array.isArray(value)) throw new Error("Requirements must be an array.");
  if (value.length > 100) throw new Error("A project may contain at most 100 requirements.");

  const ids = new Set<string>();
  return value.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Requirement ${index + 1} must be an object.`);
    const id = optionalText(raw.id, "Requirement ID", 80);
    const name = optionalText(raw.name, "Requirement name", 160);
    if (!id || !UUID_LIKE_ID.test(id)) throw new Error(`Requirement ${index + 1} has an invalid ID.`);
    if (!name) throw new Error(`Requirement ${index + 1} needs a name.`);
    if (ids.has(id)) throw new Error(`Duplicate requirement ID: ${id}.`);
    ids.add(id);

    const priority = raw.priority;
    if (typeof priority !== "string" || !PRIORITIES.has(priority as RequirementPriority)) {
      throw new Error(`Requirement "${name}" has an invalid priority.`);
    }
    const unit = optionalText(raw.unit, "Requirement unit", 40);
    const tolerance = optionalValue(raw.tolerance);
    const verificationMethod = optionalText(raw.verificationMethod, "Verification method", 240);
    const item: Requirement = {
      id,
      name,
      priority: priority as RequirementPriority,
      status: "OPEN"
    };
    const requirementValue = optionalValue(raw.value);
    if (requirementValue !== undefined) item.value = requirementValue;
    if (unit) item.unit = unit;
    if (tolerance !== undefined) item.tolerance = tolerance;
    if (verificationMethod) item.verificationMethod = verificationMethod;
    return item;
  });
}

export function normalizeTextList(value: unknown, field: string, maxItems = 100, maxLength = 1000): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of text values.`);
  if (value.length > maxItems) throw new Error(`${field} may contain at most ${maxItems} entries.`);
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > maxLength) {
      throw new Error(`${field} entry ${index + 1} must contain 1–${maxLength} characters.`);
    }
    return item.trim();
  });
}

export function calculateShaftTorque(powerKw: number, speedRpm: number): {
  powerKw: number;
  speedRpm: number;
  angularVelocityRadPerSecond: number;
  torqueNm: number;
  formula: string;
  informationStatus: "CALCULATED";
} {
  if (!Number.isFinite(powerKw) || powerKw <= 0 || powerKw > 1_000_000) {
    throw new Error("Power must be a finite positive value no greater than 1,000,000 kW.");
  }
  if (!Number.isFinite(speedRpm) || speedRpm <= 0 || speedRpm > 10_000_000) {
    throw new Error("Rotational speed must be a finite positive value no greater than 10,000,000 rpm.");
  }
  const angularVelocityRadPerSecond = (2 * Math.PI * speedRpm) / 60;
  const torqueNm = (powerKw * 1000) / angularVelocityRadPerSecond;
  if (!Number.isFinite(torqueNm)) throw new Error("The torque calculation produced a non-finite result.");
  return {
    powerKw,
    speedRpm,
    angularVelocityRadPerSecond: Number(angularVelocityRadPerSecond.toFixed(6)),
    torqueNm: Number(torqueNm.toFixed(6)),
    formula: "T = P / omega; omega = 2*pi*n/60; P converted from kW to W",
    informationStatus: "CALCULATED"
  };
}

export function assessRequirementCompleteness(requirements: Requirement[]) {
  const mustHave = requirements.filter((requirement) => requirement.priority === "MUST");
  const missingData = mustHave.filter((requirement) =>
    requirement.value === undefined || requirement.value === "" ||
    !requirement.unit || !requirement.verificationMethod
  );
  const awaitingEvidence = mustHave.filter((requirement) =>
    requirement.status !== "SATISFIED"
  );
  const noRequirementsDefined = requirements.length === 0;
  const noMustHaveRequirements = requirements.length > 0 && mustHave.length === 0;
  const status = noRequirementsDefined || noMustHaveRequirements || missingData.length > 0
    ? "BLOCKED"
    : awaitingEvidence.length > 0
      ? "REVIEW_REQUIRED"
      : "PASS";
  const explicitMissingData = noRequirementsDefined
    ? [{ id: "REQUIREMENTS", name: "No project requirements have been defined." }]
    : noMustHaveRequirements
      ? [{ id: "REQUIREMENTS", name: "Define at least one MUST requirement before review." }]
      : missingData.map(({ id, name }) => ({ id, name }));
  return {
    status,
    mustHaveCount: mustHave.length,
    missingData: explicitMissingData,
    awaitingEvidence: awaitingEvidence.map(({ id, name }) => ({ id, name }))
  } as const;
}
