import {CapabilityProvider} from "../capabilities/registry.js";
import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CADDFMRule,evaluateCADDFM,checkCADWallThickness} from "../cad/dfm.js";
import {CADGeometrySnapshot,CADMetricName} from "../cad/metrics.js";
import {compareCADGeometry,CADRegressionCriterion} from "../cad/regression.js";
import {diffCADGeometry} from "../cad/diff.js";
import {judgeCADCandidates,CADJudgeCandidate,CADJudgeCriterion} from "../cad/judge.js";

export class CADAnalysisProvider implements CapabilityProvider{
  readonly id="cad.geometry";
  readonly capabilities=["CAD.DIFF","CAD.COMPARE","CAD.CHECK_WALL_THICKNESS","CAD.CHECK_DFM","CAD.JUDGE"];

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      switch(request.capability){
        case "CAD.DIFF":{
          const input=request.input as unknown as {baseline:CADGeometrySnapshot;candidate:CADGeometrySnapshot;metrics:CADMetricName[]};
          return {capability:request.capability,provider:this.id,success:true,output:diffCADGeometry(input.baseline,input.candidate,input.metrics)};
        }
        case "CAD.COMPARE":{
          const input=request.input as unknown as {baseline:CADGeometrySnapshot;candidate:CADGeometrySnapshot;criteria:CADRegressionCriterion[]};
          return {capability:request.capability,provider:this.id,success:true,output:compareCADGeometry(input.baseline,input.candidate,input.criteria)};
        }
        case "CAD.CHECK_WALL_THICKNESS":{
          const input=request.input as unknown as {metrics:CADGeometrySnapshot["metrics"];minimumMm:number};
          return {capability:request.capability,provider:this.id,success:true,output:checkCADWallThickness(input.metrics,input.minimumMm)};
        }
        case "CAD.CHECK_DFM":{
          const input=request.input as unknown as {metrics:CADGeometrySnapshot["metrics"];rules:CADDFMRule[]};
          return {capability:request.capability,provider:this.id,success:true,output:evaluateCADDFM(input.metrics,input.rules)};
        }
        case "CAD.JUDGE":{
          const input=request.input as unknown as {candidates:CADJudgeCandidate[];criteria:CADJudgeCriterion[]};
          return {capability:request.capability,provider:this.id,success:true,output:judgeCADCandidates(input.candidates,input.criteria)};
        }
        default:
          return {capability:request.capability,provider:this.id,success:false,error:"Unsupported CAD analysis capability"};
      }
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"CAD analysis failed"};
    }
  }
}
