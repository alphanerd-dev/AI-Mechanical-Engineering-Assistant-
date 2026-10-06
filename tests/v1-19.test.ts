import {describe,it,expect} from "vitest";
import {CADAnalysisProvider} from "../src/providers/cad-analysis.js";
import {diffCADGeometry} from "../src/cad/diff.js";
import {checkCADWallThickness,evaluateCADDFM} from "../src/cad/dfm.js";
import {judgeCADCandidates} from "../src/cad/judge.js";
import {compareCADGeometry} from "../src/cad/regression.js";

const baseline={
  artifactId:"cad-baseline",
  backend:"build123d",
  sourceSha256:"aaa",
  metrics:{
    solidCount:1,
    volumeMm3:1000,
    surfaceAreaMm2:600,
    boundingBoxMm:{x:100,y:20,z:10},
    watertight:true,
    minWallThicknessMm:2.5,
    maxOverhangDeg:30
  }
};

const candidate={
  artifactId:"cad-candidate",
  backend:"build123d",
  sourceSha256:"bbb",
  metrics:{
    solidCount:1,
    volumeMm3:1005,
    surfaceAreaMm2:601,
    boundingBoxMm:{x:100.1,y:20,z:10},
    watertight:true,
    minWallThicknessMm:2.6,
    maxOverhangDeg:28
  }
};

describe("V1.19 CAD validation/regression/diff",()=>{
  it("reports structured geometry differences",()=>{
    const result=diffCADGeometry(baseline,candidate,["volumeMm3","boundingBoxMm.x","watertight"]);
    expect(result.status).toBe("CHANGED");
    expect(result.geometryChanged).toBe(true);
    expect(result.sourceChanged).toBe(true);
    expect(result.diffs.find(x=>x.metric==="volumeMm3")?.delta).toBe(5);
  });

  it("passes explicit regression tolerances",()=>{
    const result=compareCADGeometry(baseline,candidate,[
      {metric:"volumeMm3",tolerance:{absolute:10}},
      {metric:"boundingBoxMm.x",tolerance:{relative:0.002}}
    ]);
    expect(result.status).toBe("PASS");
  });

  it("returns INCOMPLETE when a compared metric is missing",()=>{
    const result=compareCADGeometry(
      baseline,
      {...candidate,metrics:{...candidate.metrics,minWallThicknessMm:undefined}},
      [{metric:"minWallThicknessMm"}]
    );
    expect(result.status).toBe("INCOMPLETE");
  });

  it("validates wall thickness without claiming full manufacturability",()=>{
    expect(checkCADWallThickness(candidate.metrics,2.5).status).toBe("PASS");
    expect(checkCADWallThickness({...candidate.metrics,minWallThicknessMm:2},2.5).status).toBe("FAIL");
    expect(checkCADWallThickness({...candidate.metrics,minWallThicknessMm:undefined},2.5).status).toBe("INCOMPLETE");
  });

  it("evaluates measured DFM rules",()=>{
    const result=evaluateCADDFM(candidate.metrics,[
      {kind:"MIN_WALL_THICKNESS_MM",minimumMm:2.5},
      {kind:"MAX_OVERHANG_DEG",maximumDeg:45},
      {kind:"REQUIRE_WATERTIGHT",required:true},
      {kind:"MAX_ENVELOPE_MM",axis:"x",maximumMm:120},
      {kind:"MIN_SOLID_COUNT",minimum:1}
    ]);
    expect(result.status).toBe("PASS");
  });

  it("returns INCOMPLETE when DFM measurement evidence is missing",()=>{
    const result=evaluateCADDFM({...candidate.metrics,minWallThicknessMm:undefined},[
      {kind:"MIN_WALL_THICKNESS_MM",minimumMm:2.5}
    ]);
    expect(result.status).toBe("INCOMPLETE");
  });

  it("selects a winner only from explicit criteria",()=>{
    const result=judgeCADCandidates(
      [
        {id:"A",snapshot:baseline},
        {id:"B",snapshot:candidate}
      ],
      [
        {kind:"MUST_PASS_DFM",rules:[{kind:"MIN_WALL_THICKNESS_MM",minimumMm:2.5}]},
        {kind:"MINIMIZE_METRIC",metric:"volumeMm3",weight:1}
      ]
    );
    expect(result.status).toBe("PASS");
    expect(result.winnerId).toBe("A");
  });

  it("does not invent a verdict when mandatory judging data is missing",()=>{
    const result=judgeCADCandidates(
      [{id:"A",snapshot:{...candidate,metrics:{...candidate.metrics,minWallThicknessMm:undefined}}}],
      [{kind:"MUST_PASS_DFM",rules:[{kind:"MIN_WALL_THICKNESS_MM",minimumMm:2.5}]}]
    );
    expect(result.status).toBe("INCOMPLETE");
  });

  it("routes all V1.19 deterministic CAD analysis capabilities",async()=>{
    const provider=new CADAnalysisProvider();
    const cases:Array<[string,Record<string,unknown>]>=[
      ["CAD.DIFF",{baseline,candidate,metrics:["volumeMm3"]}],
      ["CAD.COMPARE",{baseline,candidate,criteria:[{metric:"volumeMm3",tolerance:{absolute:10}}]}],
      ["CAD.CHECK_WALL_THICKNESS",{metrics:candidate.metrics,minimumMm:2}],
      ["CAD.CHECK_DFM",{metrics:candidate.metrics,rules:[{kind:"MIN_WALL_THICKNESS_MM",minimumMm:2}]}],
      ["CAD.JUDGE",{candidates:[{id:"A",snapshot:candidate}],criteria:[{kind:"MAXIMIZE_METRIC",metric:"minWallThicknessMm",weight:1}]}]
    ];
    for(const [capability,input] of cases){
      const result=await provider.execute({capability,risk:"HIGH",input});
      expect(result.success).toBe(true);
    }
  });
});
