import { FEAResult } from "./types.js";

export interface FactorOfSafetyCheck {
  factorOfSafety: number;
  minimumFactorOfSafety: number;
  pass: boolean;
  message: string;
}

export interface MeshConvergenceInput {
  coarse: FEAResult;
  refined: FEAResult;
  maximumRelativeStressChange: number;
}

export interface MeshConvergenceCheck {
  relativeStressChange: number;
  maximumRelativeStressChange: number;
  pass: boolean;
  message: string;
}

export function calculateFactorOfSafety(yieldStrengthMpa: number, maxStressMpa: number): number {
  if (!Number.isFinite(yieldStrengthMpa) || yieldStrengthMpa <= 0) throw new Error("Valid yield strength is required.");
  if (!Number.isFinite(maxStressMpa) || maxStressMpa < 0) throw new Error("Valid maximum stress is required.");
  if (maxStressMpa === 0) return Number.POSITIVE_INFINITY;
  return yieldStrengthMpa / maxStressMpa;
}

export function checkFactorOfSafety(yieldStrengthMpa: number, maxStressMpa: number, minimumFactorOfSafety: number): FactorOfSafetyCheck {
  if (!Number.isFinite(minimumFactorOfSafety) || minimumFactorOfSafety <= 0) throw new Error("A positive minimum factor of safety is required.");
  const factorOfSafety = calculateFactorOfSafety(yieldStrengthMpa, maxStressMpa);
  const pass = factorOfSafety >= minimumFactorOfSafety;
  return { factorOfSafety, minimumFactorOfSafety, pass, message: `Factor of safety ${Number.isFinite(factorOfSafety) ? factorOfSafety.toFixed(3) : "infinite"} vs required ${minimumFactorOfSafety}.` };
}

export function checkMeshConvergence(input: MeshConvergenceInput): MeshConvergenceCheck {
  const { coarse, refined, maximumRelativeStressChange } = input;
  if (!Number.isFinite(maximumRelativeStressChange) || maximumRelativeStressChange < 0) throw new Error("A non-negative convergence tolerance is required.");
  if (!Number.isFinite(coarse.maxStressMpa) || coarse.maxStressMpa < 0 || !Number.isFinite(refined.maxStressMpa) || refined.maxStressMpa < 0) throw new Error("Mesh convergence requires finite non-negative stresses.");
  if (coarse.maxStressMpa === 0) {
    const pass = refined.maxStressMpa === 0;
    return { relativeStressChange: pass ? 0 : Infinity, maximumRelativeStressChange, pass, message: "Coarse-mesh stress is zero; refinement must also produce zero stress for this check." };
  }
  const relativeStressChange = Math.abs(refined.maxStressMpa - coarse.maxStressMpa) / coarse.maxStressMpa;
  const pass = relativeStressChange <= maximumRelativeStressChange;
  return { relativeStressChange, maximumRelativeStressChange, pass, message: `Relative maximum-stress change ${(relativeStressChange * 100).toFixed(2)}% vs allowed ${(maximumRelativeStressChange * 100).toFixed(2)}%.` };
}
