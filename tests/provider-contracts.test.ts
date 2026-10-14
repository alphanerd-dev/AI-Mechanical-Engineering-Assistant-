import {describe,it,expect} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {OcctProvider} from "../src/providers/occt.js";
import {PyMechanicalProvider} from "../src/providers/pymechanical.js";
import {OdooPlmProvider} from "../src/providers/odooplm.js";
import {PyMechanicalWorkerProvider} from "../src/providers/pymechanical-worker.js";

describe("capability catalog",()=>{
  it("contains risk, provider and status metadata",()=>{
    const c=ENGINEERING_CAPABILITIES.find(x=>x.id==="ANALYSIS.STATIC_STRUCTURAL")!;
    expect(c.risk).toBe("HIGH"); expect(c.providers).toContain("ansys.pymechanical");
  });
});
describe("capability result contract",()=>{
  const capability = "CAD.VALIDATE_GEOMETRY";
  const request = {
    capability,
    risk: "MEDIUM" as const,
    input: { artifactId: "artifact-1" },
  };
  type ProbeRequest = { capability: string; risk: "MEDIUM"; input: Record<string, unknown> };

  function routerWith(
    execute: (request: ProbeRequest) => Promise<unknown>,
    status: "VERIFIED" | "BLOCKED" | "DEPRECATED" = "VERIFIED",
  ) {
    const registry = new CapabilityRegistry();
    registry.registerCapability({
      id: capability,
      domain: "cad",
      purpose: "Validate geometry",
      inputs: ["artifactId"],
      outputs: ["valid"],
      risk: "MEDIUM",
      providers: ["probe"],
      status,
    });
    registry.register({ id: "probe", capabilities: [capability], execute: execute as never });
    return new CapabilityRouter(registry);
  }

  it("rejects a success envelope with no output", async()=>{
    const router = routerWith(async (r) => ({ capability: r.capability, provider: "probe", success: true }));
    const result = await router.execute(request);
    expect(result.success).toBe(false);
    expect(result.error).toContain("without a verifiable output");
  });

  it("rejects mismatched provider identity even when the response says success", async()=>{
    const router = routerWith(async (r) => ({
      capability: r.capability,
      provider: "unexpected-provider",
      success: true,
      output: { valid: true },
    }));
    const result = await router.execute(request);
    expect(result.success).toBe(false);
    expect(result.error).toContain("identity does not match");
  });

  it("rejects malformed evidence references", async()=>{
    const router = routerWith(async (r) => ({
      capability: r.capability,
      provider: "probe",
      success: true,
      output: { valid: true },
      evidenceIds: [""],
    }));
    const result = await router.execute(request);
    expect(result.success).toBe(false);
    expect(result.error).toContain("malformed evidenceIds");
  });

  it("rethrows a sanitized provider exception for capability-specific failure handling", async()=>{
    const router = routerWith(async () => { throw new Error("sensitive provider detail"); });
    await expect(router.execute(request)).rejects.toThrow("Provider execution failed unexpectedly.");
    await expect(router.execute(request)).rejects.not.toThrow("sensitive provider detail");
  });

  it("does not execute capabilities marked BLOCKED or DEPRECATED", async()=>{
    for (const status of ["BLOCKED", "DEPRECATED"] as const) {
      let calls = 0;
      const router = routerWith(async () => {
        calls += 1;
        return { capability, provider: "probe", success: true, output: {} };
      }, status);
      const result = await router.execute(request);
      expect(result.success).toBe(false);
      expect(result.provider).toBe("registry");
      expect(calls).toBe(0);
    }
  });
});

describe("provider adapters",()=>{
  it("maps OCCT geometry validation",async()=>{
    const p=new OcctProvider({call:async(op)=>({operation:op,valid:true})});
    const r=await p.execute({capability:"CAD.VALIDATE_GEOMETRY",risk:"MEDIUM",input:{artifactId:"a1"}});
    expect(r.success).toBe(true); expect((r.output as {valid:boolean}).valid).toBe(true);
  });
  it("maps PyMechanical static structural analysis",async()=>{
    const p=new PyMechanicalProvider({call:async(op)=>({operation:op,converged:true})});
    const r=await p.execute({capability:"ANALYSIS.STATIC_STRUCTURAL",risk:"HIGH",input:{}});
    expect(r.success).toBe(true);
  });
  it("maps the isolated PyMechanical worker boundary",async()=>{
    const p=new PyMechanicalWorkerProvider({runStaticStructural:async()=>({converged:true,maxStressMpa:100,maxDisplacementMm:0.2,warnings:[]})});
    const r=await p.execute({capability:"ANALYSIS.STATIC_STRUCTURAL",risk:"HIGH",input:{artifactId:"a1",material:{name:"steel",yieldStrengthMpa:250},loads:[],constraints:[],mesh:{elementSizeMm:5}}});
    expect(r.success).toBe(true);
  });
  it("maps OdooPLM revision workflow",async()=>{
    const p=new OdooPlmProvider({call:async(op)=>({operation:op})});
    const r=await p.execute({capability:"PLM.CREATE_REVISION",risk:"HIGH",input:{itemId:"P-1",changeDescription:"test"}});
    expect(r.success).toBe(true);
  });
});
