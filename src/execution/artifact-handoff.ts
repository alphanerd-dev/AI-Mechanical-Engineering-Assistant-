import {ExecutionJob,ExecutionProvenance} from "./types.js";

export interface ExecutionArtifactHandoff{
  jobId:string;
  projectId?:string;
  artifactIds:string[];
  evidenceIds:string[];
  provenance:ExecutionProvenance;
}

export interface ExecutionArtifactHandoffStore{
  save(handoff:ExecutionArtifactHandoff):Promise<void>|void;
  get(jobId:string):Promise<ExecutionArtifactHandoff|undefined>|ExecutionArtifactHandoff|undefined;
}

export class InMemoryExecutionArtifactHandoffStore implements ExecutionArtifactHandoffStore{
  private readonly handoffs=new Map<string,ExecutionArtifactHandoff>();

  save(handoff:ExecutionArtifactHandoff):void{
    this.handoffs.set(handoff.jobId,structuredClone(handoff));
  }

  get(jobId:string):ExecutionArtifactHandoff|undefined{
    const handoff=this.handoffs.get(jobId);
    return handoff?structuredClone(handoff):undefined;
  }
}

export function createExecutionArtifactHandoff(job:ExecutionJob):ExecutionArtifactHandoff{
  if(job.status!=="SUCCEEDED"){
    throw new Error("Only SUCCEEDED execution jobs may hand off artifacts.");
  }
  if(job.artifactIds.length===0){
    throw new Error("Execution succeeded without artifacts to hand off.");
  }
  if(!job.provenance){
    throw new Error("Execution provenance is required for artifact handoff.");
  }

  return {
    jobId:job.id,
    projectId:job.request.projectId,
    artifactIds:[...job.artifactIds],
    evidenceIds:[...job.evidenceIds],
    provenance:structuredClone(job.provenance)
  };
}
