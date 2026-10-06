import {describe,expect,it} from "vitest";
import {solveEngineeringConstraints,exploreEngineeringDesignSpace} from "../src/constraints/solver.js";
import {worstCaseTolerance,rssTolerance} from "../src/tolerance/stack.js";
import {makeISO286FitCallout,parseToleranceCallout} from "../src/tolerance/callout.js";
import {CapabilityRegistry} from "../src/capabilities/registry.js";
import {CapabilityRouter} from "../src/capabilities/router.js";
import {ENGINEERING_CAPABILITIES} from "../src/capabilities/catalog.js";
import {V1_20_CAPABILITIES} from "../src/capabilities/v1-20.js";
import {ConstraintEngineeringProvider} from "../src/providers/constraint-engineering.js";

const unitFields={x:"mm",y:"mm"};

describe("V1.20 constraint solving",()=>{
  it("solves a bounded linear unit-tagged system",()=>{
    const r=solveEngineeringConstraints({
      variables:[{name:"x",unit:"mm",lower:0,upper:10},{name:"y",unit:"mm",lower:0,upper:10}],
      constraints:[
        {id:"C1",name:"sum",kind:"EQUALITY",expression:"x+y=6",variables:["x","y"],units:unitFields,status:"OPEN"},
        {id:"C2",name:"difference",kind:"EQUALITY",expression:"x-y=2",variables:["x","y"],units:unitFields,status:"OPEN"}
      ]
    });
    expect(r.status).toBe("SOLVED");expect(r.solution?.x).toBeCloseTo(4);expect(r.solution?.y).toBeCloseTo(2);
  });
  it("fails closed when a solve variable has no unit",()=>{
    const r=solveEngineeringConstraints({variables:[{name:"x",unit:"",lower:0,upper:10}],constraints:[{id:"C1",name:"x",kind:"EQUALITY",expression:"x=5",variables:["x"],units:{x:"mm"},status:"OPEN"}]});
    expect(r.status).toBe("INCOMPLETE");
  });
  it("fails closed when a constraint unit is missing",()=>{
    const r=solveEngineeringConstraints({variables:[{name:"x",unit:"mm",lower:0,upper:10}],constraints:[{id:"C1",name:"x",kind:"EQUALITY",expression:"x=5",variables:["x"],status:"OPEN"}]});
    expect(r.status).toBe("INCOMPLETE");
  });
  it("detects an infeasible solved result against an explicit inequality",()=>{
    const r=solveEngineeringConstraints({variables:[{name:"x",unit:"mm",lower:0,upper:10}],constraints:[
      {id:"C1",name:"x",kind:"EQUALITY",expression:"x=3",variables:["x"],units:{x:"mm"},status:"OPEN"},
      {id:"C2",name:"minimum",kind:"INEQUALITY",expression:"x>=5",variables:["x"],units:{x:"mm"},status:"OPEN"}
    ]});
    expect(r.status).toBe("INFEASIBLE");
  });
});

describe("V1.20 design-space exploration",()=>{
  const units={x:"mm",y:"mm"};
  it("finds the deterministic optimum in a bounded grid",()=>{
    const r=exploreEngineeringDesignSpace({
      variables:[{name:"x",unit:"mm",lower:0,upper:5,step:1},{name:"y",unit:"mm",lower:0,upper:5,step:1}],
      constraints:[{id:"C1",name:"sum",kind:"INEQUALITY",expression:"x+y>=5",variables:["x","y"],units,status:"OPEN"}],
      objective:{expression:"x+2*y",direction:"MINIMIZE"}
    });
    expect(r.status).toBe("SOLVED");expect(r.best).toEqual({x:5,y:0});expect(r.objectiveValue).toBe(5);
  });
  it("does not claim exhaustive exploration past the sample limit",()=>{
    const r=exploreEngineeringDesignSpace({variables:[{name:"x",unit:"mm",lower:0,upper:10,step:1}],constraints:[],maxSamples:3});
    expect(r.status).toBe("INCOMPLETE");
  });
});

describe("V1.20 tolerance",()=>{
  it("calculates a unit-aware worst-case stack",()=>{
    const r=worstCaseTolerance({unit:"mm",contributors:[{id:"A",nominal:10,plus:0.1,minus:0.1,unit:"mm"},{id:"B",nominal:1,plus:0.002,minus:0.002,unit:"cm"}]});
    expect(r.status).toBe("VALID");expect(r.nominal).toBeCloseTo(20);expect(r.minimum).toBeCloseTo(19.88);expect(r.maximum).toBeCloseTo(20.12);
  });
  it("requires explicit one-sigma data for RSS",()=>{
    const r=rssTolerance({unit:"mm",contributors:[{id:"A",nominal:10,plus:0.1,minus:0.1,unit:"mm"}]});
    expect(r.status).toBe("INCOMPLETE");
  });
  it("calculates RSS only from explicit one-sigma data",()=>{
    const r=rssTolerance({unit:"mm",contributors:[{id:"A",nominal:10,plus:0.1,minus:0.1,unit:"mm",oneSigma:0.04},{id:"B",nominal:20,plus:0.2,minus:0.2,unit:"mm",oneSigma:0.03}]});
    expect(r.status).toBe("VALID");expect(r.oneSigma).toBeCloseTo(0.05);
  });
});

describe("V1.20 tolerance callouts",()=>{
  it("parses generic bilateral callouts",()=>{
    const r=parseToleranceCallout("25+0.02/-0.01","mm");
    expect(r.status).toBe("PARSED");expect(r.nominal).toBe(25);expect(r.plus).toBe(0.02);expect(r.minus).toBe(0.01);
  });
  it("records an ISO 286 designation without inventing fit-table deviations",()=>{
    const r=makeISO286FitCallout(25,"mm",0.021,0,"H7");
    expect(r.status).toBe("PARSED");expect(r.standard).toBe("ISO_286");expect(r.designation).toBe("H7");
  });
});

describe("V1.20 routed capabilities",()=>{
  it("registers and routes the new capability definitions",async()=>{
    const registry=new CapabilityRegistry();registry.registerCatalog(ENGINEERING_CAPABILITIES);registry.registerCatalog(V1_20_CAPABILITIES);registry.register(new ConstraintEngineeringProvider());
    expect(registry.getDefinition("CONSTRAINT.EXPLORE_DESIGN_SPACE")?.providers).toContain("constraints.deterministic");
    const router=new CapabilityRouter(registry);
    const solved=await router.execute({capability:"CONSTRAINT.SOLVE",risk:"MEDIUM",input:{variables:[{name:"d",unit:"mm",lower:10,upper:30}],constraints:[{id:"C1",name:"diameter",kind:"EQUALITY",expression:"d=20",variables:["d"],units:{d:"mm"},status:"OPEN"}]}});
    expect(solved.success).toBe(true);expect((solved.output as any).solution.d).toBe(20);
    const tol=await router.execute({capability:"TOLERANCE.STACK_WORST_CASE",risk:"MEDIUM",input:{unit:"mm",contributors:[{id:"A",nominal:20,plus:0.1,minus:0.1,unit:"mm"}]}});
    expect(tol.success).toBe(true);
  });
});
