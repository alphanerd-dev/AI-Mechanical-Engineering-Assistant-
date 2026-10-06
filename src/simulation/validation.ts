import {FEAResult,SimulationValidation} from "./types.js";
export function validateStaticStructural(result:FEAResult,yieldStrengthMpa:number):SimulationValidation{
  if(!Number.isFinite(yieldStrengthMpa)||yieldStrengthMpa<=0) throw new Error("Valid yield strength is required.");
  const checks=[
    {name:"solver_convergence",pass:result.converged,message:result.converged?"Solver reported convergence.":"Solver did not converge."},
    {name:"finite_stress",pass:Number.isFinite(result.maxStressMpa)&&result.maxStressMpa>=0,message:"Maximum stress must be finite and non-negative."},
    {name:"yield_check",pass:result.maxStressMpa<yieldStrengthMpa,message:`Maximum stress ${result.maxStressMpa} MPa vs yield strength ${yieldStrengthMpa} MPa.`},
    {name:"finite_displacement",pass:Number.isFinite(result.maxDisplacementMm)&&result.maxDisplacementMm>=0,message:"Maximum displacement must be finite and non-negative."}
  ];
  return {pass:checks.every(c=>c.pass),checks};
}
