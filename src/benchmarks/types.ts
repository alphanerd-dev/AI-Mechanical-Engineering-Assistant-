export type BenchmarkMetric=string|number|boolean;

export interface BenchmarkCaseResult{
  id:string;
  name:string;
  passed:boolean;
  metrics:Record<string,BenchmarkMetric>;
  evidence:string[];
  error?:string;
}

export interface BenchmarkCaseDefinition{
  id:string;
  name:string;
  run:()=>Promise<{metrics?:Record<string,BenchmarkMetric>;evidence?:string[]}>;
}

export interface BenchmarkSuiteReport{
  suiteId:string;
  version:string;
  cases:BenchmarkCaseResult[];
  passed:number;
  failed:number;
  passRate:number;
}
