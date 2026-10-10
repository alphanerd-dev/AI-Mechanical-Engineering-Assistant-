import { CADAcceptance, evaluateCADAcceptance } from "./acceptance.js";
import { CADArtifact, GeometryValidation } from "./artifacts.js";
import { CADArtifactManifest } from "./artifact-manifest.js";
import { ArtifactProvenance, EngineeringArtifact, EvidenceRecord } from "../artifacts/engineering-artifacts.js";
import { CADExecutionResult } from "./execution.js";
import { createCADSourceSha256, validateCADArtifactProvenance } from "./provenance.js";

export interface CADArtifactBundle {
  cad:CADArtifact;
  engineering:EngineeringArtifact;
  evidence:EvidenceRecord;
  acceptance:CADAcceptance;
}

export interface CADValidationReceipt {
  id:string;
  projectId:string;
  artifactId:string;
  modelIdentityId:string;
  sourceSha256:string;
  backend:string;
  /** Provider id from the trusted CAD router, not worker-supplied text. */
  validatorProviderId:string;
  validatorVersion:string;
  /** SHA-256 of the exact bytes inspected by the validator. */
  artifactSha256:string;
  checkedBy:string;
  checkedAt:string;
  validation:GeometryValidation;
}

export interface CADArtifactBundleResult {
  status:"ACCEPTED"|"REJECTED"|"INCOMPLETE";
  acceptance:CADAcceptance;
  bundle?:CADArtifactBundle;
  errors:string[];
  warnings:string[];
}

function nonEmptyString(value:unknown):value is string {
  return typeof value==="string"&&value.trim().length>0;
}

function validDate(value:unknown):value is string {
  return nonEmptyString(value)&&!Number.isNaN(Date.parse(value));
}

function deduplicate(values:string[]):string[] {
  return [...new Set(values)];
}

function incomplete(errors:string[],warnings:string[]=[]):CADArtifactBundleResult {
  return {
    status:"INCOMPLETE",
    acceptance:{accepted:false,status:"INCOMPLETE",blockingReasons:[],warnings},
    errors,
    warnings
  };
}

/**
 * Creates a bundle only when geometry validation is bound to the exact solid
 * artifact, model identity and source digest represented by the manifest.
 */
export function createCADArtifactBundleFromManifest(
  manifest:CADArtifactManifest,
  receipt:CADValidationReceipt,
  requirementIds:string[]=[]
):CADArtifactBundleResult {
  if (!manifest || !Array.isArray(manifest.artifacts)) {
    return incomplete(["CAD artifact manifest is missing or malformed."]);
  }
  if (manifest.errors?.length) {
    return incomplete([...manifest.errors], [...(manifest.warnings??[])]);
  }
  if (!manifest.provenance) {
    return incomplete(["CAD artifact manifest has no execution provenance."]);
  }

  const cad=manifest.artifacts.find((item)=>item.kind==="SOLID");
  if (!cad || !nonEmptyString(cad.uri)) {
    return incomplete(["A worker-reported solid artifact URI is required before geometry validation can be attached."], [...manifest.warnings]);
  }
  if (!cad.provenance) {
    return incomplete(["Solid artifact has no CAD execution provenance."], [...manifest.warnings]);
  }

  const p=cad.provenance;
  const provenanceValidation=validateCADArtifactProvenance(p,{
    projectId:manifest.provenance.projectId,
    modelIdentityId:manifest.provenance.modelIdentityId,
    executionId:manifest.provenance.executionId,
    providerId:manifest.provenance.providerId,
    backend:manifest.provenance.backend,
    outputUri:cad.uri
  });
  const errors=[...provenanceValidation.errors];
  const root=p as unknown as Record<string,unknown>;
  const manifestProvenance=manifest.provenance as unknown as Record<string,unknown>;
  for (const key of ["schemaVersion","sourceType","projectId","modelIdentityId","executionId","providerId","backend","sourceSha256","sourceFilename","sourceArtifactUri","generatedAt"]) {
    if (root[key] !== manifestProvenance[key]) {
      errors.push("Solid artifact provenance differs from manifest execution provenance at " + key + ".");
    }
  }

  if (!receipt || typeof receipt!=="object") {
    errors.push("A validator-issued CAD validation receipt is required.");
  } else {
    if (!nonEmptyString(receipt.id)) errors.push("CAD validation receipt id is required.");
    if (receipt.projectId !== p.projectId) errors.push("Validation receipt project id does not match the CAD artifact.");
    if (receipt.artifactId !== cad.id) errors.push("Validation receipt does not reference this exact solid artifact.");
    if (receipt.modelIdentityId !== p.modelIdentityId) errors.push("Validation receipt model identity does not match the CAD artifact.");
    if (receipt.sourceSha256 !== p.sourceSha256) errors.push("Validation receipt source digest does not match the generated source.");
    if (receipt.backend !== p.backend) errors.push("Validation receipt backend does not match the generated artifact.");
    if (!nonEmptyString(receipt.validatorProviderId)) errors.push("Validation receipt must identify the host-selected validator provider.");
    if (receipt.validatorProviderId === p.providerId) errors.push("CAD execution and validation must be performed by distinct providers.");
    if (!nonEmptyString(receipt.validatorVersion)) errors.push("Validation receipt must identify the validator version.");
    if (typeof receipt.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.artifactSha256)) errors.push("Validation receipt must contain the host-computed artifact SHA-256 digest.");
    if (p.artifactSha256 !== receipt.artifactSha256) errors.push("Validation receipt artifact digest does not match the exact solid artifact.");
    if (!nonEmptyString(receipt.checkedBy)) errors.push("Validation receipt must identify the geometry validator.");
    if (!validDate(receipt.checkedAt)) errors.push("Validation receipt checkedAt must be a valid date string.");
    if (validDate(receipt.checkedAt) && validDate(p.generatedAt) && Date.parse(receipt.checkedAt)<Date.parse(p.generatedAt)) {
      errors.push("Validation receipt timestamp cannot precede CAD artifact generation.");
    }
    if (receipt.validation?.checkedBy !== receipt.checkedBy) errors.push("Validation result checker does not match the validation receipt.");
  }
  if (errors.length) {
    return incomplete(deduplicate(errors), [...(manifest.warnings??[])]);
  }

  const acceptance=evaluateCADAcceptance(receipt.validation);
  if (acceptance.status==="INCOMPLETE") {
    return {
      status:"INCOMPLETE",
      acceptance,
      errors:[],
      warnings:deduplicate([...(manifest.warnings??[]),...acceptance.warnings])
    };
  }

  const now=receipt.checkedAt;
  const reqs=deduplicate([...(cad.requirementIds??[]),...requirementIds]);
  const validationStatus=acceptance.accepted?"PASS":"FAIL";
  const informationStatus=acceptance.accepted?"VERIFIED":"CALCULATED";
  const evidenceId=cad.id+"-geometry-"+createCADSourceSha256(receipt.id).slice(0,16);
  const artifact:CADArtifact={
    ...cad,
    validationStatus,
    informationStatus,
    requirementIds:reqs,
    evidenceIds:deduplicate([...(cad.evidenceIds??[]),evidenceId]),
    provenance:{...p,outputUri:cad.uri}
  };
  const generalProvenance:ArtifactProvenance={...artifact.provenance!};
  const engineering:EngineeringArtifact={
    id:cad.id+"-engineering",
    kind:"CAD_SOLID",
    name:cad.name,
    uri:cad.uri,
    mediaType:cad.mediaType,
    backend:cad.backend,
    units:cad.units,
    parameters:cad.parameters,
    provenance:generalProvenance,
    validationStatus,
    informationStatus,
    evidenceIds:[evidenceId],
    requirementIds:reqs,
    createdAt:cad.createdAt
  };
  const evidence:EvidenceRecord={
    id:evidenceId,
    type:"GEOMETRY_CHECK",
    claim:acceptance.accepted
      ?"CAD solid passed provenance-bound independent geometry validation."
      :"CAD solid failed independent geometry validation and was not accepted.",
    source:p.providerId,
    method:receipt.checkedBy,
    value:receipt,
    status:acceptance.accepted?"VERIFIED":"CALCULATED",
    artifactIds:[artifact.id,engineering.id],
    requirementIds:reqs,
    timestamp:now
  };
  const bundle={cad:artifact,engineering,evidence,acceptance};
  return {
    status:acceptance.accepted?"ACCEPTED":"REJECTED",
    acceptance,
    bundle,
    errors:acceptance.blockingReasons,
    warnings:deduplicate([...(manifest.warnings??[]),...acceptance.warnings])
  };
}

/**
 * Compatibility bridge for callers that do not yet provide source/model lineage.
 * It deliberately cannot create VERIFIED artifacts or evidence. Use the
 * manifest-backed builder above for engineering acceptance and requirement verification.
 * @deprecated Use normalizeCADExecutionResult(..., context) and createCADArtifactBundleFromManifest.
 */
export function createCADArtifactBundle(
  projectId:string,
  execution:CADExecutionResult,
  validation:GeometryValidation,
  requirementIds:string[]=[]
):CADArtifactBundle {
  if (!nonEmptyString(projectId)) throw new Error("CAD artifact bundle requires a project id.");
  if (!execution || execution.success!==true) throw new Error("CAD artifact bundle requires successful CAD execution.");
  if (!nonEmptyString(execution.solidArtifactPath)) throw new Error("CAD artifact bundle requires a returned solid artifact path.");

  const now=new Date().toISOString();
  const base=projectId+"-cad-legacy-"+Date.now()+"-"+createCADSourceSha256(execution.solidArtifactPath).slice(0,8);
  const evidenceId=base+"-geometry-evidence";
  const warnings=[...evaluateCADAcceptance(validation).warnings,
    "Legacy CAD bridge lacks model identity and source provenance; validation is not bound to an execution manifest."];
  const acceptance:CADAcceptance={accepted:false,status:"INCOMPLETE",blockingReasons:[],warnings};
  const cad:CADArtifact={
    id:base+"-solid",kind:"SOLID",name:"Generated CAD solid",backend:execution.backend,
    uri:execution.solidArtifactPath,validationStatus:"UNVALIDATED",informationStatus:"CALCULATED",
    evidenceIds:[evidenceId],requirementIds:[...requirementIds],createdAt:now
  };
  const engineering:EngineeringArtifact={
    id:base+"-engineering",kind:"CAD_SOLID",name:cad.name,uri:cad.uri,backend:cad.backend,
    validationStatus:"UNVALIDATED",informationStatus:"CALCULATED",evidenceIds:[evidenceId],
    requirementIds:[...requirementIds],createdAt:now
  };
  const evidence:EvidenceRecord={
    id:evidenceId,type:"GEOMETRY_CHECK",
    claim:"CAD validation was recorded without provenance binding; this evidence is not verified.",
    method:validation?.checkedBy,
    value:{validation,provenanceStatus:"MISSING"},
    status:"CALCULATED",artifactIds:[cad.id,engineering.id],
    requirementIds:[...requirementIds],timestamp:now
  };
  return {cad,engineering,evidence,acceptance};
}
