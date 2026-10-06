import {describe,it,expect} from "vitest";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {EngineeringVerificationProvider} from "../src/providers/engineering-verification.js";

describe("engineering verification provider",()=>{
  it("verifies a project through the capability router",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.register(new EngineeringVerificationProvider());

    const router=new CapabilityRouter(registry);
    const r=await router.execute({
      capability:"ENGINEERING.VERIFY_PROJECT",
      risk:"HIGH",
      input:{
        project:{
          id:"P-1",name:"Test",stage:"verification",status:"ACTIVE",
          requirements:[{id:"REQ-1",name:"strength",priority:"MUST",status:"OPEN"}],
          assumptions:[],openQuestions:[],unresolvedRisks:[],events:[]
        },
        evidence:[{
          id:"E-1",type:"CALCULATION",claim:"stress is below limit",
          status:"VERIFIED",requirementIds:["REQ-1"],timestamp:"2026-01-01T00:00:00Z"
        }],
        artifacts:[]
      }
    });

    expect(r.success).toBe(true);
    expect((r.output as {status:string}).status).toBe("PASS");
    expect(r.evidenceIds).toEqual(["E-1"]);
  });
});
