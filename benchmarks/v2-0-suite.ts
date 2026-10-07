import {runV2BenchmarkSuite} from "../src/benchmarks/v2-0.js";

const report=await runV2BenchmarkSuite();
console.log(JSON.stringify(report,null,2));
if(report.failed>0) process.exitCode=1;
