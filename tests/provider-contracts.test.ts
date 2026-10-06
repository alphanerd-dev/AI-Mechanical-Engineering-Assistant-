import {describe,it,expect} from "vitest";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {OcctProvider} from "../src/providers/occt.js";
import {PyMechanicalProvider} from "../src/providers/pymechanical.js";
import {OdooPlmProvider} from "../src/providers/odooplm.js";

describe("capability catalog",()=>{
  it("contains risk, provider and status metadata",()=>{
    const c=ENGINEERING_CAPABILITIES.find(x=>x.id==="ANALYSIS.STATIC_STRUCTURAL")!;
    expect(c.risk).toBe("HIGH"); expect(c.providers).toContain("ansys.pymechanical");
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
  it("maps OdooPLM revision workflow",async()=>{
    const p=new OdooPlmProvider({call:async(op)=>({operation:op})});
    const r=await p.execute({capability:"PLM.CREATE_REVISION",risk:"HIGH",input:{itemId:"P-1",changeDescription:"test"}});
    expect(r.success).toBe(true);
  });
});
