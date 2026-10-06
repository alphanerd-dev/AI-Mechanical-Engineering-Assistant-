import {CADGeometrySnapshot,CADMetricName,readCADMetric} from "./metrics.js";
import {CADDFMRule,evaluateCADDFM} from "./dfm.js";

export type CADJudgeCriterion=
  {kind:"MUST_PASS_DFM";rules:CADDFMRule[]}|
  {kind:"MINIMIZE_METRIC";metric:CADMetricName;weight:number}|
  {kind:"MAXIMIZE_METRIC";metric:CADMetricName;weight:number};

export interface CADJudgeCandidate{
  id:string;
  snapshot:CADGeometrySnapshot;
}

export interface CADJudgeScore{
  candidateId:string;
  eligible:boolean;
  score:number;
  reasons:string[];
}

export interface CADJudgeResult{
  status:"PASS"|"INCOMPLETE";
  winnerId?:string;
  scores:CADJudgeScore[];
  blockingReasons:string[];
}

function positiveWeight(value:number):boolean{
  return Number.isFinite(value)&&value>0;
}

export function judgeCADCandidates(
  candidates:CADJudgeCandidate[],
  criteria:CADJudgeCriterion[]
):CADJudgeResult{
  if(candidates.length===0)
    return {status:"INCOMPLETE",scores:[],blockingReasons:["At least one CAD candidate is required."]};
  if(criteria.length===0)
    return {status:"INCOMPLETE",scores:[],blockingReasons:["At least one explicit judging criterion is required."]};

  const globalBlocking:string[]=[];
  for(const criterion of criteria){
    if((criterion.kind==="MINIMIZE_METRIC"||criterion.kind==="MAXIMIZE_METRIC")&&!positiveWeight(criterion.weight))
      globalBlocking.push(`Criterion weight for ${criterion.kind} is invalid.`);
  }
  if(globalBlocking.length)
    return {status:"INCOMPLETE",scores:[],blockingReasons:globalBlocking};

  const rawScores=new Map<string,number>();
  const reasons=new Map<string,string[]>();
  const eligible=new Map<string,boolean>();
  candidates.forEach(candidate=>{
    rawScores.set(candidate.id,0);
    reasons.set(candidate.id,[]);
    eligible.set(candidate.id,true);
  });

  for(const criterion of criteria){
    if(criterion.kind==="MUST_PASS_DFM"){
      for(const candidate of candidates){
        const result=evaluateCADDFM(candidate.snapshot.metrics,criterion.rules);
        if(result.status!=="PASS"){
          eligible.set(candidate.id,false);
          reasons.get(candidate.id)?.push(...result.blockingReasons);
        }
      }
      continue;
    }

    const values=candidates.map(candidate=>({
      id:candidate.id,
      value:readCADMetric(candidate.snapshot.metrics,criterion.metric)
    }));
    if(values.some(item=>typeof item.value!=="number"||!Number.isFinite(item.value)))
      return {status:"INCOMPLETE",scores:[],blockingReasons:[`Criterion metric ${criterion.metric} is missing or non-finite for at least one candidate.`]};

    const numeric=values.map(item=>({id:item.id,value:item.value as number}));
    const best=criterion.kind==="MINIMIZE_METRIC"
      ?Math.min(...numeric.map(item=>item.value))
      :Math.max(...numeric.map(item=>item.value));

    for(const item of numeric){
      const normalized=item.value===best?1:(
        criterion.kind==="MINIMIZE_METRIC"&&best>0
          ?best/item.value
          :criterion.kind==="MAXIMIZE_METRIC"&&best>0
            ?item.value/best
            :0
      );
      rawScores.set(item.id,(rawScores.get(item.id)??0)+normalized*criterion.weight);
    }
  }

  const scores=candidates.map(candidate=>({
    candidateId:candidate.id,
    eligible:eligible.get(candidate.id)===true,
    score:eligible.get(candidate.id)===true?(rawScores.get(candidate.id)??0):Number.NEGATIVE_INFINITY,
    reasons:reasons.get(candidate.id)??[]
  })).sort((a,b)=>b.score-a.score);

  const winner=scores.find(score=>score.eligible);
  if(!winner)
    return {status:"INCOMPLETE",scores,blockingReasons:["No candidate satisfies all mandatory judging criteria."]};

  return {status:"PASS",winnerId:winner.candidateId,scores,blockingReasons:[]};
}
