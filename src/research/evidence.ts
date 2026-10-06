import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {ResearchResult} from "./types.js";

export function researchEvidence(result:ResearchResult):EvidenceRecord[]{
  return result.findings.map(f=>({id:"research-evidence:"+f.id,type:"SOURCE" as const,claim:f.claim,source:f.sourceIds.join(","),method:"research-provider",status:f.informationStatus,timestamp:new Date().toISOString()}));
}
