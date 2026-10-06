import {FEAStaticStructuralRequest,FEAStaticStructuralResult,GmshMeshRequest,GmshMeshResult} from "./types.js";

export interface FEAValidationCheck{
  name:string;
  pass:boolean;
  message:string;
}

export interface FEAExecutionValidation{
  status:"PASS"|"INCOMPLETE"|"FAIL";
  checks:FEAValidationCheck[];
  blockingReasons:string[];
  warnings:string[];
}

function finitePositive(value:unknown):value is number{
  return typeof value==="number"&&Number.isFinite(value)&&value>0;
}

export function validateGmshMeshRequest(request:GmshMeshRequest):string[]{
  const errors:string[]=[];
  if(!request.id?.trim()) errors.push("Mesh request id is required.");
  if(request.geometry.kind!=="BOX") errors.push("Only BOX geometry is supported by the reference Gmsh provider.");
  for(const [name,value] of Object.entries(request.geometry)){
    if(name!=="kind"&&!finitePositive(value)) errors.push(`Geometry ${name} must be a positive finite value.`);
  }
  if(!finitePositive(request.elementSizeMm)) errors.push("elementSizeMm must be a positive finite value.");
  return errors;
}

export function validateStaticStructuralRequest(request:FEAStaticStructuralRequest):string[]{
  const errors:string[]=[];
  if(!request.id?.trim()) errors.push("FEA request id is required.");
  if(!request.modelArtifactId?.trim()) errors.push("A modelArtifactId is required.");
  if(!request.mesh?.artifactId?.trim()) errors.push("A mesh artifactId is required.");
  if(!request.mesh?.path?.trim()) errors.push("A mesh path is required.");
  if(request.mesh.format!=="CALCULIX_INP") errors.push("Only CALCULIX_INP meshes are supported.");
  if(request.mesh.elementType!=="C3D4") errors.push("The V1.18 reference runtime supports C3D4 tetrahedra only.");
  if(!request.mesh.nodeSets?.length) errors.push("At least one mesh node set is required.");
  if(!request.material?.name?.trim()) errors.push("Material name is required.");
  if(!finitePositive(request.material.youngsModulusMpa)) errors.push("Young's modulus must be a positive finite value.");
  if(typeof request.material.poissonRatio!=="number"||!Number.isFinite(request.material.poissonRatio)||request.material.poissonRatio<=-1||request.material.poissonRatio>=0.5){
    errors.push("Poisson ratio must be finite and between -1 and 0.5.");
  }
  if(!Array.isArray(request.loads)||request.loads.length===0) errors.push("At least one force load case is required.");
  request.loads?.forEach(load=>{
    if(!load.id?.trim()) errors.push("Every load case needs an id.");
    if(!load.nodeSet?.trim()) errors.push("Every load case needs a node set.");
    if(!finitePositive(Math.abs(load.magnitudeN))) errors.push(`Load ${load.id||"<unknown>"} must have a non-zero finite magnitude.`);
    const norm=Math.sqrt(load.direction.reduce((sum,value)=>sum+value*value,0));
    if(!Number.isFinite(norm)||norm===0) errors.push(`Load ${load.id||"<unknown>"} direction must be non-zero and finite.`);
  });
  if(!Array.isArray(request.boundaryConditions)||request.boundaryConditions.length===0) errors.push("At least one boundary condition is required.");
  request.boundaryConditions?.forEach(bc=>{
    if(!bc.id?.trim()) errors.push("Every boundary condition needs an id.");
    if(bc.type!=="FIXED") errors.push(`Boundary condition ${bc.id||"<unknown>"} has unsupported type.`);
    if(!bc.nodeSet?.trim()) errors.push(`Boundary condition ${bc.id||"<unknown>"} needs a node set.`);
  });
  if(!Array.isArray(request.requestedOutputs)||request.requestedOutputs.length===0) errors.push("At least one requested output is required.");
  if(!Number.isInteger(request.timeoutMs)||request.timeoutMs<1000||request.timeoutMs>120000) errors.push("timeoutMs must be an integer between 1000 and 120000.");
  return errors;
}

export function validateFEAExecution(
  result:FEAStaticStructuralResult,
  requestedOutputs:FEAStaticStructuralRequest["requestedOutputs"]
):FEAExecutionValidation{
  const checks:FEAValidationCheck[]=[];
  const blockingReasons:string[]=[];
  const warnings:string[]=[];

  const solverOk=result.exitCode===0;
  checks.push({name:"solver_exit_code",pass:solverOk,message:solverOk?"CalculiX exited successfully.":"CalculiX returned a non-zero exit code."});
  if(!solverOk) blockingReasons.push("The solver did not exit successfully.");

  checks.push({name:"solver_convergence",pass:result.converged,message:result.converged?"The solver reported a completed static analysis.":"The solver did not report a completed static analysis."});
  if(!result.converged) blockingReasons.push("The solver did not produce a converged result.");

  const meshOk=Number.isInteger(result.mesh.nodeCount)&&result.mesh.nodeCount>0&&Number.isInteger(result.mesh.elementCount)&&result.mesh.elementCount>0;
  checks.push({name:"mesh_cardinality",pass:meshOk,message:meshOk?"The normalized mesh contains nodes and elements.":"The normalized mesh is empty or invalid."});
  if(!meshOk) blockingReasons.push("Mesh cardinality is invalid.");

  const requiresStress=requestedOutputs.includes("STRESS");
  const stressValue=result.maxVonMisesStressMpa;
  const stressOk=!requiresStress||(typeof stressValue==="number"&&Number.isFinite(stressValue)&&stressValue>=0);
  checks.push({name:"finite_stress",pass:stressOk,message:stressOk?"Requested stress output is finite.":"Requested stress output is missing or invalid."});
  if(requiresStress&&!stressOk) blockingReasons.push("Requested stress output is missing or invalid.");

  const requiresDisplacement=requestedOutputs.includes("DISPLACEMENT");
  const displacementValue=result.maxDisplacementMm;
  const displacementOk=!requiresDisplacement||(typeof displacementValue==="number"&&Number.isFinite(displacementValue)&&displacementValue>=0);
  checks.push({name:"finite_displacement",pass:displacementOk,message:displacementOk?"Requested displacement output is finite.":"Requested displacement output is missing or invalid."});
  if(requiresDisplacement&&!displacementOk) blockingReasons.push("Requested displacement output is missing or invalid.");

  const requiresReaction=requestedOutputs.includes("REACTION_FORCE");
  const reactionOk=!requiresReaction||(
    !!result.reactionForcesN &&
    Number.isFinite(result.reactionForcesN.x)&&
    Number.isFinite(result.reactionForcesN.y)&&
    Number.isFinite(result.reactionForcesN.z)
  );
  checks.push({name:"finite_reaction_forces",pass:reactionOk,message:reactionOk?"Requested reaction-force output is finite.":"Requested reaction-force output is missing or invalid."});
  if(requiresReaction&&!reactionOk) blockingReasons.push("Requested reaction-force output is missing or invalid.");

  if(result.warnings.length) warnings.push(...result.warnings);

  return {
    status:blockingReasons.length?"FAIL":"PASS",
    checks,
    blockingReasons,
    warnings
  };
}
