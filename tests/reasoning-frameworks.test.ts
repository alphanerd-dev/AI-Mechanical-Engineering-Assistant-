import {describe,expect,it} from "vitest";
import {registerFrameworkManifest,registerSkillManifest,REASONING_FRAMEWORKS} from "../src/reasoning-frameworks/registry.js";
import {routeReasoningFramework} from "../src/reasoning-frameworks/router.js";

describe("reasoning framework contracts",()=>{
 it("provides versioned initial frameworks",()=>{expect(REASONING_FRAMEWORKS.length).toBe(3);expect(REASONING_FRAMEWORKS.every(x=>x.version==="1.0.0")).toBe(true);});
 it("rejects malformed skill manifests",()=>{expect(()=>registerSkillManifest({schemaVersion:1,id:""})).toThrow(/Invalid skill manifest/);});
 it("rejects unsupported framework manifests",()=>{expect(()=>registerFrameworkManifest({schemaVersion:2,id:"invented"})).toThrow(/Invalid framework manifest/);});
 it("selects 5 Whys for failure investigation",()=>{const r=routeReasoningFramework({taskType:"failure-analysis",risk:"MEDIUM",uncertainty:"MEDIUM",availableInputs:["problem-statement"]});expect(r.status).toBe("SELECTED");expect(r.frameworkId).toBe("five-whys");});
 it("blocks selection when prerequisites are absent",()=>{const r=routeReasoningFramework({taskType:"option-selection",risk:"LOW",uncertainty:"LOW",availableInputs:[]});expect(r.status).toBe("BLOCKED");expect(r.missingInputs).toEqual(["alternatives","criteria"]);});
 it("skips unnecessary framework overhead",()=>{const r=routeReasoningFramework({taskType:"formatting",risk:"LOW",uncertainty:"LOW",availableInputs:[]});expect(r.status).toBe("SKIPPED");});
 it("preserves validation and approval gates at high risk",()=>{const r=routeReasoningFramework({taskType:"architecture-decision",risk:"HIGH",uncertainty:"HIGH",availableInputs:["alternatives","criteria"]});expect(r.status).toBe("SELECTED");expect(r.reasons.join(" ")).toMatch(/validation and approval gates remain mandatory/);});
});
