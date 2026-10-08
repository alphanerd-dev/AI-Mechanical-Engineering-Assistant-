import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult,ProjectState} from "../core/types.js";
import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {verifyEngineeringProject} from "../verification/project";

export class EngineeringVerificationProvider implements CapabilityProvider{
  id="engineering-core";
  capabilities=["ENGINEERING.VERIFY_PROJECT"];

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    const project=request.input.project;
    const evidence=request.input.evidence;
    const artifacts=request.input.artifacts;

    if(!project||typeof project!=="object"){
      return {capability:request.capability,provider:this.id,success:false,error:"A project is required."};
    }
    if(!Array.isArray(evidence)||!Array.isArray(artifacts)){
      return {capability:request.capability,provider:this.id,success:false,error:"Evidence and artifacts arrays are required."};
    }

    const report=await verifyEngineeringProject({
      project:project as ProjectState,
      evidence:evidence as EvidenceRecord[],
      artifacts:artifacts as EngineeringArtifact[],
      requirementEvidence:request.input.requirementEvidence as Record<string,string[]>|undefined
    });

    return {
      capability:request.capability,
      provider:this.id,
      success:true,
      output:report,
      evidenceIds:report.requirements.flatMap(r=>r.evidenceIds),
      artifactIds:report.requirements.flatMap(r=>r.artifactIds)
    };
  }
}
