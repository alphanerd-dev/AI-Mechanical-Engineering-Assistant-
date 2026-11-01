export const SHAFT_STATIC_DESIGN_CAPABILITY = "ANALYSIS.SHAFT_STATIC_DESIGN" as const;
export const SHAFT_STATIC_DESIGN_VERSION = "1.0.0" as const;
export const SHAFT_STATIC_DESIGN_VALIDATOR_VERSION = "1.0.0" as const;

export interface ShaftStaticDesignInput {
  powerKw: number;
  speedRpm: number;
  bearingSpanMm: number;
  gearPositionFromLeftMm: number;
  pitchDiameterMm: number;
  pressureAngleDeg: number;
  axialLoadN: number;
  materialGrade: string;
  yieldStrengthMpa: number;
  ultimateTensileStrengthMpa: number;
  designFactor: number;
  bendingStressFactorKb: number;
  torsionalStressFactorKts: number;
  candidateDiameterMm?: number;
}

export interface ShaftStaticDesignResult {
  capability: typeof SHAFT_STATIC_DESIGN_CAPABILITY;
  version: typeof SHAFT_STATIC_DESIGN_VERSION;
  status: "CALCULATED";
  input: ShaftStaticDesignInput;
  angularVelocityRadPerSecond: number;
  torqueNm: number;
  tangentialForceN: number;
  radialForceN: number;
  resultantTransverseForceN: number;
  leftBearingReactionN: number;
  rightBearingReactionN: number;
  maximumBendingMomentNm: number;
  bendingMomentLocationMm: number;
  allowableVonMisesStressMpa: number;
  minimumDiameterMm: number;
  preferredDiameterMm: number;
  candidateDiameterMm: number;
  axialStressMpa: number;
  bendingStressMpa: number;
  combinedNormalStressMpa: number;
  torsionalShearStressMpa: number;
  vonMisesStressMpa: number;
  achievedYieldFactorOfSafety: number;
  passesStaticYield: boolean;
  equations: {
    torque: string;
    gearForces: string;
    reactions: string;
    bendingMoment: string;
    stress: string;
    yield: string;
  };
  assumptions: string[];
  limitations: string[];
}

const PREFERRED_DIAMETERS_MM = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 36, 40, 45, 50, 55, 60, 63, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200];

function requireFinitePositive(value: number, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(field + " must be a positive finite number.");
  }
}

function validateShaftStaticDesignInput(input: ShaftStaticDesignInput): void {
  if (!input || typeof input !== "object") throw new Error("A shaft design input object is required.");
  requireFinitePositive(input.powerKw, "powerKw");
  requireFinitePositive(input.speedRpm, "speedRpm");
  requireFinitePositive(input.bearingSpanMm, "bearingSpanMm");
  requireFinitePositive(input.gearPositionFromLeftMm, "gearPositionFromLeftMm");
  if (input.gearPositionFromLeftMm >= input.bearingSpanMm) {
    throw new Error("gearPositionFromLeftMm must be strictly inside the bearing span.");
  }
  requireFinitePositive(input.pitchDiameterMm, "pitchDiameterMm");
  if (!Number.isFinite(input.pressureAngleDeg) || input.pressureAngleDeg <= 0 || input.pressureAngleDeg >= 90) {
    throw new Error("pressureAngleDeg must be greater than 0 and less than 90 degrees.");
  }
  if (!Number.isFinite(input.axialLoadN)) throw new Error("axialLoadN must be a finite number.");
  if (typeof input.materialGrade !== "string" || !input.materialGrade.trim() || input.materialGrade.length > 100) {
    throw new Error("materialGrade must be a non-empty string of at most 100 characters.");
  }
  requireFinitePositive(input.yieldStrengthMpa, "yieldStrengthMpa");
  requireFinitePositive(input.ultimateTensileStrengthMpa, "ultimateTensileStrengthMpa");
  if (input.ultimateTensileStrengthMpa < input.yieldStrengthMpa) {
    throw new Error("ultimateTensileStrengthMpa must not be lower than yieldStrengthMpa.");
  }
  requireFinitePositive(input.designFactor, "designFactor");
  if (input.designFactor < 1) throw new Error("designFactor must be at least 1.");
  requireFinitePositive(input.bendingStressFactorKb, "bendingStressFactorKb");
  requireFinitePositive(input.torsionalStressFactorKts, "torsionalStressFactorKts");
  if (input.bendingStressFactorKb < 1 || input.torsionalStressFactorKts < 1) {
    throw new Error("Stress multiplication factors Kb and Kts must be at least 1.");
  }
  if (input.candidateDiameterMm !== undefined) requireFinitePositive(input.candidateDiameterMm, "candidateDiameterMm");
}

/** Static-yield check for a simply supported solid shaft with a single gear load. */
export function calculateShaftStaticDesign(input: ShaftStaticDesignInput): ShaftStaticDesignResult {
  validateShaftStaticDesignInput(input);

  const angularVelocityRadPerSecond = (2 * Math.PI * input.speedRpm) / 60;
  const torqueNm = (input.powerKw * 1000) / angularVelocityRadPerSecond;
  const pitchRadiusM = input.pitchDiameterMm / 2000;
  const tangentialForceN = torqueNm / pitchRadiusM;
  const radialForceN = tangentialForceN * Math.tan((input.pressureAngleDeg * Math.PI) / 180);
  const resultantTransverseForceN = Math.hypot(tangentialForceN, radialForceN);
  const spanM = input.bearingSpanMm / 1000;
  const gearPositionM = input.gearPositionFromLeftMm / 1000;
  const rightDistanceM = spanM - gearPositionM;
  const leftBearingReactionN = resultantTransverseForceN * rightDistanceM / spanM;
  const rightBearingReactionN = resultantTransverseForceN * gearPositionM / spanM;
  const maximumBendingMomentNm = resultantTransverseForceN * gearPositionM * rightDistanceM / spanM;
  const allowableVonMisesStressMpa = input.yieldStrengthMpa / input.designFactor;

  const stressAtDiameter = (diameterMm: number) => {
    const diameterM = diameterMm / 1000;
    const areaM2 = Math.PI * diameterM ** 2 / 4;
    const axialStressMpa = Math.abs(input.axialLoadN) / areaM2 / 1e6;
    const bendingStressMpa = (32 * input.bendingStressFactorKb * maximumBendingMomentNm) /
      (Math.PI * diameterM ** 3) / 1e6;
    const torsionalShearStressMpa = (16 * input.torsionalStressFactorKts * torqueNm) /
      (Math.PI * diameterM ** 3) / 1e6;
    // Conservative critical-surface combination: axial and bending magnitudes add.
    const combinedNormalStressMpa = axialStressMpa + bendingStressMpa;
    const vonMisesStressMpa = Math.hypot(combinedNormalStressMpa, Math.sqrt(3) * torsionalShearStressMpa);
    return { axialStressMpa, bendingStressMpa, combinedNormalStressMpa, torsionalShearStressMpa, vonMisesStressMpa };
  };

  // Bracket a feasible diameter and use bisection; axial stress scales with d^-2.
  let low = 1e-6;
  if (stressAtDiameter(low).vonMisesStressMpa <= allowableVonMisesStressMpa) {
    throw new Error("The minimum-diameter root is below the supported numerical resolution.");
  }
  let high = 1;
  let iterations = 0;
  while (stressAtDiameter(high).vonMisesStressMpa > allowableVonMisesStressMpa && iterations < 80) {
    high *= 2;
    iterations += 1;
  }
  if (iterations >= 80 || !Number.isFinite(high)) {
    throw new Error("Could not bracket a feasible shaft diameter within the supported numeric range.");
  }
  for (let index = 0; index < 100; index += 1) {
    const middle = (low + high) / 2;
    if (stressAtDiameter(middle).vonMisesStressMpa > allowableVonMisesStressMpa) low = middle;
    else high = middle;
  }
  const minimumDiameterMm = high;
  if (stressAtDiameter(minimumDiameterMm).vonMisesStressMpa > allowableVonMisesStressMpa * (1 + 1e-9)) {
    throw new Error("The numerical diameter solution did not satisfy the static-yield inequality.");
  }
  const preferredDiameterMm = PREFERRED_DIAMETERS_MM.find((diameter) => diameter >= minimumDiameterMm)
    ?? Math.ceil(minimumDiameterMm);
  const candidateDiameterMm = input.candidateDiameterMm ?? preferredDiameterMm;
  const candidateStress = stressAtDiameter(candidateDiameterMm);
  const achievedYieldFactorOfSafety = input.yieldStrengthMpa / candidateStress.vonMisesStressMpa;

  const finiteResults = [
    angularVelocityRadPerSecond, torqueNm, tangentialForceN, radialForceN,
    resultantTransverseForceN, leftBearingReactionN, rightBearingReactionN,
    maximumBendingMomentNm, allowableVonMisesStressMpa, minimumDiameterMm,
    preferredDiameterMm, candidateDiameterMm, candidateStress.axialStressMpa,
    candidateStress.bendingStressMpa, candidateStress.combinedNormalStressMpa,
    candidateStress.torsionalShearStressMpa, candidateStress.vonMisesStressMpa,
    achievedYieldFactorOfSafety
  ];
  if (finiteResults.some((value) => !Number.isFinite(value))) {
    throw new Error("The shaft design calculation produced a non-finite result.");
  }

  return {
    capability: SHAFT_STATIC_DESIGN_CAPABILITY,
    version: SHAFT_STATIC_DESIGN_VERSION,
    status: "CALCULATED",
    input: { ...input, materialGrade: input.materialGrade.trim() },
    angularVelocityRadPerSecond,
    torqueNm,
    tangentialForceN,
    radialForceN,
    resultantTransverseForceN,
    leftBearingReactionN,
    rightBearingReactionN,
    maximumBendingMomentNm,
    bendingMomentLocationMm: input.gearPositionFromLeftMm,
    allowableVonMisesStressMpa,
    minimumDiameterMm,
    preferredDiameterMm,
    candidateDiameterMm,
    axialStressMpa: candidateStress.axialStressMpa,
    bendingStressMpa: candidateStress.bendingStressMpa,
    combinedNormalStressMpa: candidateStress.combinedNormalStressMpa,
    torsionalShearStressMpa: candidateStress.torsionalShearStressMpa,
    vonMisesStressMpa: candidateStress.vonMisesStressMpa,
    achievedYieldFactorOfSafety,
    passesStaticYield: candidateDiameterMm >= minimumDiameterMm &&
      candidateStress.vonMisesStressMpa <= allowableVonMisesStressMpa * (1 + 1e-10),
    equations: {
      torque: "omega = 2*pi*n/60; T = P/omega",
      gearForces: "Ft = 2*T/dp; Fr = Ft*tan(phi); F = sqrt(Ft^2 + Fr^2)",
      reactions: "RA = F*(L-a)/L; RB = F*a/L",
      bendingMoment: "Mmax = F*a*(L-a)/L at the point load",
      stress: "sigma_a = 4*abs(Fa)/(pi*d^2); sigma_b = 32*Kb*M/(pi*d^3); tau = 16*Kts*T/(pi*d^3); sigma_VM = sqrt((sigma_a+sigma_b)^2 + 3*tau^2)",
      yield: "sigma_VM <= Sy/nd"
    },
    assumptions: [
      "The shaft is modelled as a simply supported solid circular beam with one gear load at the stated location.",
      "The gear applies tangential and radial forces derived from the transmitted torque, pitch diameter and pressure angle.",
      "The maximum transverse resultant is treated as a single equivalent point load for the bending-moment magnitude.",
      "Axial and bending normal-stress magnitudes are conservatively added at the critical surface because the axial load direction is not resolved.",
      "Kb and Kts are user-supplied static stress multipliers; they are not fatigue factors and are not inferred from keyway geometry.",
      "The design factor is applied to material yield strength for a von Mises static-yield check.",
      "Sut is recorded as material context but is not used by this static-yield criterion; fatigue assessment requires a separate method.",
      "The preferred diameter is selected from this calculation module’s configured preliminary size series, not a complete standards-based shaft, fit or bearing selection."
    ],
    limitations: [
      "This is preliminary static-yield sizing, not a complete shaft design or an ASME code compliance calculation.",
      "Fatigue under rotating bending, notch sensitivity, actual keyway geometry, key shear/crushing, deflection, slope, critical speed, bearing life, fits, tolerances and stress-gradient effects are not evaluated.",
      "Gear axial thrust, helical-gear geometry, multiple loads, shaft self-weight, overhung loads, bearing stiffness and detailed load directions require a more complete model."
    ]
  };
}
