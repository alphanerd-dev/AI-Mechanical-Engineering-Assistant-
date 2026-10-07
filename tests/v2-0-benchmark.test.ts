import {describe,expect,it} from "vitest";
import {runV2BenchmarkSuite} from "../src/benchmarks/v2-0.js";

describe("V2.0 benchmark suite",()=>{
  it("passes every cross-boundary conformance case",async()=>{
    const report=await runV2BenchmarkSuite();
    expect(report.suiteId).toBe("engineering-core-v2.0");
    expect(report.version).toBe("2.0");
    expect(report.failed).toBe(0);
    expect(report.passRate).toBe(1);
    expect(report.cases).toHaveLength(8);
  });

  it("keeps case ids unique and preserves evidence for every pass",async()=>{
    const report=await runV2BenchmarkSuite();
    const ids=report.cases.map(item=>item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(report.cases.every(item=>item.passed&&item.evidence.length>0)).toBe(true);
  });
});
