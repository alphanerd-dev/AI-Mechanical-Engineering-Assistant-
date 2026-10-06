import {describe,expect,it} from "vitest";
import {evaluateManufacturingDFM} from "../src/manufacturing/dfm.js";
import {estimateManufacturingEconomics} from "../src/manufacturing/estimation.js";
import {generateManufacturingBOM} from "../src/manufacturing/bom.js";
import {prepareManufacturingRelease} from "../src/manufacturing/release.js";
import {CAMBoundaryProvider} from "../src/providers/cam-boundary.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {V1_21_CAPABILITIES} from "../src/capabilities/v1-21.js";
import {ManufacturingIntelligenceProvider} from "../src/providers/manufacturing-intelligence.js";

const metrics={
  solidCount:1,
  volumeMm3:1000,
  surfaceAreaMm2:600,
  boundingBoxMm:{x:100,y:20,z:10},
  watertight:true,
  minWallThicknessMm:2.5,
  maxOverhangDeg:30
};

const plan={
  id:"PLAN-1",
  projectId:"P-1",
  name:"Machining plan",
  partArtifactIds:["part.step"],
  requirementIds:["REQ-1"],
  operations:[{
    id:"OP-1",
    sequence:1,
    name:"Mill",
    process:"MACHINING" as const,
    acceptanceCriteria:["Dimension inspected"]
  }],
  status:"READY" as const,
  assumptions:[]
};

describe("V1.21 measured DFM",()=>{
  it("passes from explicit measured geometry and rules",()=>{
    const result=evaluateManufacturingDFM({metrics,rules:[{kind:"MIN_WALL_THICKNESS_MM",minimumMm:2}],process:"MACHINING"});
    expect(result.status).toBe("PASS");
    expect(result.process).toBe("MACHINING");
  });
  it("returns INCOMPLETE when required measurement data is absent",()=>{
    const result=evaluateManufacturingDFM({metrics:{...metrics,minWallThicknessMm:undefined},rules:[{kind:"MIN_WALL_THICKNESS_MM",minimumMm:2}]});
    expect(result.status).toBe("INCOMPLETE");
  });
});

describe("V1.21 manufacturing economics",()=>{
  it("estimates time and cost only from explicit rates",()=>{
    const result=estimateManufacturingEconomics({
      currency:"NGN",
      material:{quantity:2,unit:"kg",unitCost:10,scrapFraction:0.1},
      operations:[{id:"OP-1",quantity:10,setupMinutes:5,cycleMinutesPerUnit:2,machineRatePerHour:60,laborRatePerHour:60}]
    });
    expect(result.status).toBe("ESTIMATED");
    expect(result.materialQuantity).toBeCloseTo(2.2);
    expect(result.totalTimeMinutes).toBeCloseTo(25);
    expect(result.materialCost).toBeCloseTo(22);
    expect(result.totalCost).toBeCloseTo(72);
  });
  it("fails closed when an explicit rate is missing",()=>{
    const result=estimateManufacturingEconomics({
      currency:"NGN",
      material:{quantity:2,unit:"kg",unitCost:10,scrapFraction:0},
      operations:[{id:"OP-1",quantity:1,setupMinutes:1,cycleMinutesPerUnit:1,machineRatePerHour:60,laborRatePerHour:NaN}]
    });
    expect(result.status).toBe("INCOMPLETE");
  });
});

describe("V1.21 BOM and release",()=>{
  it("aggregates repeated part/revision lines deterministically",()=>{
    const result=generateManufacturingBOM("BOM-1","P-1","A",[
      {partNumber:"PN-2",name:"Bracket",revision:"A",quantity:2,unit:"EA",artifactId:"a.step"},
      {partNumber:"PN-1",name:"Plate",revision:"A",quantity:1,unit:"EA",artifactId:"b.step"},
      {partNumber:"PN-2",name:"Bracket",revision:"A",quantity:3,unit:"EA",artifactId:"a.step"}
    ]);
    expect(result.status).toBe("GENERATED");
    expect(result.bom?.status).toBe("READY");
    expect(result.bom?.items[0].partNumber).toBe("PN-1");
    expect(result.bom?.items.find(x=>x.partNumber==="PN-2")?.quantity).toBe(5);
  });
  it("blocks release when a BOM item is missing an artifact link",()=>{
    const bom=generateManufacturingBOM("BOM-1","P-1","A",[{partNumber:"PN-1",name:"Plate",revision:"A",quantity:1,unit:"EA"}]).bom!;
    const result=prepareManufacturingRelease({releaseId:"REL-1",processPlan:plan,bom,requiredArtifactIds:["part.step"]});
    expect(result.status).toBe("BLOCKED");
    expect(result.checks.bom).toBe(false);
  });
  it("keeps a structurally ready release unreleased without human approval",()=>{
    const bom=generateManufacturingBOM("BOM-1","P-1","A",[{partNumber:"PN-1",name:"Plate",revision:"A",quantity:1,unit:"EA",artifactId:"b.step"}]).bom!;
    const result=prepareManufacturingRelease({releaseId:"REL-1",processPlan:plan,bom,requiredArtifactIds:["part.step"]});
    expect(result.status).toBe("READY");
    expect(result.checks.approval).toBe(false);
  });
  it("releases only with explicit human approval",()=>{
    const bom=generateManufacturingBOM("BOM-1","P-1","A",[{partNumber:"PN-1",name:"Plate",revision:"A",quantity:1,unit:"EA",artifactId:"b.step"}]).bom!;
    const result=prepareManufacturingRelease({
      releaseId:"REL-1",
      processPlan:plan,
      bom,
      requiredArtifactIds:["part.step"],
      approval:{approvedBy:"Engineer",approvedAt:"2026-10-06T19:00:00+01:00"}
    });
    expect(result.status).toBe("RELEASED");
  });
});

describe("V1.21 CAM boundary",()=>{
  it("does not claim a toolpath or slice without a configured runtime",async()=>{
    const provider=new CAMBoundaryProvider();
    const result=await provider.execute({capability:"MANUFACTURING.CAM_PLAN",risk:"HIGH",input:{partArtifactId:"part.step",process:"MILLING",operationIds:["OP-1"],parameters:{}}});
    expect(result.success).toBe(false);
    expect((result.output as any).status).toBe("UNAVAILABLE");
  });
});

describe("V1.21 routed capabilities",()=>{
  it("registers and routes manufacturing-intelligence capabilities",async()=>{
    const registry=new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.registerCatalog(V1_21_CAPABILITIES);
    registry.register(new ManufacturingIntelligenceProvider());
    registry.register(new CAMBoundaryProvider());
    const router=new CapabilityRouter(registry);
    const dfm=await router.execute({capability:"MANUFACTURING.CHECK_DFM",risk:"MEDIUM",input:{metrics,rules:[{kind:"MIN_WALL_THICKNESS_MM",minimumMm:2}],process:"MACHINING"}});
    expect(dfm.success).toBe(true);
    const estimate=await router.execute({capability:"MANUFACTURING.ESTIMATE_ECONOMICS",risk:"MEDIUM",input:{
      currency:"NGN",
      material:{quantity:1,unit:"kg",unitCost:5,scrapFraction:0},
      operations:[{id:"OP-1",quantity:1,setupMinutes:1,cycleMinutesPerUnit:1,machineRatePerHour:60,laborRatePerHour:60}]
    }});
    expect(estimate.success).toBe(true);
  });
});
