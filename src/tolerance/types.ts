export type ToleranceStackStatus="VALID"|"INCOMPLETE"|"INVALID";
export interface ToleranceContributor{
  id:string;nominal:number;plus:number;minus:number;unit:string;sign?:1|-1;coefficient?:number;oneSigma?:number;
}
export interface ToleranceStackInput{contributors:ToleranceContributor[];unit:string;}
export interface WorstCaseToleranceResult{status:ToleranceStackStatus;nominal?:number;minimum?:number;maximum?:number;plus?:number;minus?:number;unit:string;message:string;}
export interface RSSToleranceResult{status:ToleranceStackStatus;nominal?:number;oneSigma?:number;plusMinus?:number;minimum?:number;maximum?:number;unit:string;message:string;}
export interface ParsedToleranceCallout{status:"PARSED"|"INCOMPLETE"|"INVALID";nominal?:number;plus?:number;minus?:number;unit:string;standard?:"GENERIC"|"ISO_286";designation?:string;message:string;}
export interface FitCalloutInput{nominal:number;unit:string;plus:number;minus:number;standard?:"GENERIC"|"ISO_286";designation?:string;}
