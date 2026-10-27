import {describe,expect,it} from "vitest";
import {getEngineeringIntentRetryGuidance} from "../src/intent/retry-guidance.js";

describe("engineering intent retry guidance",()=>{
  it("preserves the actual failure and warns that server-side work may have occurred",()=>{
    const result=getEngineeringIntentRetryGuidance("The connection timed out.");
    expect(result).toContain("The connection timed out.");
    expect(result).toContain("may have reached the server");
    expect(result).toContain("draft has been preserved");
    expect(result).toContain("Review the project's execution history");
    expect(result).toContain("missing response does not prove that no work occurred");
  });

  it("provides safe guidance when the error message is empty",()=>{
    const result=getEngineeringIntentRetryGuidance("   ");
    expect(result).toContain("did not return a usable decision");
    expect(result).toContain("Review the project's execution history");
  });
});
