import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringContext} from "../experience/context.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {EngineeringIntentInterpreter,EngineeringIntentDecision,EngineeringIntentInterpretation} from "../intent/types.js";
import {EngineeringIntentSessionStore} from "../intent/session.js";

export class AIEngineeringIntentProvider implements CapabilityProvider{
  id="engineering.ai-intent";
  capabilities=["ENGINEERING.ENTER_FROM_INTENT"];

  constructor(
    private readonly router:CapabilityRouter,
    private readonly interpreter:EngineeringIntentInterpreter,
    private readonly sessions?:EngineeringIntentSessionStore
  ){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ENGINEERING.ENTER_FROM_INTENT"){
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported AI intent capability."};
    }

    const input=request.input as {
      rawIntent?:string;
      projectId?:string;
      sessionId?:string;
      context?:EngineeringContext;
      approval?:unknown;
    };

    if(typeof input.rawIntent!=="string"||!input.rawIntent.trim()){
      return {capability:request.capability,provider:this.id,success:false,error:"rawIntent is required."};
    }
    if(typeof input.projectId!=="string"||!input.projectId.trim()){
      return {capability:request.capability,provider:this.id,success:false,error:"projectId is required."};
    }

    const effectiveProjectId=input.projectId.trim();
    const prior=input.sessionId&&this.sessions
      ?this.sessions.get(input.sessionId,effectiveProjectId)
      :undefined;

    const sessionKnownInputs={
      ...(prior?.interpretation.extractedInputs??{}),
      ...(input.context?.knownInputs??{})
    };
    const effectiveContext:EngineeringContext={
      ...input.context,
      projectId:input.context?.projectId??effectiveProjectId,
      knownInputs:sessionKnownInputs
    };

    const current=await this.interpreter.interpret(input.rawIntent,effectiveContext);
    const interpretation:EngineeringIntentInterpretation={
      ...current,
      goal:current.goal==="engineering task"&&prior?prior.interpretation.goal:current.goal,
      completionUnit:current.completionUnit??prior?.interpretation.completionUnit,
      extractedInputs:{
        ...(prior?.interpretation.extractedInputs??{}),
        ...current.extractedInputs,
        projectId:effectiveProjectId
      },
      contextUsed:[...new Set([
        ...(prior?.interpretation.contextUsed??[]),
        ...current.contextUsed
      ])],
      assumptions:[...new Set([
        ...(prior?.interpretation.assumptions??[]),
        ...current.assumptions
      ])]
    };

    const required=["powerKw","speedRpm","bendingMomentNm","allowableShearStressMpa","proposedDiameterMm"] as const;
    const missing=required.filter(key=>
      typeof interpretation.extractedInputs[key]!=="number"||
      !Number.isFinite(interpretation.extractedInputs[key] as number)
    ).map(key=>({
      powerKw:"power",
      speedRpm:"speed",
      bendingMomentNm:"bending moment",
      allowableShearStressMpa:"allowable shear stress",
      proposedDiameterMm:"proposed shaft diameter"
    }[key]));

    const contextDecision=await this.router.execute({
      capability:"ENGINEERING.RESOLVE_CONTEXT",
      risk:"LOW",
      input:{
        intent:"DESIGN",
        risk:"HIGH",
        consequence:"PROJECT_STATE",
        ambiguity:missing.length===0?"LOW":missing.length<=2?"MEDIUM":"HIGH",
        missingInputs:missing,
        context:effectiveContext
      }
    });

    const resolvedMissing=contextDecision.success
      ?((contextDecision.output as {missingInputs:string[]}).missingInputs)
      :missing;

    const experienceResult=await this.router.execute({
      capability:"ENGINEERING.ASSESS_EXPERIENCE",
      risk:"HIGH",
      input:{
        intent:"DESIGN",
        risk:"HIGH",
        consequence:"PROJECT_STATE",
        ambiguity:resolvedMissing.length===0?"LOW":resolvedMissing.length<=2?"MEDIUM":"HIGH",
        missingInputs:resolvedMissing,
        authorizationRequired:true,
        requestedExperience:"ENGINEERING"
      }
    });

    if(!experienceResult.success){
      return {capability:request.capability,provider:this.id,success:false,error:experienceResult.error??"Experience assessment failed."};
    }

    const experience=experienceResult.output as {
      executionPolicy:string;
      level:string;
      nextQuestion?:string;
      approvalRequired:boolean;
      reasons:string[];
    };

    const unsupported=interpretation.completionUnit!=="ENGINEERING.COMPLETE_SHAFT";
    if(unsupported){
      const decision:EngineeringIntentDecision={
        status:"NEEDS_INPUT",
        validationPassed:false,
        evidenceIds:[],
        nextQuestion:"Clarify the engineering completion unit or design objective."
      };
      return {
        capability:request.capability,
        provider:this.id,
        success:true,
        output:{
          interpretation,
          experience,
          status:"NEEDS_INPUT",
          decision,
          nextQuestion:decision.nextQuestion,
          decisionSummary:"The intent is not supported by the current completion units and was not forced into the shaft workflow."
        }
      };
    }

    if(resolvedMissing.length>0){
      const nextQuestion=experience.nextQuestion??resolvedMissing[0];
      if(input.sessionId&&this.sessions){
        this.sessions.save({
          sessionId:input.sessionId,
          projectId:effectiveProjectId,
          interpretation:{...interpretation,missingInputs:resolvedMissing},
          updatedAt:new Date().toISOString()
        });
      }
      const decision:EngineeringIntentDecision={
        status:"NEEDS_INPUT",
        validationPassed:false,
        evidenceIds:[],
        nextQuestion
      };
      return {
        capability:request.capability,
        provider:this.id,
        success:true,
        output:{
          interpretation:{...interpretation,missingInputs:resolvedMissing},
          experience,
          status:"NEEDS_INPUT",
          decision,
          nextQuestion,
          decisionSummary:"The engineering intent is understood, but one material input is still required before deterministic execution."
        }
      };
    }

    const completionInput={
      ...interpretation.extractedInputs,
      projectId:effectiveProjectId,
      approval:input.approval
    };

    const completionResult=await this.router.execute({
      capability:"ENGINEERING.COMPLETE_SHAFT",
      risk:"HIGH",
      input:completionInput
    });

    const completion=completionResult.output as {
      status:"BLOCKED"|"FAILED"|"WAITING_APPROVAL"|"COMPLETE";
      missingInputs:string[];
      nextAction:string;
      lineage?:{evidenceIds:string[];artifactIds:string[]};
      validation?:{
        passed?:boolean;
        calculatedTorqueNm?:number;
        minimumDiameterMm?:number;
        proposedDiameterMm?:number;
      };
      evidence?:unknown[];
    }|undefined;

    const validation=completion?.validation;
    const evidenceIds=completion?.lineage?.evidenceIds??[];
    const status:EngineeringIntentDecision["status"]=
      completion?.status==="COMPLETE"?"COMPLETE":
      completion?.status==="WAITING_APPROVAL"?"WAITING_APPROVAL":
      completion?.status==="FAILED"?"FAILED":"NEEDS_INPUT";
    const decision:EngineeringIntentDecision={
      status,
      validationPassed:validation?.passed??false,
      torqueNm:validation?.calculatedTorqueNm,
      minimumDiameterMm:validation?.minimumDiameterMm,
      proposedDiameterMm:validation?.proposedDiameterMm,
      evidenceIds,
      nextAction:completion?.nextAction
    };

    if(!completionResult.success){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        output:{
          interpretation,
          experience,
          completion,
          status:"FAILED",
          decision,
          decisionSummary:"The deterministic shaft completion capability failed closed."
        },
        error:completionResult.error??"The shaft completion capability failed."
      };
    }

    return {
      capability:request.capability,
      provider:this.id,
      success:true,
      output:{
        interpretation,
        experience,
        completion,
        status,
        decision,
        nextQuestion:completion?.missingInputs[0],
        decisionSummary:status==="WAITING_APPROVAL"
          ?"The shaft design passed deterministic validation and evidence was generated. Explicit authorized approval is now required."
          :status==="COMPLETE"
            ?"The shaft completion unit is complete and verified."
            :"The shaft completion unit could not complete."
      },
      evidenceIds,
      artifactIds:completion?.lineage?.artifactIds??[]
    };
  }
}
