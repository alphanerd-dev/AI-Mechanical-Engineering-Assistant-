import {ResearchSourceClass,ResearchSource} from "./types.js";
const CLASS_WEIGHT:Record<ResearchSourceClass,number>={STANDARD:1.00,MANUFACTURER:0.95,PEER_REVIEWED:0.92,TEXTBOOK:0.88,PATENT:0.78,ENGINEERING_ORG:0.82,GENERAL_WEB:0.45};
export function authorityScore(sourceClass:ResearchSourceClass):number{return CLASS_WEIGHT[sourceClass];}
export function rankSources(sources:ResearchSource[]):ResearchSource[]{return [...sources].sort((a,b)=>b.authorityScore-a.authorityScore);}
