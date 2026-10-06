import {EvidenceRecord} from "../artifacts/engineering-artifacts.js";
import {ResearchExtraction,ResearchResult} from "./types.js";

export function researchEvidence(result:ResearchResult):EvidenceRecord[]{
  const extractions=result.extractions??[];
  return result.findings.map(f=>{
    const extraction=f.extractionId
      ? extractions.find(e=>e.id===f.extractionId)
      : undefined;
    const verified=Boolean(extraction&&extraction.status==="VERIFIED");

    return {
      id:"research-evidence:"+f.id,
      type:"SOURCE" as const,
      claim:f.claim,
      source:f.sourceIds.join(","),
      method:extraction ? "source-inspection" : "research-provider",
      value:extraction
        ? {excerpt:extraction.excerpt,location:extraction.location,extractionId:extraction.id}
        : undefined,
      status:verified ? "VERIFIED" : f.informationStatus,
      timestamp:new Date().toISOString()
    };
  });
}

export function extractionEvidence(extraction:ResearchExtraction):EvidenceRecord{
  return {
    id:"research-extraction:"+extraction.id,
    type:"SOURCE",
    claim:extraction.excerpt,
    source:extraction.sourceId,
    method:"source-inspection",
    value:{location:extraction.location,extractor:extraction.extractor},
    status:extraction.status==="VERIFIED" ? "VERIFIED" : "ASSUMED",
    timestamp:extraction.extractedAt
  };
}
