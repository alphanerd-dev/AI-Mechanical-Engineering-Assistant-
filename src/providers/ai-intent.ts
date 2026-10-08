import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult,EngineeringDecisionMetric} from "../core/types.js";
import {EngineeringContext} from "../experience/context.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {EngineeringIntentInterpreter,EngineeringIntentDecision,EngineeringIntentInterpretation} from "../intent/types.js";
import {EngineeringIntentSessionStore} from "../intent/session.js";
import {EngineeringApprovalRequest,EngineeringCompletionReport} from "../completion/types.js";
import {EngineeringCompletionUnitRegistry,createDefaultEngineeringCompletionUnitRegistry} from "../completion/registry";

export class AIEngineeringIntentProvider implements CapabilityProvider{
  id="engineering.ai-intent";
  capabilities=["ENGINEERING.ENTER_FROM_INTENT"];

  constructor(
    private readonly router:CapabilityRouter,
    private readonly interpreter:EngineeringIntentInterpreter,
    private readonly sessions?:EngineeringIntentSessionStore,
    private readonly completionUnits:EngineeringCompletionUnitRegistry=createDefaultEngineeringCompletionUnitRegistry()
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
      approval?:EngineeringApprovalRequest;
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

    const unit=interpretation.completionUnit
      ?this.completionUnits.resolve(interpretation.completionUnit)
      :undefined;

    const contextMissing=unit?.requiredInputs
      .filter(({key})=>{
        const value=interpretation.extractedInputs[key]??effectiveContext.knownInputs?.[key];
        return typeof value!=="number"&&typeof value!=="string";
      })
      .map(({label})=>label)??[];

    const contextDecision=await this.router.execute({
      capability:"ENGINEERING.RESOLVE_CONTEXT",
      risk:"LOW",
      input:{
        intent:"DESIGN",
        risk:"HIGH",
        consequence:"PROJECT_STATE",
        ambiguity:contextMissing.length===0?"LOW":contextMissing.length<=2?"MEDIUM":"HIGH",
        missingInputs:contextMissing,
        context:effectiveContext
      }
    });

    const resolvedMissing=contextDecision.success
      ?((contextDecision.output as {missingInputs:string[]}).missingInputs)
      :contextMissing;

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

    if(!unit){
      const decision:EngineeringIntentDecision={
        status:"NEEDS_INPUT",
        validationPassed:false,
        metrics:[],
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
          decisionSummary:"The intent is not supported by a registered engineering completion unit and was not forced into another workflow."
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
        metrics:[],
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

    let completion:EngineeringCompletionReport;
    try{
      completion=await unit.execute({
        projectId:effectiveProjectId,
        inputs:interpretation.extractedInputs,
        approval:input.approval
      },this.router);
    }catch(error){
      const reason=error instanceof Error?error.message:"Engineering completion unit failed.";
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        error:reason,
        output:{
          interpretation,
          experience,
          status:"FAILED",
          decision:{
            status:"FAILED",
            validationPassed:false,
            metrics:[],
            evidenceIds:[],
            nextAction:reason
          },
          decisionSummary:"The selected engineering completion unit failed closed before producing an accepted result."
        }
      };
    }

    const evidenceIds=completion.lineage.evidenceIds;
    const status:EngineeringIntentDecision["status"]=
      completion.status==="COMPLETE"?"COMPLETE":
      completion.status==="WAITING_APPROVAL"?"WAITING_APPROVAL":
      completion.status==="FAILED"?"FAILED":"NEEDS_INPUT";

    const metrics:EngineeringDecisionMetric[]=[...completion.decisionMetrics];
    const decision:EngineeringIntentDecision={
      status,
      validationPassed:completion.validation?.passed??false,
      metrics,
      evidenceIds,
      nextAction:completion.nextAction
    };

    const resultSuccess=completion.status!=="FAILED";
    return {
      capability:request.capability,
      provider:this.id,
      success:resultSuccess,
      output:{
        interpretation,
        experience,
        completion,
        status,
        decision,
        nextQuestion:completion.missingInputs[0],
        decisionSummary:status==="WAITING_APPROVAL"
          ?"The engineering completion unit passed deterministic validation and produced evidence. Explicit authorized approval is now required."
          :status==="COMPLETE"
            ?"The engineering completion unit is complete and verified."
            :status==="FAILED"
              ?"The deterministic engineering completion unit failed closed."
              :"The engineering completion unit requires further input."
      },
      error:resultSuccess?undefined:completion.nextAction,
      evidenceIds,
      artifactIds:completion.lineage.artifactIds
    };
  }
}
