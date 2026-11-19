export type FEAAnalysisKind="STATIC_STRUCTURAL";
export type FEARequestedOutput="DISPLACEMENT"|"STRESS"|"REACTION_FORCE";
export type FEAMeshFormat="CALCULIX_INP";
export type FEAElementType="C3D4";

export interface FEAMaterialSpec{
  name:string;
  youngsModulusMpa:number;
  poissonRatio:number;
  densityKgM3?:number;
  yieldStrengthMpa?:number;
}

export interface FEALoadCase{
  id:string;
  type:"FORCE";
  nodeSet:string;
  magnitudeN:number;
  direction:[number,number,number];
}

export interface FEABoundaryCondition{
  id:string;
  type:"FIXED";
  nodeSet:string;
}

export interface FEAMeshReference{
  artifactId:string;
  path:string;
  format:FEAMeshFormat;
  elementType:FEAElementType;
  nodeSets:string[];
}

export interface GmshMeshRequest{
  id:string;
  geometry:{
    kind:"BOX";
    lengthMm:number;
    widthMm:number;
    heightMm:number;
  };
  elementSizeMm:number;
}

export interface GmshMeshResult{
  success:boolean;
  provider:string;
  providerVersion:string;
  meshArtifactPath?:string;
  format:FEAMeshFormat;
  elementType:FEAElementType;
  nodeCount:number;
  elementCount:number;
  nodeSets:string[];
  warnings:string[];
  error?:string;
}

export interface FEACantileverBoxBenchmarkRequest {
  analysis: "STATIC_STRUCTURAL";
  benchmark: "cantilever_box";
  dimensionsMm: { length: number; width: number; height: number };
  material: { youngsModulusMpa: number; poissonRatio: number };
  totalForceN: number;
  elementSizeMm: number;
}
export interface FEABenchmarkReference {
  referenceId: string;
  units: { length: "mm"; force: "N"; modulus: "MPa"; deflection: "mm" };
  sectionSecondMomentMm4: number;
  bendingDeflectionMm: number;
  firstOrderShearDeflectionMm: number;
  expectedTipDeflectionMm: number;
  measuredMaximumDisplacementMm: number;
  displacementRelativeError: number;
  displacementRelativeTolerance: number;
  displacementPassed: boolean;
  expectedSupportReactionN: { x: number; y: number; z: number };
  measuredSupportReactionN: { x: number; y: number; z: number };
  reactionRelativeError: number;
  reactionRelativeTolerance: number;
  reactionPassed: boolean;
  passed: boolean;
}

export interface FEAStaticStructuralRequest{
  id:string;
  modelArtifactId:string;
  mesh:FEAMeshReference;
  material:FEAMaterialSpec;
  loads:FEALoadCase[];
  boundaryConditions:FEABoundaryCondition[];
  requestedOutputs:readonly FEARequestedOutput[];
  timeoutMs:number;
}

export interface FEAResultArtifact{
  kind:"FEA_MODEL"|"FEA_RESULT";
  path:string;
  mediaType:string;
  sha256:string;
}

export interface FEAStaticStructuralResult{
  success?:boolean;
  analysis:FEAAnalysisKind;
  solver:string;
  solverVersion:string;
  converged:boolean;
  exitCode:number;
  mesh:{
    nodeCount:number;
    elementCount:number;
    elementType:FEAElementType;
  };
  maxVonMisesStressMpa?:number;
  maxDisplacementMm?:number;
  reactionForcesN?:{
    x:number;
    y:number;
    z:number;
  };
  artifacts:FEAResultArtifact[];
  warnings:string[];
  benchmarkReference?:FEABenchmarkReference;
}
