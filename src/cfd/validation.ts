import {
  CFDValidationCheck,
  OpenFOAMLaminarChannelRequest,
  OpenFOAMLaminarChannelResult,
  OpenFOAMLaminarChannelValidation,
  OpenFOAMRunArtifact,
  OpenFOAMVelocitySample
} from "./types.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROFILE_NRMSE_TOLERANCE = 0.02;
const MASS_FLOW_RELATIVE_TOLERANCE = 0.005;
const REQUIRED_ARTIFACT_KINDS: OpenFOAMRunArtifact["kind"][] = [
  "MESH",
  "VELOCITY_FIELD",
  "PRESSURE_FIELD",
  "SOLVER_LOG"
];

interface ValidationState {
  checks: CFDValidationCheck[];
  blockingReasons: string[];
  missing: string[];
  warnings: string[];
}

interface ProfileMetrics {
  normalizedRmse: number;
  maximumAbsoluteError: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function boundedPositive(value: unknown, minimum: number, maximum: number): value is number {
  return finitePositive(value) && value >= minimum && value <= maximum;
}

function validInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function validatePhysicalInputs(candidate: Partial<OpenFOAMLaminarChannelRequest>): string[] {
  const errors: string[] = [];
  if (!boundedPositive(candidate.meanVelocityMps, 1e-4, 100)) {
    errors.push("meanVelocityMps must be between 1e-4 and 100 m/s.");
  }
  if (!boundedPositive(candidate.heightM, 1e-4, 10)) {
    errors.push("heightM must be between 1e-4 and 10 m.");
  }
  if (!boundedPositive(candidate.depthM, 1e-4, 10)) {
    errors.push("depthM must be between 1e-4 and 10 m.");
  }
  if (!boundedPositive(candidate.densityKgM3, 0.1, 20000)) {
    errors.push("densityKgM3 must be between 0.1 and 20000 kg/m3.");
  }
  if (!boundedPositive(candidate.kinematicViscosityM2PerS, 1e-9, 1e-2)) {
    errors.push("kinematicViscosityM2PerS must be between 1e-9 and 1e-2 m2/s.");
  }
  return errors;
}

function validateFlowRegime(candidate: Partial<OpenFOAMLaminarChannelRequest>): string[] {
  const velocity = candidate.meanVelocityMps;
  const height = candidate.heightM;
  const viscosity = candidate.kinematicViscosityM2PerS;
  if (!finitePositive(velocity) || !finitePositive(height) || !finitePositive(viscosity)) return [];

  const reynoldsNumber = 2 * height * velocity / viscosity;
  const bodyForce = 12 * viscosity * velocity / (height * height);
  const errors: string[] = [];
  if (!Number.isFinite(reynoldsNumber) || reynoldsNumber >= 1000) {
    errors.push("The benchmark is restricted to laminar cases with hydraulic-diameter Reynolds number below 1000.");
  }
  if (!Number.isFinite(bodyForce) || bodyForce <= 0) {
    errors.push("The derived Poiseuille body-force acceleration is outside the finite numeric range.");
  }
  return errors;
}

function validateMeshSettings(candidate: Partial<OpenFOAMLaminarChannelRequest>): string[] {
  return validInteger(candidate.mesh?.cellsVertical, 20, 200)
    ? []
    : ["mesh.cellsVertical must be an integer between 20 and 200."];
}

interface IntegerSettingRule {
  value: unknown;
  minimum: number;
  maximum: number;
  message: string;
}

function validateIntegerSetting(rule: IntegerSettingRule): string[] {
  return validInteger(rule.value, rule.minimum, rule.maximum) ? [] : [rule.message];
}

function validateResidualTolerance(value: unknown): string[] {
  const valid = typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1e-10 &&
    value <= 1e-3;
  return valid ? [] : ["solver.residualTolerance must be between 1e-10 and 1e-3."];
}

function validateSolverSettings(candidate: Partial<OpenFOAMLaminarChannelRequest>): string[] {
  const solver = candidate.solver;
  return [
    ...validateIntegerSetting({
      value: solver?.maxIterations,
      minimum: 50,
      maximum: 10000,
      message: "solver.maxIterations must be an integer between 50 and 10000."
    }),
    ...validateResidualTolerance(solver?.residualTolerance),
    ...validateIntegerSetting({
      value: solver?.timeoutSeconds,
      minimum: 5,
      maximum: 600,
      message: "solver.timeoutSeconds must be an integer between 5 and 600."
    })
  ];
}

export function validateOpenFOAMLaminarChannelRequest(request: unknown): string[] {
  if (!isRecord(request)) return ["The OpenFOAM benchmark request must be an object."];
  const candidate = request as Partial<OpenFOAMLaminarChannelRequest>;
  return unique([
    ...(candidate.caseId === "laminar-channel-poiseuille-v1"
      ? []
      : ["Only the versioned laminar-channel Poiseuille benchmark is supported."]),
    ...validatePhysicalInputs(candidate),
    ...validateFlowRegime(candidate),
    ...validateMeshSettings(candidate),
    ...validateSolverSettings(candidate)
  ]);
}

export function poiseuilleAxialVelocity(
  yM: number,
  channelHeightM: number,
  meanVelocityMps: number
): number {
  if (!finitePositive(channelHeightM) || !finitePositive(meanVelocityMps)) {
    throw new Error("Channel height and mean velocity must be finite and positive.");
  }
  if (!Number.isFinite(yM) || yM < 0 || yM > channelHeightM) {
    throw new Error("Profile coordinate must lie within the channel height.");
  }
  const normalizedY = yM / channelHeightM;
  return 6 * meanVelocityMps * normalizedY * (1 - normalizedY);
}

export function expectedPoiseuilleMassFluxKgS(
  request: Pick<
    OpenFOAMLaminarChannelRequest,
    "densityKgM3" | "meanVelocityMps" | "heightM" | "depthM"
  >
): number {
  return request.densityKgM3 *
    request.meanVelocityMps *
    request.heightM *
    request.depthM;
}

function isSafeArtifactPath(path: string): boolean {
  const segments = path.split(/[\\/]/);
  return Boolean(path.trim()) && !path.startsWith("/") && !segments.includes("..");
}

function isValidArtifactDigest(digest: string): boolean {
  return SHA256_PATTERN.test(digest);
}

function isSafeArtifactMetadata(value: unknown): value is OpenFOAMRunArtifact {
  if (!isRecord(value)) return false;
  const path = value.path;
  const mediaType = value.mediaType;
  const digest = value.sha256;
  return typeof path === "string" &&
    typeof mediaType === "string" &&
    typeof digest === "string" &&
    isSafeArtifactPath(path) &&
    Boolean(mediaType.trim()) &&
    isValidArtifactDigest(digest);
}

function findMissingArtifactKinds(artifacts: OpenFOAMRunArtifact[]): string[] {
  return REQUIRED_ARTIFACT_KINDS
    .filter(kind => !artifacts.some(artifact => artifact.kind === kind))
    .map(kind => `The ${kind} result artifact is missing.`);
}

function validateArtifactSet(value: unknown): { blocking: string[]; missing: string[] } {
  if (!Array.isArray(value)) {
    return { blocking: [], missing: ["The solver artifact list is missing."] };
  }
  const artifacts = value as unknown[];
  const invalidMetadata = artifacts.some(artifact => !isSafeArtifactMetadata(artifact));
  const validArtifacts = artifacts.filter(isSafeArtifactMetadata);
  return {
    blocking: invalidMetadata
      ? ["An output artifact has unsafe path metadata or an invalid SHA-256 digest."]
      : [],
    missing: findMissingArtifactKinds(validArtifacts)
  };
}

function isVelocitySample(value: unknown): value is OpenFOAMVelocitySample {
  if (!isRecord(value)) return false;
  return typeof value.yM === "number" &&
    Number.isFinite(value.yM) &&
    typeof value.axialVelocityMps === "number" &&
    Number.isFinite(value.axialVelocityMps);
}

function createValidationState(output: Partial<OpenFOAMLaminarChannelResult>): ValidationState {
  const warnings = Array.isArray(output.warnings)
    ? output.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  return { checks: [], blockingReasons: [], missing: [], warnings };
}

function addCheck(state: ValidationState, check: CFDValidationCheck): void {
  state.checks.push(check);
}

function validateSolverCompletion(output: Partial<OpenFOAMLaminarChannelResult>, state: ValidationState): void {
  const pass = output.status === "COMPLETED" && output.converged === true;
  addCheck(state, {
    name: "solver_completion",
    pass,
    message: pass
      ? "OpenFOAM completed the laminar benchmark."
      : "OpenFOAM did not complete a converged benchmark."
  });
  if (!pass) state.blockingReasons.push("The OpenFOAM benchmark did not complete with converged=true.");
}

function validateSolverVersion(output: Partial<OpenFOAMLaminarChannelResult>, state: ValidationState): void {
  const pass = output.solver === "OpenFOAM" && output.solverVersion === "14";
  addCheck(state, {
    name: "solver_version",
    pass,
    message: pass
      ? "The result identifies OpenFOAM 14."
      : "The result does not identify the pinned OpenFOAM 14 runtime."
  });
  if (!pass) state.blockingReasons.push("The result must identify the pinned OpenFOAM 14 solver runtime.");
}

function validateMeshCardinality(
  request: OpenFOAMLaminarChannelRequest,
  output: Partial<OpenFOAMLaminarChannelResult>,
  state: ValidationState
): void {
  const pass = Number.isInteger(output.meshCells) &&
    output.meshCells === request.mesh.cellsVertical;
  addCheck(state, {
    name: "mesh_cardinality",
    pass,
    measured: output.meshCells,
    expected: request.mesh.cellsVertical,
    message: pass
      ? "The mesh cell count matches the requested half-channel mesh."
      : "The mesh cell count does not match the requested half-channel mesh."
  });
  if (!pass) state.blockingReasons.push("The generated mesh does not match the requested cell count.");
}

function collectRequiredOutputIssues(
  output: Partial<OpenFOAMLaminarChannelResult>,
  state: ValidationState
): void {
  const massFlow = output.massFluxKgS;
  if (typeof massFlow !== "number" || !Number.isFinite(massFlow)) {
    state.missing.push("The integrated mass-flow result is missing or non-finite.");
  } else if (massFlow <= 0) {
    state.blockingReasons.push("The integrated mass flow must be positive.");
  }

  if (!isRecord(output.residuals)) {
    state.missing.push("Final solver residuals are missing.");
  } else if (!hasFiniteNonNegativeResiduals(output.residuals)) {
    state.blockingReasons.push("Final solver residuals must be finite and non-negative.");
  }

  if (!Array.isArray(output.velocityProfile) || output.velocityProfile.length < 5) {
    state.missing.push("At least five velocity-profile samples are required.");
  }

  const artifactIssues = validateArtifactSet(output.artifacts);
  state.blockingReasons.push(...artifactIssues.blocking);
  state.missing.push(...artifactIssues.missing);
}

function hasFiniteNonNegativeResiduals(value: Record<string, unknown>): boolean {
  const pressure = value.pressure;
  const velocity = value.velocity;
  return typeof pressure === "number" &&
    Number.isFinite(pressure) &&
    pressure >= 0 &&
    typeof velocity === "number" &&
    Number.isFinite(velocity) &&
    velocity >= 0;
}

function isValidHalfChannelProfile(
  profile: unknown[],
  halfHeight: number
): profile is OpenFOAMVelocitySample[] {
  const samplesValid = profile.every(isVelocitySample);
  if (!samplesValid) return false;
  const samples = profile as OpenFOAMVelocitySample[];
  const coordinatesInRange = samples.every(sample => sample.yM >= 0);
  const coordinatesBelowCentreline = samples.every(sample => sample.yM <= halfHeight);
  const coordinatesUnique = new Set(samples.map(sample => sample.yM)).size === samples.length;
  return coordinatesInRange && coordinatesBelowCentreline && coordinatesUnique;
}

function calculateProfileMetrics(
  request: OpenFOAMLaminarChannelRequest,
  profile: OpenFOAMVelocitySample[]
): ProfileMetrics {
  const ordered = [...profile].sort((left, right) => left.yM - right.yM);
  const expectedPeakVelocity = 1.5 * request.meanVelocityMps;
  let squaredErrorSum = 0;
  let maximumAbsoluteError = 0;
  for (const sample of ordered) {
    const expected = poiseuilleAxialVelocity(sample.yM, request.heightM, request.meanVelocityMps);
    const error = sample.axialVelocityMps - expected;
    squaredErrorSum += error * error;
    maximumAbsoluteError = Math.max(maximumAbsoluteError, Math.abs(error));
  }
  return {
    normalizedRmse: Math.sqrt(squaredErrorSum / ordered.length) / expectedPeakVelocity,
    maximumAbsoluteError
  };
}

function validateVelocityProfile(
  request: OpenFOAMLaminarChannelRequest,
  value: unknown,
  state: ValidationState
): number | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!isValidHalfChannelProfile(value, request.heightM / 2)) {
    state.blockingReasons.push("The velocity profile contains invalid, out-of-domain or duplicate sample coordinates.");
    addCheck(state, {
      name: "poiseuille_velocity_profile",
      pass: false,
      message: "The velocity profile deviates from the analytical Poiseuille solution."
    });
    return undefined;
  }
  const metrics = calculateProfileMetrics(request, value);
  const expectedPeakVelocity = 1.5 * request.meanVelocityMps;
  const pass = metrics.normalizedRmse <= PROFILE_NRMSE_TOLERANCE &&
    metrics.maximumAbsoluteError <= 0.05 * expectedPeakVelocity;
  addCheck(state, {
    name: "poiseuille_velocity_profile",
    pass,
    measured: metrics.normalizedRmse,
    expected: 0,
    tolerance: PROFILE_NRMSE_TOLERANCE,
    message: pass
      ? "The velocity profile is within the analytical Poiseuille tolerance."
      : "The velocity profile deviates from the analytical Poiseuille solution."
  });
  if (!pass) state.blockingReasons.push("The velocity profile exceeds the analytical Poiseuille error tolerance.");
  return metrics.normalizedRmse;
}

function validateIntegratedMassFlow(
  output: Partial<OpenFOAMLaminarChannelResult>,
  expectedMassFluxKgS: number,
  state: ValidationState
): number | undefined {
  const actual = output.massFluxKgS;
  if (typeof actual !== "number" || !Number.isFinite(actual)) return undefined;
  const relativeError = Math.abs(actual - expectedMassFluxKgS) / expectedMassFluxKgS;
  const pass = Number.isFinite(relativeError) && relativeError <= MASS_FLOW_RELATIVE_TOLERANCE;
  addCheck(state, {
    name: "integrated_mass_flow",
    pass,
    measured: relativeError,
    expected: 0,
    tolerance: MASS_FLOW_RELATIVE_TOLERANCE,
    message: pass
      ? "Integrated mass flow matches the analytical channel flow rate."
      : "Integrated mass flow deviates from the analytical channel flow rate."
  });
  if (!pass) state.blockingReasons.push("Integrated mass-flow error exceeds 0.5%.");
  return relativeError;
}

function validateSolverResiduals(
  request: OpenFOAMLaminarChannelRequest,
  output: Partial<OpenFOAMLaminarChannelResult>,
  state: ValidationState
): void {
  if (!isRecord(output.residuals) || !hasFiniteNonNegativeResiduals(output.residuals)) return;
  const pressure = output.residuals.pressure as number;
  const velocity = output.residuals.velocity as number;
  const pass = pressure <= request.solver.residualTolerance &&
    velocity <= request.solver.residualTolerance;
  addCheck(state, {
    name: "solver_residuals",
    pass,
    message: pass
      ? "Final pressure and velocity residuals meet the requested tolerance."
      : "Final pressure or velocity residuals exceed the requested tolerance."
  });
  if (!pass) state.blockingReasons.push("Final solver residuals exceed the requested tolerance.");
}

function incompleteValidation(
  reynoldsNumber: number,
  expectedMassFluxKgS: number,
  state: ValidationState
): OpenFOAMLaminarChannelValidation {
  return {
    status: state.blockingReasons.length ? "FAIL" : "INCOMPLETE",
    reynoldsNumber,
    expectedMassFluxKgS,
    checks: state.checks,
    blockingReasons: unique([...state.blockingReasons, ...state.missing]),
    warnings: state.warnings
  };
}

export function validateOpenFOAMLaminarChannelResult(
  request: OpenFOAMLaminarChannelRequest,
  result: unknown
): OpenFOAMLaminarChannelValidation {
  const reynoldsNumber = request.meanVelocityMps * 2 * request.heightM /
    request.kinematicViscosityM2PerS;
  const expectedMassFluxKgS = expectedPoiseuilleMassFluxKgS(request);
  if (!isRecord(result)) {
    return {
      status: "INCOMPLETE",
      reynoldsNumber,
      expectedMassFluxKgS,
      checks: [],
      blockingReasons: ["The OpenFOAM worker returned no result object."],
      warnings: []
    };
  }

  const output = result as Partial<OpenFOAMLaminarChannelResult>;
  const state = createValidationState(output);
  validateSolverCompletion(output, state);
  validateSolverVersion(output, state);
  validateMeshCardinality(request, output, state);
  collectRequiredOutputIssues(output, state);

  // Validate every independently available result even when another required
  // field or artifact is missing. This preserves all actionable failure
  // evidence instead of allowing one missing artifact to mask a bad profile.
  const normalizedProfileRmse = validateVelocityProfile(request, output.velocityProfile, state);
  const massFluxRelativeError = validateIntegratedMassFlow(
    output,
    expectedMassFluxKgS,
    state
  );
  validateSolverResiduals(request, output, state);

  if (state.missing.length) {
    return {
      ...incompleteValidation(reynoldsNumber, expectedMassFluxKgS, state),
      normalizedProfileRmse,
      massFluxRelativeError
    };
  }

  return {
    status: state.blockingReasons.length ? "FAIL" : "PASS",
    reynoldsNumber,
    expectedMassFluxKgS,
    normalizedProfileRmse,
    massFluxRelativeError,
    checks: state.checks,
    blockingReasons: unique(state.blockingReasons),
    warnings: state.warnings
  };
}
