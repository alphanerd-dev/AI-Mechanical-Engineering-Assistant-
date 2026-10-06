import {CapabilityDefinition} from "../core/types.js";

export const V1_20_CAPABILITIES:CapabilityDefinition[]=[
  {id:"CONSTRAINT.SOLVE",domain:"requirements",purpose:"Solve a bounded engineering constraint system with explicit units and bounds",inputs:["constraints","variables","bounds"],outputs:["solution"],risk:"MEDIUM",providers:["constraints.deterministic"],status:"PILOT"},
  {id:"CONSTRAINT.EXPLORE_DESIGN_SPACE",domain:"requirements",purpose:"Explore a bounded engineering design space against explicit constraints and an optional objective",inputs:["constraints","variables","objective","maxSamples"],outputs:["best","objectiveValue"],risk:"MEDIUM",providers:["constraints.deterministic"],status:"EXPERIMENTAL"},
  {id:"TOLERANCE.STACK_WORST_CASE",domain:"manufacturing",purpose:"Calculate a unit-aware worst-case tolerance stack from explicit contributors",inputs:["contributors","unit"],outputs:["nominal","minimum","maximum"],risk:"MEDIUM",providers:["constraints.deterministic"],status:"PILOT"},
  {id:"TOLERANCE.STACK_RSS",domain:"manufacturing",purpose:"Calculate an RSS tolerance stack from explicit one-sigma contributors",inputs:["contributors","unit"],outputs:["nominal","oneSigma"],risk:"MEDIUM",providers:["constraints.deterministic"],status:"EXPERIMENTAL"},
  {id:"TOLERANCE.PARSE_CALLOUT",domain:"manufacturing",purpose:"Parse explicit generic dimensional tolerance callouts",inputs:["callout","unit"],outputs:["nominal","plus","minus"],risk:"LOW",providers:["constraints.deterministic"],status:"PILOT"},
  {id:"TOLERANCE.ISO_286_CALLOUT",domain:"manufacturing",purpose:"Record an ISO 286 fit designation with explicitly supplied deviations",inputs:["nominal","unit","plus","minus","designation"],outputs:["fit_callout"],risk:"MEDIUM",providers:["constraints.deterministic"],status:"EXPERIMENTAL"}
];
