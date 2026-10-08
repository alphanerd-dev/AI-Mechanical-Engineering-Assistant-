import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {EngineeringContext} from "../experience/context.js";
import {assessRiskAdaptiveExperience} from "../experience/risk-adaptive.js";
import {CapabilityRouter} from "../capabilities/router.js";
import {EngineeringIntentInterpreter} from "../intent/types.js";

export class AIEngineeringIntentProvider implements CapabilityProvider{
  id="engineering.ai-intent";
  capabilities=["ENGINEERING.ENTER_FROM_INTENT"];

  constructor(
    private readonly router:CapabilityRouter,
    private readonly interpreter:EngineeringIntentInterpreter
  ){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    if(request.capability!=="ENGINEERING.ENTER_FROM_INTENT"){
      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported AI intent capability."};
    }

    const input=request.input as {
      rawIntent?:string;
      projectId?:string;
      context?:EngineeringContext;
      approval?:unknown;
    };

    if(typeof input.rawIntent!=="string"||!input.rawIntent.trim()){
      return {capability:request.capability,provider:this.id,success:false,error:"rawIntent is required."};
    }
    if(typeof input.projectId!=="string"||!input.projectId.trim()){
      return {capability:request.capability,provider:this.id,success:false,error:"projectId is required."};
    }

    const interpretationBase=await this.interpreter.interpret(input.rawIntent,input.context);
    const effectiveProjectId=input.projectId.trim();
    const interpretation={
      ...interpretationBase,
      extractedInputs:{
        ...interpretationBase.extractedInputs,
        projectId:effectiveProjectId
      }
    };
    const missing=[...interpretation.missingInputs];

    const contextDecision=await this.router.execute({
      capability:"ENGINEERING.RESOLVE_CONTEXT",
      risk:"LOW",
      input:{
        intent:"DESIGN",
        risk:"HIGH",
        consequence:"PROJECT_STATE",
        ambiguity:interpretation.ambiguity,
        missingInputs:missing,
        context:input.context
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
        ambiguity:interpretation.ambiguity,
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

    if(resolvedMissing.length>0){
      const nextQuestion=experience.nextQuestion??resolvedMissing[0];
      return {
        capability:request.capability,
        provider:this.id,
        success:true,
        output:{
          interpretation:{...interpretation,missingInputs:resolvedMissing},
          experience,
          status:"NEEDS_INPUT",
          nextQuestion,
          decisionSummary:"The engineering intent is understood, but one material input is still required before deterministic execution."
        }
      };
    }

    if(interpretation.completionUnit!=="ENGINEERING.COMPLETE_SHAFT"){
      return {
        capability:request.capability,
        provider:this.id,
        success:true,
        output:{
          interpretation,
          experience,
          status:"NEEDS_INPUT",
          nextQuestion:"Clarify the engineering completion unit or design objective.",
          decisionSummary:"The intent could not be mapped to a supported completion unit."
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

    if(!completionResult.success){
      return {
        capability:request.capability,
        provider:this.id,
        success:false,
        output:{
          interpretation,
          experience,
          completion:completionResult.output,
          status:"FAILED",
          decisionSummary:"The deterministic shaft completion capability failed closed."
        },
        error:completionResult.error??"The shaft completion capability failed."
      };
    }

    const completion=completionResult.output as {
      status:"BLOCKED"|"FAILED"|"WAITING_APPROVAL"|"COMPLETE";
      missingInputs:string[];
      nextAction:string;
      lineage:{evidenceIds:string[];artifactIds:string[]};
      validation?:unknown;
      evidence?:unknown[];
    };
    const status=completion.status==="COMPLETE"?"COMPLETE":
      completion.status==="WAITING_APPROVAL"?"WAITING_APPROVAL":
      completion.status==="FAILED"?"FAILED":"NEEDS_INPUT";
    const validation=completion.validation as {
      passed?:boolean;
      calculatedTorqueNm?:number;
      minimumDiameterMm?:number;
      proposedDiameterMm?:number;
    }|null|undefined;
    const decision={
      status,
      validationPassed:validation?.passed??false,
      torqueNm:validation?.calculatedTorqueNm,
      minimumDiameterMm:validation?.minimumDiameterMm,
      proposedDiameterMm:validation?.proposedDiameterMm,
      evidenceIds:completion.lineage.evidenceIds,
      nextAction:completion.nextAction
    };

    return {
      capability:request.capability,
      provider:this.id,
      success:completion.status!=="FAILED",
      output:{
        interpretation,
        experience,
        completion,
        status,
        decision,
        nextQuestion:completion.missingInputs[0],
        decisionSummary:completion.status==="WAITING_APPROVAL"
          ?"The shaft design passed deterministic validation and evidence was generated. Explicit authorized approval is now required."
          :completion.status==="COMPLETE"
            ?"The shaft completion unit is complete and verified."
            :"The shaft completion unit could not complete."
      },
      error:completion.status==="FAILED"?completion.nextAction:undefined,
      evidenceIds:completion.lineage.evidenceIds,
      artifactIds:completion.lineage.artifactIds
    };
  }
}
