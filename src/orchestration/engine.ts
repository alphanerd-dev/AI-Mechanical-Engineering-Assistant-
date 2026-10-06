import {CapabilityRouter} from "../capabilities/router.js";
import {CapabilityResult,ProjectState} from "../core/types.js";
import {DigitalThreadGraph,DigitalThreadLink} from "../digital-thread/types.js";
import {
  EngineeringOrchestrator,
  EngineeringOrchestratorContext,
  EngineeringWorkflowPlan,
  EngineeringWorkflowReport,
  EngineeringWorkflowStep,
  EngineeringWorkflowStepResult
} from "./types.js";

function getPath(value:unknown,path?:string):unknown{
  if(path===undefined||path==="") return value;
  return path.split(".").reduce<unknown>((current,key)=>{
    if(current===null||typeof current!=="object") return undefined;
    return (current as Record<string,unknown>)[key];
  },value);
}

function validatePlan(plan:EngineeringWorkflowPlan):string[]{
  const errors:string[]=[];
  if(!plan.id.trim()) errors.push("Workflow plan id is required.");
  if(!plan.projectId.trim()) errors.push("Workflow project id is required.");
  if(!plan.name.trim()) errors.push("Workflow plan name is required.");
  if(plan.steps.length===0) errors.push("Workflow plan must contain at least one step.");

  const ids=new Set<string>();
  for(const step of plan.steps){
    if(!step.id.trim()) errors.push("Workflow step id is required.");
    if(ids.has(step.id)) errors.push(`Duplicate workflow step id: ${step.id}.`);
    ids.add(step.id);
    if(!step.name.trim()) errors.push(`Workflow step name is required: ${step.id}.`);
    if(!step.capability.trim()) errors.push(`Workflow step capability is required: ${step.id}.`);
    const maxAttempts=step.maxAttempts??1;
    if(!Number.isInteger(maxAttempts)||maxAttempts<1) errors.push(`Workflow step maxAttempts must be a positive integer: ${step.id}.`);
    for(const dependencyId of step.dependsOn??[]){
      if(dependencyId===step.id) errors.push(`Workflow step cannot depend on itself: ${step.id}.`);
    }
    for(const ref of Object.values(step.inputRefs??{})){
      if(ref.stepId===step.id) errors.push(`Workflow step input reference cannot point to itself: ${step.id}.`);
    }
  }

  for(const step of plan.steps){
    for(const dependencyId of step.dependsOn??[]){
      if(!ids.has(dependencyId)) errors.push(`Workflow dependency not found: ${step.id} -> ${dependencyId}.`);
    }
    for(const ref of Object.values(step.inputRefs??{})){
      if(!ids.has(ref.stepId)) errors.push(`Workflow input reference target not found: ${step.id} -> ${ref.stepId}.`);
    }
  }

  const visiting=new Set<string>();
  const visited=new Set<string>();
  const byId=new Map(plan.steps.map(step=>[step.id,step]));
  const visit=(id:string):void=>{
    if(visiting.has(id)){
      errors.push(`Workflow dependency cycle detected at: ${id}.`);
      return;
    }
    if(visited.has(id)) return;
    visiting.add(id);
    for(const dependencyId of byId.get(id)?.dependsOn??[]) visit(dependencyId);
    visiting.delete(id);
    visited.add(id);
  };
  for(const step of plan.steps) visit(step.id);
  return [...new Set(errors)];
}

function requirementGate(step:EngineeringWorkflowStep,project:ProjectState|undefined):string|undefined{
  const required=step.requiredRequirementIds??[];
  if(required.length===0) return undefined;
  if(!project) return "Required engineering requirements cannot be checked without a project.";
  const missing=required.filter(id=>{
    const requirement=project.requirements.find(item=>item.id===id);
    return !requirement||requirement.status!=="SATISFIED";
  });
  return missing.length>0
    ?`Workflow step is blocked by unsatisfied requirements: ${missing.join(", ")}.`
    :undefined;
}

function resultTrust(result:CapabilityResult):"UNVERIFIED"|"EVIDENCE_BACKED"{
  return (result.evidenceIds?.length||result.artifactIds?.length) ? "EVIDENCE_BACKED" : "UNVERIFIED";
}

function addTraceability(
  graph:DigitalThreadGraph,
  plan:EngineeringWorkflowPlan,
  step:EngineeringWorkflowStep,
  result:CapabilityResult
):DigitalThreadLink[]{
  const links:DigitalThreadLink[]=[];
  for(const requirementId of step.requiredRequirementIds??[]){
    for(const artifactId of result.artifactIds??[]){
      const id=`${plan.projectId}:workflow:${step.id}:${requirementId}:${artifactId}`;
      const existing=graph.get(id);
      if(existing){
        links.push(existing);
        continue;
      }
      const link:DigitalThreadLink={
        id,
        projectId:plan.projectId,
        from:{kind:"REQUIREMENT",id:requirementId},
        to:{kind:"ARTIFACT",id:artifactId},
        relation:"IMPLEMENTS",
        evidenceIds:result.evidenceIds,
        createdAt:new Date().toISOString()
      };
      links.push(graph.addLink(link));
    }
  }
  return links;
}

export class EngineeringWorkflowEngine implements EngineeringOrchestrator{
  constructor(private readonly router:CapabilityRouter){}

  async execute(
    plan:EngineeringWorkflowPlan,
    context:EngineeringOrchestratorContext={}
  ):Promise<EngineeringWorkflowReport>{
    const planErrors=validatePlan(plan);
    if(planErrors.length>0){
      return {
        planId:plan.id,
        projectId:plan.projectId,
        status:"INCOMPLETE",
        steps:[],
        traceabilityLinks:[]
      };
    }

    const project=context.project;
    const graph=context.digitalThread??new DigitalThreadGraph();
    const byId=new Map(plan.steps.map(step=>[step.id,step]));
    const pending=new Set(plan.steps.map(step=>step.id));
    const results=new Map<string,EngineeringWorkflowStepResult>();
    const outputs=new Map<string,unknown>();
    const traceabilityLinks:DigitalThreadLink[]=[];

    while(pending.size>0){
      let progressed=false;

      for(const step of plan.steps){
        if(!pending.has(step.id)) continue;

        const dependencies=step.dependsOn??[];
        const dependencyResults=dependencies.map(id=>results.get(id));
        const dependencyPending=dependencyResults.some(item=>!item);
        if(dependencyPending) continue;

        const failedDependency=dependencyResults.find(item=>item?.status!=="SUCCESS");
        if(failedDependency){
          const blocked:EngineeringWorkflowStepResult={
            stepId:step.id,stage:step.stage,status:"SKIPPED",attempts:0,trust:"UNVERIFIED",
            reason:`Skipped because dependency ${failedDependency.stepId} did not succeed.`
          };
          results.set(step.id,blocked);
          pending.delete(step.id);
          progressed=true;
          continue;
        }

        const requirementError=requirementGate(step,project);
        if(requirementError){
          results.set(step.id,{
            stepId:step.id,stage:step.stage,status:"BLOCKED",attempts:0,trust:"UNVERIFIED",reason:requirementError
          });
          pending.delete(step.id);
          progressed=true;
          continue;
        }

        if(step.approvalRequired&&!step.approvalGranted){
          results.set(step.id,{
            stepId:step.id,stage:step.stage,status:"BLOCKED",attempts:0,trust:"UNVERIFIED",
            reason:"Workflow step requires explicit human approval before execution."
          });
          pending.delete(step.id);
          progressed=true;
          continue;
        }

        const input={...step.input};
        let missingReference:string|undefined;
        for(const [key,reference] of Object.entries(step.inputRefs??{})){
          const source=outputs.get(reference.stepId);
          const value=getPath(source,reference.path);
          if(value===undefined){
            missingReference=`Workflow input reference could not resolve: ${step.id}.${key} from ${reference.stepId}.${reference.path??"(output)"}.`;
            break;
          }
          input[key]=value;
        }
        if(missingReference){
          results.set(step.id,{
            stepId:step.id,stage:step.stage,status:"BLOCKED",attempts:0,trust:"UNVERIFIED",reason:missingReference
          });
          pending.delete(step.id);
          progressed=true;
          continue;
        }

        let finalResult:CapabilityResult|undefined;
        let attempts=0;
        const maxAttempts=step.maxAttempts??1;

        while(attempts<maxAttempts){
          attempts++;
          finalResult=await this.router.execute({
            capability:step.capability,
            risk:step.risk,
            input
          });
          if(finalResult.success) break;
        }

        if(!finalResult){
          results.set(step.id,{
            stepId:step.id,stage:step.stage,status:"FAILED",attempts,trust:"UNVERIFIED",reason:"Capability did not return a result."
          });
          pending.delete(step.id);
          progressed=true;
          continue;
        }

        if(!finalResult.success){
          results.set(step.id,{
            stepId:step.id,stage:step.stage,status:"FAILED",attempts,trust:"UNVERIFIED",
            capabilityResult:finalResult,
            reason:finalResult.error??"Capability execution failed."
          });
          pending.delete(step.id);
          progressed=true;
          continue;
        }

        const trust=resultTrust(finalResult);
        if(step.requireEvidence&&trust==="UNVERIFIED"){
          results.set(step.id,{
            stepId:step.id,stage:step.stage,status:"BLOCKED",attempts,trust,
            capabilityResult:finalResult,
            reason:"Workflow step requires evidence or an artifact before its result can be accepted."
          });
          pending.delete(step.id);
          progressed=true;
          continue;
        }

        outputs.set(step.id,finalResult.output);
        results.set(step.id,{
          stepId:step.id,stage:step.stage,status:"SUCCESS",attempts,trust,
          capabilityResult:finalResult,
          reason:attempts>1?`Capability succeeded after ${attempts} attempts.`:"Capability executed successfully."
        });
        traceabilityLinks.push(...addTraceability(graph,plan,step,finalResult));
        pending.delete(step.id);
        progressed=true;
      }

      if(!progressed){
        for(const stepId of pending){
          results.set(stepId,{
            stepId,stage:byId.get(stepId)!.stage,status:"INCOMPLETE",attempts:0,trust:"UNVERIFIED",
            reason:"Workflow could not make progress; unresolved dependency state remains."
          });
        }
        pending.clear();
      }
    }

    const orderedResults=plan.steps.map(step=>results.get(step.id)!);
    const status=orderedResults.some(result=>result.status==="FAILED")
      ?"FAILED"
      :orderedResults.some(result=>result.status==="BLOCKED")
        ?"BLOCKED"
        :orderedResults.some(result=>result.status==="SKIPPED"||result.status==="INCOMPLETE")
          ?"INCOMPLETE"
          :"COMPLETE";

    return {
      planId:plan.id,
      projectId:plan.projectId,
      status,
      steps:orderedResults,
      traceabilityLinks
    };
  }
}
