import {CapabilityRouter} from "../capabilities/router";
import {CapabilityRisk,ProjectState} from "../core/types";
import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts";
import {EngineeringTaskGraph} from "../task-graph/types";
import {transitionTask} from "../task-graph/validation";
import {EngineeringApprovalRequest,EngineeringCompletionReport,EngineeringValidationSummary} from "./types";
import {authorize} from "../auth/policy";
import {produceEvidenceByProduct} from "../evidence/by-product";

const POWER_REQUIREMENT="REQ-DC-POWER";
const VOLTAGE_REQUIREMENT="REQ-DC-VOLTAGE";
const CURRENT_REQUIREMENT="REQ-DC-CURRENT";
const MAX_POWER_REQUIREMENT="REQ-DC-MAX-POWER";

const CAPABILITY_POWER="ANALYSIS.DC_POWER";
const CAPABILITY_RESISTANCE="ANALYSIS.DC_RESISTANCE";

export interface DcLoadEngineeringCompletionRequest{
  projectId:string;
  voltageV?:number;
  currentA?:number;
  maximumPowerW?:number;
  approval?:EngineeringApprovalRequest;
}

export interface DcLoadEngineeringValidation extends EngineeringValidationSummary{
  calculatedPowerW:number;
  calculatedResistanceOhm:number;
  maximumPowerW:number;
  powerWithinLimit:boolean;
}

function makeRequirement(id:string,name:string,value:number,unit:string){
  return {id,name,value,unit,priority:"MUST" as const,status:"OPEN" as const};
}

function createProject(request:DcLoadEngineeringCompletionRequest):ProjectState{
  return {
    id:request.projectId,
    name:"DC electrical load completion unit",
    stage:"ENGINEERING_COMPLETION",
    status:"ACTIVE",
    requirements:[
      makeRequirement(VOLTAGE_REQUIREMENT,"DC voltage",request.voltageV!,"V"),
      makeRequirement(CURRENT_REQUIREMENT,"DC current",request.currentA!,"A"),
      makeRequirement(MAX_POWER_REQUIREMENT,"Maximum allowable power",request.maximumPowerW!,"W"),
      makeRequirement(POWER_REQUIREMENT,"Calculated DC power",request.voltageV!*request.currentA!,"W")
    ],
    assumptions:[],
    openQuestions:[],
    unresolvedRisks:[
      "This bounded unit assumes a DC steady-state load model.",
      "Transient behavior, thermal design, wiring, protection, switching, EMC, and power-electronics design are outside this unit."
    ],
    events:[]
  };
}

function createTaskGraph(projectId:string,now:string):EngineeringTaskGraph{
  return {
    id:"TG-"+projectId,
    projectId,
    revision:1,
    tasks:[
      {
        id:"TASK-DC-POWER",
        projectId,
        name:"Calculate DC electrical power",
        goal:"Determine steady-state DC electrical power from explicit voltage and current.",
        capability:CAPABILITY_POWER,
        risk:"LOW",
        input:{},
        status:"READY",
        createdAt:now,
        updatedAt:now
      },
      {
        id:"TASK-DC-RESISTANCE",
        projectId,
        name:"Calculate equivalent resistance",
        goal:"Determine equivalent DC resistance from explicit voltage and current.",
        capability:CAPABILITY_RESISTANCE,
        risk:"LOW",
        input:{},
        dependsOn:["TASK-DC-POWER"],
        status:"PROPOSED",
        createdAt:now,
        updatedAt:now
      }
    ]
  };
}

function baseReport(
  projectId:string,
  project:ProjectState,
  taskGraph:EngineeringTaskGraph,
  missingInputs:string[],
  nextAction:string
):EngineeringCompletionReport{
  return {
    projectId,
    status:"BLOCKED",
    completionUnit:"ENGINEERING.COMPLETE_DC_LOAD",
    decisionMetrics:[],
    project,
    taskGraph,
    artifacts:[],
    evidence:[],
    verification:null,
    validation:null,
    approvalRequired:true,
    approvalGranted:false,
    missingInputs,
    nextAction,
    lineage:{requirementIds:project.requirements.map(item=>item.id),artifactIds:[],evidenceIds:[]}
  };
}

function fail(project:ProjectState,graph:EngineeringTaskGraph,reason:string):EngineeringCompletionReport{
  project.status="BLOCKED";
  project.openQuestions=[reason];
  return {...baseReport(project.id,project,graph,project.openQuestions,"Resolve the failed deterministic step before continuing."),status:"FAILED"};
}

function createArtifact(
  projectId:string,
  request:DcLoadEngineeringCompletionRequest,
  powerOutput:unknown,
  resistanceOutput:unknown,
  decisionMetrics:{key:string;value:number;unit:string}[],
  validated:boolean
):EngineeringArtifact{
  return {
    id:"ART-"+projectId+"-DC-LOAD-CALCULATION",
    kind:"CALCULATION_RESULT",
    name:"DC electrical load deterministic calculation result",
    mediaType:"application/json",
    backend:"engineering-core",
    version:"1",
    units:"SI",
    parameters:{
      projectId,
      inputs:{
        voltageV:request.voltageV,
        currentA:request.currentA,
        maximumPowerW:request.maximumPowerW
      },
      power:powerOutput,
      resistance:resistanceOutput
    },
    validationStatus:validated?"PASS":"FAIL",
    informationStatus:validated?"VERIFIED":"CALCULATED",
    evidenceIds:[],
    requirementIds:[
      VOLTAGE_REQUIREMENT,
      CURRENT_REQUIREMENT,
      MAX_POWER_REQUIREMENT,
      POWER_REQUIREMENT
    ],
    createdAt:new Date().toISOString()
  };
}

function validate(
  voltageV:number,
  currentA:number,
  maximumPowerW:number,
  calculatedPowerW:number,
  calculatedResistanceOhm:number
):DcLoadEngineeringValidation{
  const reasons:string[]=[];
  const powerWithinLimit=calculatedPowerW<=maximumPowerW;
  if(voltageV<=0) reasons.push("Voltage must be positive.");
  if(currentA<=0) reasons.push("Current must be positive.");
  if(maximumPowerW<=0) reasons.push("Maximum allowable power must be positive.");
  if(!Number.isFinite(calculatedPowerW)) reasons.push("Calculated power is not finite.");
  if(!Number.isFinite(calculatedResistanceOhm)) reasons.push("Calculated resistance is not finite.");
  if(!powerWithinLimit) reasons.push("Calculated power exceeds the explicit maximum allowable power.");
  return {calculatedPowerW,calculatedResistanceOhm,maximumPowerW,powerWithinLimit,passed:reasons.length===0,reasons};
}

export async function completeDcLoadEngineeringUnit(
  request:DcLoadEngineeringCompletionRequest,
  router:CapabilityRouter
):Promise<EngineeringCompletionReport<DcLoadEngineeringValidation>>{
  if(typeof request.projectId!=="string"||!request.projectId.trim()){
    const project={id:"",name:"DC electrical load completion unit",stage:"REQUIREMENTS",status:"BLOCKED" as const,requirements:[],assumptions:[],openQuestions:["projectId"],unresolvedRisks:[],events:[]};
    return baseReport("",
      project,
      {id:"TG-MISSING",projectId:"",revision:1,tasks:[]},
      ["projectId"],
      "Provide a projectId before starting the completion unit."
    );
  }

  const missing:string[]=[];
  if(typeof request.voltageV!=="number"||!Number.isFinite(request.voltageV)) missing.push("voltage");
  if(typeof request.currentA!=="number"||!Number.isFinite(request.currentA)) missing.push("current");
  if(typeof request.maximumPowerW!=="number"||!Number.isFinite(request.maximumPowerW)) missing.push("maximum allowable power");

  const projectForMissing:ProjectState={
    id:request.projectId,
    name:"DC electrical load completion unit",
    stage:"REQUIREMENTS",
    status:"BLOCKED",
    requirements:[],
    assumptions:[],
    openQuestions:missing,
    unresolvedRisks:[],
    events:[]
  };

  if(missing.length){
    return baseReport(
      request.projectId,
      projectForMissing,
      {id:"TG-"+request.projectId,projectId:request.projectId,revision:1,tasks:[]},
      missing,
      "Resolve the missing electrical inputs before deterministic execution."
    );
  }

  const project=createProject(request);
  let taskGraph=createTaskGraph(request.projectId,new Date().toISOString());

  if(request.voltageV!<=0||request.currentA!<=0||request.maximumPowerW!<=0){
    project.status="BLOCKED";
    project.openQuestions=["Voltage, current and maximum allowable power must be positive."];
    return baseReport(
      request.projectId,
      project,
      taskGraph,
      project.openQuestions,
      "Correct the invalid electrical inputs before deterministic execution."
    );
  }

  const powerResult=await router.execute({
    capability:CAPABILITY_POWER,
    risk:"LOW" as CapabilityRisk,
    input:{voltageV:request.voltageV!,currentA:request.currentA!}
  });

  if(!powerResult.success){
    taskGraph=transitionTask(taskGraph,"TASK-DC-POWER","RUNNING");
    taskGraph=transitionTask(taskGraph,"TASK-DC-POWER","FAILED");
    return fail(project,taskGraph,powerResult.error??"Deterministic DC power calculation failed.");
  }

  taskGraph=transitionTask(taskGraph,"TASK-DC-POWER","RUNNING");
  taskGraph=transitionTask(taskGraph,"TASK-DC-POWER","COMPLETED");
  taskGraph=transitionTask(taskGraph,"TASK-DC-RESISTANCE","READY");

  const resistanceResult=await router.execute({
    capability:CAPABILITY_RESISTANCE,
    risk:"LOW" as CapabilityRisk,
    input:{voltageV:request.voltageV!,currentA:request.currentA!}
  });

  if(!resistanceResult.success){
    taskGraph=transitionTask(taskGraph,"TASK-DC-RESISTANCE","RUNNING");
    taskGraph=transitionTask(taskGraph,"TASK-DC-RESISTANCE","FAILED");
    return fail(project,taskGraph,resistanceResult.error??"Deterministic DC resistance calculation failed.");
  }

  taskGraph=transitionTask(taskGraph,"TASK-DC-RESISTANCE","RUNNING");
  taskGraph=transitionTask(taskGraph,"TASK-DC-RESISTANCE","COMPLETED");

  const powerOutput=powerResult.output as {powerW?:number}|undefined;
  const resistanceOutput=resistanceResult.output as {resistanceOhm?:number}|undefined;
  if(typeof powerOutput?.powerW!=="number"||typeof resistanceOutput?.resistanceOhm!=="number"){
    return fail(project,taskGraph,"Deterministic electrical providers returned incomplete output; no result will be inferred.");
  }

  const validation=validate(
    request.voltageV!,
    request.currentA!,
    request.maximumPowerW!,
    powerOutput.powerW,
    resistanceOutput.resistanceOhm
  );

  const decisionMetrics=[
    {key:"powerW",value:validation.calculatedPowerW,unit:"W"},
    {key:"resistanceOhm",value:validation.calculatedResistanceOhm,unit:"Ω"},
    {key:"maximumPowerW",value:validation.maximumPowerW,unit:"W"}
  ];

  const artifact=createArtifact(request.projectId,request,powerOutput,resistanceOutput,decisionMetrics,validation.passed);

  project.events.push({
    id:"EVT-"+project.id+"-ANALYSIS",
    timestamp:new Date().toISOString(),
    actor:"engineering-completion",
    action:"DC_LOAD_DETERMINISTIC_ANALYSIS_COMPLETED",
    input:{voltageV:request.voltageV,currentA:request.currentA,maximumPowerW:request.maximumPowerW},
    output:{power:powerResult.output,resistance:resistanceResult.output}
  });

  if(!validation.passed){
    project.status="BLOCKED";
    project.unresolvedRisks.push(...validation.reasons);
    return {
      projectId:project.id,
      status:"FAILED",
      completionUnit:"ENGINEERING.COMPLETE_DC_LOAD",
      decisionMetrics,
      project,
      taskGraph,
      artifacts:[artifact],
      evidence:[],
      verification:null,
      validation,
      approvalRequired:true,
      approvalGranted:false,
      missingInputs:[],
      nextAction:"Revise the electrical inputs; the deterministic validation gate is fail-closed.",
      lineage:{
        requirementIds:project.requirements.map(item=>item.id),
        artifactIds:[artifact.id],
        evidenceIds:[]
      }
    };
  }

  const evidenceIds=[
    "EVD-"+project.id+"-POWER",
    "EVD-"+project.id+"-RESISTANCE",
    "EVD-"+project.id+"-ACCEPTANCE"
  ];

  const evidenceByProduct=produceEvidenceByProduct({
    project,
    artifacts:[artifact],
    validation:"PASS",
    drafts:[
      {
        id:evidenceIds[0],
        type:"CALCULATION",
        claim:"Steady-state DC electrical power was calculated deterministically from explicit voltage and current.",
        method:"P = V I",
        value:powerOutput,
        artifactIds:[artifact.id],
        requirementIds:[VOLTAGE_REQUIREMENT,CURRENT_REQUIREMENT,POWER_REQUIREMENT]
      },
      {
        id:evidenceIds[1],
        type:"CALCULATION",
        claim:"Equivalent DC resistance was calculated deterministically from explicit voltage and current.",
        method:"R = V / I",
        value:resistanceOutput,
        artifactIds:[artifact.id],
        requirementIds:[VOLTAGE_REQUIREMENT,CURRENT_REQUIREMENT]
      },
      {
        id:evidenceIds[2],
        type:"CALCULATION",
        claim:"Calculated DC power satisfies the explicit maximum allowable power requirement.",
        method:"calculatedPowerW <= maximumPowerW",
        value:validation,
        artifactIds:[artifact.id],
        requirementIds:[POWER_REQUIREMENT,MAX_POWER_REQUIREMENT]
      }
    ]
  });

  if(!evidenceByProduct.emitted){
    project.status="BLOCKED";
    project.openQuestions=[evidenceByProduct.reason];
    return {
      projectId:project.id,
      status:"FAILED",
      completionUnit:"ENGINEERING.COMPLETE_DC_LOAD",
      decisionMetrics,
      project,
      taskGraph,
      artifacts:evidenceByProduct.artifacts,
      evidence:[],
      verification:null,
      validation,
      approvalRequired:true,
      approvalGranted:false,
      missingInputs:[],
      nextAction:"Evidence production was blocked; no unverified electrical result will be promoted.",
      lineage:{
        requirementIds:project.requirements.map(item=>item.id),
        artifactIds:evidenceByProduct.artifacts.map(item=>item.id),
        evidenceIds:[]
      }
    };
  }

  const evidence=evidenceByProduct.evidence;
  const evidenceArtifact=evidenceByProduct.artifacts[0];
  project.evidenceIds=evidence.map(item=>item.id);
  project.events.push({
    id:"EVT-"+project.id+"-EVIDENCE",
    timestamp:new Date().toISOString(),
    actor:"engineering-completion",
    action:"ENGINEERING_EVIDENCE_AUTO_GENERATED",
    input:{artifactId:evidenceArtifact.id,validation:"PASS"},
    output:{evidenceIds:evidence.map(item=>item.id)},
    evidence:evidence.map(item=>item.id)
  });

  const reportBase:EngineeringCompletionReport<DcLoadEngineeringValidation>={
    projectId:project.id,
    status:"WAITING_APPROVAL",
    completionUnit:"ENGINEERING.COMPLETE_DC_LOAD",
    decisionMetrics,
    project,
    taskGraph,
    artifacts:[evidenceArtifact],
    evidence,
    verification:null,
    validation,
    approvalRequired:true,
    approvalGranted:false,
    missingInputs:[],
    nextAction:"A REVIEWER or ADMIN must explicitly approve the validated electrical load result before the completion unit can close.",
    lineage:{
      requirementIds:project.requirements.map(item=>item.id),
      artifactIds:[evidenceArtifact.id],
      evidenceIds:evidence.map(item=>item.id)
    }
  };

  if(!request.approval) return reportBase;

  const authorization=authorize({
    identity:request.approval.identity,
    permission:"APPROVAL.GRANT",
    projectId:project.id
  });

  if(!authorization.allowed){
    return {...reportBase,approval:request.approval,nextAction:"Approval was not authorized; a REVIEWER or ADMIN must grant the final approval."};
  }

  if(!request.approval.reason.trim()){
    return {...reportBase,approval:request.approval,nextAction:"Approval reason is required before the completion unit can close."};
  }

  const humanEvidence:EvidenceRecord={
    id:"EVD-"+project.id+"-HUMAN-APPROVAL",
    type:"HUMAN_REVIEW",
    claim:"Explicit human approval was granted for the validated DC electrical load completion unit.",
    method:"Engineering approval gate",
    value:{reason:request.approval.reason,actor:request.approval.identity.subject},
    status:"VERIFIED",
    artifactIds:[artifact.id],
    requirementIds:project.requirements.map(item=>item.id),
    timestamp:new Date().toISOString()
  };

  evidence.push(humanEvidence);
  evidenceArtifact.evidenceIds=[...evidenceArtifact.evidenceIds,humanEvidence.id];
  evidenceArtifact.informationStatus="VERIFIED";
  project.evidenceIds=evidence.map(item=>item.id);

  const verificationResult=await router.execute({
    capability:"ENGINEERING.VERIFY_PROJECT",
    risk:"HIGH",
    input:{
      project,
      evidence,
      artifacts:[evidenceArtifact],
      requirementEvidence:Object.fromEntries(
        project.requirements.map(item=>[
          item.id,
          evidence.filter(e=>e.requirementIds?.includes(item.id)).map(e=>e.id)
        ])
      )
    }
  });

  if(!verificationResult.success||!verificationResult.output){
    project.status="BLOCKED";
    project.nextAction="Final verification failed; approval does not override the evidence gate.";
    return {
      ...reportBase,
      approval:request.approval,
      evidence,
      artifacts:[evidenceArtifact],
      verification:null,
      approvalGranted:true,
      status:"FAILED",
      nextAction:project.nextAction,
      lineage:{
        requirementIds:project.requirements.map(item=>item.id),
        artifactIds:[evidenceArtifact.id],
        evidenceIds:evidence.map(item=>item.id)
      }
    };
  }

  const verification=verificationResult.output as {status?:string};
  if(verification.status!=="PASS"){
    project.status="BLOCKED";
    project.nextAction="Final verification did not PASS; the completion unit remains blocked despite approval.";
    return {
      ...reportBase,
      approval:request.approval,
      evidence,
      artifacts:[evidenceArtifact],
      verification:verification as never,
      approvalGranted:true,
      status:"FAILED",
      nextAction:project.nextAction,
      lineage:{
        requirementIds:project.requirements.map(item=>item.id),
        artifactIds:[evidenceArtifact.id],
        evidenceIds:evidence.map(item=>item.id)
      }
    };
  }

  for(const requirement of project.requirements) requirement.status="SATISFIED";
  project.stage="VERIFIED";
  project.status="COMPLETE";
  project.nextAction="DC electrical load completion unit closed; thermal, protection and downstream electrical design may continue.";
  project.events.push({
    id:"EVT-"+project.id+"-COMPLETE",
    timestamp:new Date().toISOString(),
    actor:request.approval.identity.subject,
    action:"ENGINEERING_COMPLETION_APPROVED",
    input:{approvalReason:request.approval.reason},
    output:{verification:"PASS",artifactId:evidenceArtifact.id}
  });

  return {
    projectId:project.id,
    status:"COMPLETE",
    completionUnit:"ENGINEERING.COMPLETE_DC_LOAD",
    decisionMetrics,
    project,
    taskGraph,
    artifacts:[evidenceArtifact],
    evidence,
    verification:verification as never,
    validation,
    approvalRequired:true,
    approvalGranted:true,
    approval:request.approval,
    missingInputs:[],
    nextAction:project.nextAction,
    lineage:{
      requirementIds:project.requirements.map(item=>item.id),
      artifactIds:[evidenceArtifact.id],
      evidenceIds:evidence.map(item=>item.id)
    }
  };
}
