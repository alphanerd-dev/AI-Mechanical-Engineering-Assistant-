import {BenchmarkCaseDefinition,BenchmarkCaseResult,BenchmarkSuiteReport} from "./types.js";

export async function runBenchmarkCase(definition:BenchmarkCaseDefinition):Promise<BenchmarkCaseResult>{
  try{
    const result=await definition.run();
    return {
      id:definition.id,
      name:definition.name,
      passed:true,
      metrics:result.metrics??{},
      evidence:result.evidence??[]
    };
  }catch(error){
    return {
      id:definition.id,
      name:definition.name,
      passed:false,
      metrics:{},
      evidence:[],
      error:error instanceof Error?error.message:String(error)
    };
  }
}

export async function runBenchmarkSuite(
  suiteId:string,
  version:string,
  cases:readonly BenchmarkCaseDefinition[]
):Promise<BenchmarkSuiteReport>{
  if(cases.length===0) throw new Error("Benchmark suite requires at least one case.");
  const duplicateIds=new Set<string>();
  for(const definition of cases){
    if(!definition.id.trim()||!definition.name.trim()) throw new Error("Benchmark case id and name are required.");
    if(duplicateIds.has(definition.id)) throw new Error("Duplicate benchmark case id: "+definition.id+".");
    duplicateIds.add(definition.id);
  }

  const results:BenchmarkCaseResult[]=[];
  for(const definition of cases) results.push(await runBenchmarkCase(definition));

  const passed=results.filter(result=>result.passed).length;
  return {
    suiteId,
    version,
    cases:results,
    passed,
    failed:results.length-passed,
    passRate:passed/results.length
  };
}
