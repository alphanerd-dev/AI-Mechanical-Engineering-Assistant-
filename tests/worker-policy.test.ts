import {describe,expect,it} from "vitest";
import {PYTHON_NUMERICAL_WORKER_POLICY,validateWorkerRequest} from "../src/execution/worker-policy.js";

describe("worker policy",()=>{
  it("allows capabilities implemented by the worker within timeout",()=>{
    expect(validateWorkerRequest(PYTHON_NUMERICAL_WORKER_POLICY,"UNITS.CONVERT",5000)).toEqual([]);
  });
  it("blocks capabilities outside the worker allowlist and excessive timeouts",()=>{
    expect(validateWorkerRequest(PYTHON_NUMERICAL_WORKER_POLICY,"EXECUTE_ARBITRARY_PYTHON",60000)).toHaveLength(2);
  });
});
