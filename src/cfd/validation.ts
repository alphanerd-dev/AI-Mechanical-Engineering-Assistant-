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

export function validateOpenFOAMLaminarChannelRequest(request: unknown): string[] {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return ["The OpenFOAM benchmark request must be an object."];
  }
  const candidate = request as Partial<OpenFOAMLaminarChannelRequest>;
  const errors: string[] = [];

  if (candidate.caseId !== "laminar-channel-poiseuille-v1") {
    errors.push("Only the versioned laminar-channel Poiseuille benchmark is supported.");
  }
  if (!boundedPositive(candidate.meanVelocityMps, 1e-4, 100)) errors.push("meanVelocityMps must be between 1e-4 and 100 m/s.");
  if (!boundedPositive(candidate.heightM, 1e-4, 10)) errors.push("heightM must be between 1e-4 and 10 m.");
  if (!boundedPositive(candidate.depthM, 1e-4, 10)) errors.push("depthM must be between 1e-4 and 10 m.");
  if (!boundedPositive(candidate.densityKgM3, 0.1, 20000)) errors.push("densityKgM3 must be between 0.1 and 20000 kg/m3.");
  if (!boundedPositive(candidate.kinematicViscosityM2PerS, 1e-9, 1e-2)) {
    errors.push("kinematicViscosityM2PerS must be between 1e-9 and 1e-2 m2/s.");
  }

  if (
    finitePositive(candidate.meanVelocityMps) &&
    finitePositive(candidate.heightM) &&
    finitePositive(candidate.kinematicViscosityM2PerS)
  ) {
    const reynoldsNumber = candidate.meanVelocityMps * 2 * candidate.heightM /
      candidate.kinematicViscosityM2PerS;
    if (!Number.isFinite(reynoldsNumber) || reynoldsNumber >= 1000) {
      errors.push("The benchmark is restricted to laminar cases with hydraulic-diameter Reynolds number below 1000.");
    }
    const bodyForce = 12 * candidate.kinematicViscosityM2PerS *
      candidate.meanVelocityMps / (candidate.heightM * candidate.heightM);
    if (!Number.isFinite(bodyForce) || bodyForce <= 0) {
      errors.push("The derived Poiseuille body-force acceleration is outside the finite numeric range.");
    }
  }

  if (!validInteger(candidate.mesh?.cellsVertical, 20, 200)) {
    errors.push("mesh.cellsVertical must be an integer between 20 and 200.");
  }
  if (!validInteger(candidate.solver?.maxIterations, 50, 10000)) {
    errors.push("solver.maxIterations must be an integer between 50 and 10000.");
  }
  if (
    typeof candidate.solver?.residualTolerance !== "number" ||
    !Number.isFinite(candidate.solver.residualTolerance) ||
    candidate.solver.residualTolerance < 1e-10 ||
    candidate.solver.residualTolerance > 1e-3
  ) {
    errors.push("solver.residualTolerance must be between 1e-10 and 1e-3.");
  }
  if (!validInteger(candidate.solver?.timeoutSeconds, 5, 600)) {
    errors.push("solver.timeoutSeconds must be an integer between 5 and 600.");
  }
  return unique(errors);
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

function validateArtifactSet(artifacts: unknown): string[] {
  if (!Array.isArray(artifacts)) return ["The solver artifact list is missing."];
  const errors: string[] = [];
  const requiredKinds: OpenFOAMRunArtifact["kind"][] = [
    "MESH",
    "VELOCITY_FIELD",
    "PRESSURE_FIELD",
    "SOLVER_LOG"
  ];
  const typedArtifacts = artifacts as OpenFOAMRunArtifact[];
  for (const kind of requiredKinds) {
    if (!typedArtifacts.some(artifact => artifact?.kind === kind)) {
      errors.push(`The ${kind} result artifact is missing.`);
    }
  }
  for (const artifact of typedArtifacts) {
    if (
      !artifact ||
      typeof artifact.path !== "string" ||
      typeof artifact.mediaType !== "string" ||
      typeof artifact.sha256 !== "string" ||
      !artifact.path.trim() ||
      artifact.path.startsWith("/") ||
      artifact.path.split(/[\\/]/).includes("..") ||
      !artifact.mediaType.trim() ||
      !SHA256_PATTERN.test(artifact.sha256)
    ) {
      errors.push("An output artifact has unsafe path metadata or an invalid SHA-256 digest.");
    }
  }
  return errors;
}

function isVelocitySample(value: unknown): value is OpenFOAMVelocitySample {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sample = value as Partial<OpenFOAMVelocitySample>;
  return typeof sample.yM === "number" &&
    Number.isFinite(sample.yM) &&
    typeof sample.axialVelocityMps === "number" &&
    Number.isFinite(sample.axialVelocityMps);
}

export function validateOpenFOAMLaminarChannelResult(
  request: OpenFOAMLaminarChannelRequest,
  result: unknown
): OpenFOAMLaminarChannelValidation {
  const checks: CFDValidationCheck[] = [];
  const blockingReasons: string[] = [];
  const missing: string[] = [];
  const reynoldsNumber = request.meanVelocityMps * 2 * request.heightM /
    request.kinematicViscosityM2PerS;
  const expectedMassFluxKgS = expectedPoiseuilleMassFluxKgS(request);

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      status: "INCOMPLETE",
      reynoldsNumber,
      expectedMassFluxKgS,
      checks,
      blockingReasons: ["The OpenFOAM worker returned no result object."],
      warnings: []
    };
  }

  const output = result as Partial<OpenFOAMLaminarChannelResult>;
  const warnings = Array.isArray(output.warnings)
    ? output.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];

  const completed = output.status === "COMPLETED" && output.converged === true;
  checks.push({
    name: "solver_completion",
    pass: completed,
    message: completed ? "OpenFOAM completed the laminar benchmark." : "OpenFOAM did not complete a converged benchmark."
  });
  if (!completed) blockingReasons.push("The OpenFOAM benchmark did not complete with converged=true.");

  const versionPass = output.solver === "OpenFOAM" && output.solverVersion === "14";
  checks.push({
    name: "solver_version",
    pass: versionPass,
    message: versionPass ? "The result identifies OpenFOAM 14." : "The result does not identify the pinned OpenFOAM 14 runtime."
  });
  if (!versionPass) blockingReasons.push("The result must identify the pinned OpenFOAM 14 solver runtime.");

  const meshValid = Number.isInteger(output.meshCells) &&
    output.meshCells === request.mesh.cellsVertical;
  checks.push({
    name: "mesh_cardinality",
    pass: meshValid,
    measured: output.meshCells,
    expected: request.mesh.cellsVertical,
    message: meshValid
      ? "The mesh cell count matches the requested half-channel mesh."
      : "The mesh cell count does not match the requested half-channel mesh."
  });
  if (!meshValid) blockingReasons.push("The generated mesh does not match the requested cell count.");

  if (typeof output.massFluxKgS !== "number" || !Number.isFinite(output.massFluxKgS)) {
    missing.push("The integrated mass-flow result is missing or non-finite.");
  } else if (output.massFluxKgS <= 0) {
    blockingReasons.push("The integrated mass flow must be positive.");
  }

  if (!output.residuals || typeof output.residuals !== "object") {
    missing.push("Final solver residuals are missing.");
  } else if (
    typeof output.residuals.pressure !== "number" ||
    !Number.isFinite(output.residuals.pressure) ||
    output.residuals.pressure < 0 ||
    typeof output.residuals.velocity !== "number" ||
    !Number.isFinite(output.residuals.velocity) ||
    output.residuals.velocity < 0
  ) {
    blockingReasons.push("Final solver residuals must be finite and non-negative.");
  }

  if (!Array.isArray(output.velocityProfile) || output.velocityProfile.length < 5) {
    missing.push("At least five velocity-profile samples are required.");
  }
  const artifactErrors = validateArtifactSet(output.artifacts);
  blockingReasons.push(...artifactErrors.filter(error => error.includes("unsafe path metadata")));
  missing.push(...artifactErrors.filter(error => !error.includes("unsafe path metadata")));

  if (missing.length) {
    return {
      status: blockingReasons.length ? "FAIL" : "INCOMPLETE",
      reynoldsNumber,
      expectedMassFluxKgS,
      checks,
      blockingReasons: unique([...blockingReasons, ...missing]),
      warnings
    };
  }

  const profile = [...output.velocityProfile!];
  const samplesValid = profile.every(isVelocitySample);
  const coordinatesValid = samplesValid && profile.every(sample =>
    sample.yM >= 0 && sample.yM <= request.heightM / 2
  );
  const coordinatesUnique = samplesValid &&
    new Set(profile.map(sample => sample.yM)).size === profile.length;
  let normalizedProfileRmse: number | undefined;
  let maxAbsoluteError = 0;
  let profilePass = false;

  if (!coordinatesValid || !coordinatesUnique) {
    blockingReasons.push("The velocity profile contains invalid, out-of-domain or duplicate sample coordinates.");
  } else {
    const orderedProfile = [...profile].sort((a, b) => a.yM - b.yM);
    let squaredErrorSum = 0;
    for (const sample of orderedProfile) {
      const expected = poiseuilleAxialVelocity(sample.yM, request.heightM, request.meanVelocityMps);
      const error = sample.axialVelocityMps - expected;
      squaredErrorSum += error * error;
      maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(error));
    }
    const expectedMaxVelocity = 1.5 * request.meanVelocityMps;
    normalizedProfileRmse = Math.sqrt(squaredErrorSum / orderedProfile.length) / expectedMaxVelocity;
    profilePass = normalizedProfileRmse <= PROFILE_NRMSE_TOLERANCE &&
      maxAbsoluteError <= 0.05 * expectedMaxVelocity;
    if (!profilePass) blockingReasons.push("The velocity profile exceeds the analytical Poiseuille error tolerance.");
  }
  checks.push({
    name: "poiseuille_velocity_profile",
    pass: profilePass,
    measured: normalizedProfileRmse,
    expected: 0,
    tolerance: PROFILE_NRMSE_TOLERANCE,
    message: profilePass
      ? "The velocity profile is within the analytical Poiseuille tolerance."
      : "The velocity profile deviates from the analytical Poiseuille solution."
  });

  const massFluxRelativeError = Math.abs(output.massFluxKgS! - expectedMassFluxKgS) /
    expectedMassFluxKgS;
  const massFlowPass = Number.isFinite(massFluxRelativeError) &&
    massFluxRelativeError <= MASS_FLOW_RELATIVE_TOLERANCE;
  checks.push({
    name: "integrated_mass_flow",
    pass: massFlowPass,
    measured: massFluxRelativeError,
    expected: 0,
    tolerance: MASS_FLOW_RELATIVE_TOLERANCE,
    message: massFlowPass
      ? "Integrated mass flow matches the analytical channel flow rate."
      : "Integrated mass flow deviates from the analytical channel flow rate."
  });
  if (!massFlowPass) blockingReasons.push("Integrated mass-flow error exceeds 0.5%.");

  const residuals = output.residuals!;
  const residualsPass = residuals.pressure <= request.solver.residualTolerance &&
    residuals.velocity <= request.solver.residualTolerance;
  checks.push({
    name: "solver_residuals",
    pass: residualsPass,
    message: residualsPass
      ? "Final pressure and velocity residuals meet the requested tolerance."
      : "Final pressure or velocity residuals exceed the requested tolerance."
  });
  if (!residualsPass) blockingReasons.push("Final solver residuals exceed the requested tolerance.");

  return {
    status: blockingReasons.length ? "FAIL" : "PASS",
    reynoldsNumber,
    expectedMassFluxKgS,
    normalizedProfileRmse,
    massFluxRelativeError,
    checks,
    blockingReasons: unique(blockingReasons),
    warnings
  };
}
