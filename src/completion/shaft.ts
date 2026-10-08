import {CapabilityRouter} from "../capabilities/router.js";
import {CapabilityRisk,ProjectState,Requirement} from "../core/types.js";
import {EngineeringArtifact,EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {EngineeringTaskGraph} from "../task-graph/types.js";
import {transitionTask} from "../task-graph/validation.js";
import {shaftTorque} from "../engineering/calculations.js";
import {EngineeringCompletionReport,ShaftEngineeringCompletionRequest,ShaftEngineeringValidation} from "./types.js";
import {authorize} from "../auth/policy.js";
import {produceEvidenceByProduct} from "../evidence/by-product.js";

const TORQUE_REQUIREMENT="REQ-SHAFT-TORQUE";
const SPEED_REQUIREMENT="REQ-SHAFT-SPEED";
const ALLOWABLE_STRESS_REQUIREMENT="REQ-SHAFT-STRESS";
const BENDING_REQUIREMENT="REQ-SHAFT-BENDING";
const DIAMETER_REQUIREMENT="REQ-SHAFT-DIAMETER";

const CAPABILITY_TORQUE="ANALYSIS.SHAFT_TORQUE";
const CAPABILITY_SIZE="ANALYSIS.SHAFT_SIZE";

function makeRequirement(id:string,name:string,value:number,unit:string):Requirement{
  return {id,name,value,unit,priority:"MUST",status:"OPEN"};
}

function createProject(request:ShaftEngineeringCompletionRequest):ProjectState{
  return {
    id:request.projectId,
    name:"Shaft design completion unit",
    stage:"ENGINEERING_COMPLETION",
    status:"ACTIVE",
    requirements:[
      makeRequirement(TORQUE_REQUIREMENT,"Transmitted power",request.powerKw!,"kW"),
      makeRequirement(SPEED_REQUIREMENT,"Shaft speed",request.speedRpm!,"rpm"),
      makeRequirement(ALLOWABLE_STRESS_REQUIREMENT,"Allowable shear stress",request.allowableShearStressMpa!,"MPa"),
      makeRequirement(BENDING_REQUIREMENT,"Applied bending moment",request.bendingMomentNm!,"N·m"),
      makeRequirement(DIAMETER_REQUIREMENT,"Selected shaft diameter",request.proposedDiameterMm!,"mm")
    ],
    assumptions:[],
    openQuestions:[],
    unresolvedRisks:[
      "Material grade is represented indirectly through the explicitly supplied allowable shear stress.",
      "Fatigue, key/coupling geometry, bearing arrangement, critical-speed, deflection, and detailed CAD checks are outside this unit."
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
        id:"TASK-SHAFT-TORQUE",
        projectId,
        name:"Calculate shaft torque",
        goal:"Determine torque transmitted by the specified power and speed.",
        capability:CAPABILITY_TORQUE,
        risk:"LOW",
        input:{},
        status:"READY",
        createdAt:now,
        updatedAt:now
      },
      {
        id:"TASK-SHAFT-SIZE",
        projectId,
        name:"Size solid shaft",
        goal:"Determine the minimum solid-shaft diameter from torque, bending moment and allowable shear stress.",
        capability:CAPABILITY_SIZE,
        risk:"MEDIUM",
        input:{},
        dependsOn:["TASK-SHAFT-TORQUE"],
        status:"PROPOSED",
        createdAt:now,
        updatedAt:now
      }
    ]
  };
}

function createBaseReport(
  projectId:string,
  project:ProjectState,
  taskGraph:EngineeringTaskGraph,
  missingInputs:string[],
  nextAction:string
):EngineeringCompletionReport{
  return {
    projectId,
    status:"BLOCKED",
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
    lineage:{
      requirementIds:project.requirements.map(item=>item.id),
      artifactIds:[],
      evidenceIds:[]
    }
  };
}

function completeTask(
  graph:EngineeringTaskGraph,
  taskId:string,
  success:boolean
):EngineeringTaskGraph{
  const running=transitionTask(graph,taskId,"RUNNING");
  return transitionTask(running,taskId,success?"COMPLETED":"FAILED");
}

function makeTaskReady(graph:EngineeringTaskGraph,taskId:string):EngineeringTaskGraph{
  return transitionTask(graph,taskId,"READY");
}

function validateShaft(
  powerKw:number,
  speedRpm:number,
  calculatedTorqueNm:number,
  minimumDiameterMm:number,
  proposedDiameterMm:number
):ShaftEngineeringValidation{
  const expected=shaftTorque(powerKw,speedRpm);
  const torqueConsistent=Math.abs(expected.torqueNm-calculatedTorqueNm)<=1e-9;
  const diameterAdequate=minimumDiameterMm<=proposedDiameterMm;
  const reasons:string[]=[];
  if(!torqueConsistent) reasons.push("Deterministic torque cross-check failed.");
  if(!Number.isFinite(minimumDiameterMm)) reasons.push("Minimum diameter is not finite.");
  if(!diameterAdequate) reasons.push("Proposed shaft diameter is below the calculated minimum.");
  return {
    torqueConsistent,
    diameterAdequate,
    expectedTorqueNm:expected.torqueNm,
    calculatedTorqueNm,
    minimumDiameterMm,
    proposedDiameterMm,
    passed:reasons.length===0,
    reasons
  };
}

function createCalculationArtifact(
  projectId:string,
  request:ShaftEngineeringCompletionRequest,
  torqueOutput:unknown,
  sizingOutput:unknown,
  evidenceIds:string[],
  validated:boolean
):EngineeringArtifact{
  return {
    id:"ART-"+projectId+"-SHAFT-CALCULATION",
    kind:"CALCULATION_RESULT",
    name:"Shaft design deterministic calculation result",
    mediaType:"application/json",
    backend:"engineering-core",
    version:"1",
    units:"SI",
    parameters:{
      projectId,
      inputs:{
        powerKw:request.powerKw,
        speedRpm:request.speedRpm,
        bendingMomentNm:request.bendingMomentNm,
        allowableShearStressMpa:request.allowableShearStressMpa,
        proposedDiameterMm:request.proposedDiameterMm
      },
      torque:torqueOutput,
      sizing:sizingOutput
    },
    validationStatus:validated?"PASS":"FAIL",
    informationStatus:validated?"VERIFIED":"CALCULATED",
    evidenceIds,
    requirementIds:[
      TORQUE_REQUIREMENT,
      SPEED_REQUIREMENT,
      ALLOWABLE_STRESS_REQUIREMENT,
      BENDING_REQUIREMENT,
      DIAMETER_REQUIREMENT
    ],
    createdAt:new Date().toISOString()
  };
}

function failedResult(
  project:ProjectState,
  taskGraph:EngineeringTaskGraph,
  reason:string
):EngineeringCompletionReport{
  project.status="BLOCKED";
  project.openQuestions=[reason];
  const report=createBaseReport(
    project.id,
    project,
    taskGraph,
    project.openQuestions,
    "Resolve the failed deterministic step before continuing."
  );
  return {...report,status:"FAILED"};
}

export async function completeShaftEngineeringUnit(
  request:ShaftEngineeringCompletionRequest,
  router:CapabilityRouter
):Promise<EngineeringCompletionReport>{
  if(typeof request.projectId!=="string"||!request.projectId.trim()){
    const project={
      id:"",
      name:"Shaft design completion unit",
      stage:"REQUIREMENTS",
      status:"BLOCKED" as const,
      requirements:[],
      assumptions:[],
      openQuestions:["projectId"],
      unresolvedRisks:[],
      events:[]
    };
    const report=createBaseReport(
      "",
      project,
      {id:"TG-MISSING",projectId:"",revision:1,tasks:[]},
      ["projectId"],
      "Provide a projectId before starting the completion unit."
    );
    return report;
  }

  const missing:string[]=[];
  const inputs:[keyof ShaftEngineeringCompletionRequest,string][]=[
    ["powerKw","power"],
    ["speedRpm","speed"],
    ["bendingMomentNm","bending moment"],
    ["allowableShearStressMpa","allowable shear stress"],
    ["proposedDiameterMm","proposed shaft diameter"]
  ];
  for(const [key,label] of inputs){
    const value=request[key];
    if(typeof value!=="number"||!Number.isFinite(value)) missing.push(label);
  }

  const projectForMissing={
    id:request.projectId,
    name:"Shaft design completion unit",
    stage:"REQUIREMENTS",
    status:"BLOCKED" as const,
    requirements:[],
    assumptions:[],
    openQuestions:missing,
    unresolvedRisks:[],
    events:[]
  };

  if(missing.length){
    return createBaseReport(
      request.projectId,
      projectForMissing,
      {id:"TG-"+request.projectId,projectId:request.projectId,revision:1,tasks:[]},
      missing,
      "Resolve the missing engineering inputs before deterministic execution."
    );
  }

  if(
    request.powerKw!<=0||
    request.speedRpm!<=0||
    request.allowableShearStressMpa!<=0||
    request.bendingMomentNm!<0||
    request.proposedDiameterMm!<=0
  ){
    const project=createProject(request);
    project.status="BLOCKED";
    project.openQuestions=[
      "Power, speed, allowable shear stress and proposed diameter must be positive; bending moment may be zero."
    ];
    return createBaseReport(
      request.projectId,
      project,
      createTaskGraph(request.projectId,new Date().toISOString()),
      project.openQuestions,
      "Correct the invalid engineering inputs before deterministic execution."
    );
  }

  const project=createProject(request);
  let taskGraph=createTaskGraph(request.projectId,new Date().toISOString());

  const torqueResult=await router.execute({
    capability:CAPABILITY_TORQUE,
    risk:"LOW" as CapabilityRisk,
    input:{powerKw:request.powerKw!,speedRpm:request.speedRpm!}
  });

  if(!torqueResult.success){
    const graph=completeTask(taskGraph,"TASK-SHAFT-TORQUE",false);
    return failedResult(project,graph,torqueResult.error??"Deterministic torque calculation failed.");
  }

  taskGraph=completeTask(taskGraph,"TASK-SHAFT-TORQUE",true);
  taskGraph=makeTaskReady(taskGraph,"TASK-SHAFT-SIZE");

  const sizingResult=await router.execute({
    capability:CAPABILITY_SIZE,
    risk:"MEDIUM" as CapabilityRisk,
    input:{
      powerKw:request.powerKw!,
      speedRpm:request.speedRpm!,
      bendingMomentNm:request.bendingMomentNm!,
      allowableShearStressMpa:request.allowableShearStressMpa!
    }
  });

  if(!sizingResult.success){
    const graph=completeTask(taskGraph,"TASK-SHAFT-SIZE",false);
    return failedResult(project,graph,sizingResult.error??"Deterministic shaft-sizing calculation failed.");
  }

  taskGraph=completeTask(taskGraph,"TASK-SHAFT-SIZE",true);

  const torqueOutput=torqueResult.output as {torqueNm?:number}|undefined;
  const sizingOutput=sizingResult.output as {minimumDiameterMm?:number}|undefined;

  if(
    typeof torqueOutput?.torqueNm!=="number"||
    typeof sizingOutput?.minimumDiameterMm!=="number"
  ){
    return failedResult(
      project,
      taskGraph,
      "Deterministic providers returned incomplete output; no engineering result will be inferred."
    );
  }

  project.events.push({
    id:"EVT-"+project.id+"-ANALYSIS",
    timestamp:new Date().toISOString(),
    actor:"engineering-completion",
    action:"SHAFT_DETERMINISTIC_ANALYSIS_COMPLETED",
    input:{powerKw:request.powerKw,speedRpm:request.speedRpm,bendingMomentNm:request.bendingMomentNm,allowableShearStressMpa:request.allowableShearStressMpa},
    output:{torque:torqueResult.output,sizing:sizingResult.output}
  });

  const validation=validateShaft(
    request.powerKw!,
    request.speedRpm!,
    torqueOutput.torqueNm,
    sizingOutput.minimumDiameterMm,
    request.proposedDiameterMm!
  );

  const evidenceIds=[
    "EVD-"+project.id+"-TORQUE",
    "EVD-"+project.id+"-SIZING",
    "EVD-"+project.id+"-ACCEPTANCE"
  ];

  const artifact=createCalculationArtifact(
    project.id,
    request,
    torqueResult.output,
    sizingResult.output,
    [],
    validation.passed
  );

  if(!validation.passed){
    project.status="BLOCKED";
    project.unresolvedRisks.push(...validation.reasons);
    return {
      projectId:project.id,
      status:"FAILED",
      project,
      taskGraph,
      artifacts:[artifact],
      evidence:[],
      verification:null,
      validation,
      approvalRequired:true,
      approvalGranted:false,
      missingInputs:[],
      nextAction:"Revise the design inputs; the deterministic validation gate is fail-closed.",
      lineage:{
        requirementIds:project.requirements.map(item=>item.id),
        artifactIds:[evidenceArtifact.id],
        evidenceIds:[]
      }
    };
  }

  const evidenceByProduct=produceEvidenceByProduct({
    project,
    artifacts:[artifact],
    validation:"PASS",
    drafts:[
      {
        id:evidenceIds[0],
        type:"CALCULATION",
        claim:"Transmitted shaft torque was calculated deterministically from explicit power and speed.",
        method:"T = 9550 P(kW) / n(rpm)",
        value:torqueResult.output,
        artifactIds:[evidenceArtifact.id],
        requirementIds:[TORQUE_REQUIREMENT,SPEED_REQUIREMENT]
      },
      {
        id:evidenceIds[1],
        type:"CALCULATION",
        claim:"Minimum solid-shaft diameter was calculated deterministically from explicit torque, bending moment and allowable shear stress.",
        method:"d = [16·Te/(π·τallow)]^(1/3)",
        value:sizingResult.output,
        artifactIds:[evidenceArtifact.id],
        requirementIds:[TORQUE_REQUIREMENT,SPEED_REQUIREMENT,ALLOWABLE_STRESS_REQUIREMENT,BENDING_REQUIREMENT]
      },
      {
        id:evidenceIds[2],
        type:"CALCULATION",
        claim:"Selected shaft diameter passed the deterministic minimum-diameter acceptance gate.",
        method:"minimumDiameterMm <= proposedDiameterMm",
        value:validation,
        artifactIds:[evidenceArtifact.id],
        requirementIds:[DIAMETER_REQUIREMENT]
      }
    ]
  });

  if(!evidenceByProduct.emitted){
    project.status="BLOCKED";
    project.openQuestions=[evidenceByProduct.reason];
    return {
      projectId:project.id,
      status:"FAILED",
      project,
      taskGraph,
      artifacts:evidenceByProduct.artifacts,
      evidence:[],
      verification:null,
      validation,
      approvalRequired:true,
      approvalGranted:false,
      missingInputs:[],
      nextAction:"Evidence production was blocked; no unverified result will be promoted.",
      lineage:{
        requirementIds:project.requirements.map(item=>item.id),
        artifactIds:evidenceByProduct.artifacts.map(item=>item.id),
        evidenceIds:[]
      }
    };
  }

  const evidence=evidenceByProduct.evidence;
  const evidenceArtifact=evidenceByProduct.artifacts[0];
  project.evidenceIds=[...evidence.map(item=>item.id)];
  project.events.push({
    id:"EVT-"+project.id+"-EVIDENCE",
    timestamp:new Date().toISOString(),
    actor:"engineering-completion",
    action:"ENGINEERING_EVIDENCE_AUTO_GENERATED",
    input:{artifactId:evidenceArtifact.id,validation:"PASS"},
    output:{evidenceIds:evidence.map(item=>item.id)},
    evidence:evidence.map(item=>item.id)
  });

  const reportBase:EngineeringCompletionReport={
    projectId:project.id,
    status:"WAITING_APPROVAL",
    project,
    taskGraph,
    artifacts:[evidenceArtifact],
    evidence,
    verification:null,
    validation,
    approvalRequired:true,
    approvalGranted:false,
    missingInputs:[],
    nextAction:"A REVIEWER or ADMIN must explicitly approve the validated engineering result before the completion unit can close.",
    lineage:{
      requirementIds:project.requirements.map(item=>item.id),
      artifactIds:[evidenceArtifact.id],
      evidenceIds:[...evidenceIds]
    }
  };

  if(!request.approval) return reportBase;

  const authorization=authorize({
    identity:request.approval.identity,
    permission:"APPROVAL.GRANT",
    projectId:project.id
  });

  if(!authorization.allowed){
    return {
      ...reportBase,
      approval:request.approval,
      nextAction:"Approval was not authorized; a REVIEWER or ADMIN must grant the final approval."
    };
  }

  if(!request.approval.reason.trim()){
    return {
      ...reportBase,
      approval:request.approval,
      nextAction:"Approval reason is required before the completion unit can close."
    };
  }

  const humanEvidence:EvidenceRecord={
    id:"EVD-"+project.id+"-HUMAN-APPROVAL",
    type:"HUMAN_REVIEW",
    claim:"Explicit human approval was granted for the validated shaft design completion unit.",
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
          evidence
            .filter(e=>e.requirementIds?.includes(item.id))
            .map(e=>e.id)
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
  project.nextAction="Engineering completion unit closed; detailed design and downstream release workflows may continue.";
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
