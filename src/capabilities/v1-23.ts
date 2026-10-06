import {CapabilityDefinition} from "../core/types.js";

export const V1_23_CAPABILITIES:CapabilityDefinition[]=[
  {id:"DYNAMICS.INVERSE_DYNAMICS",domain:"dynamics",purpose:"Compute provider-supplied inverse rigid-body dynamics from explicit joint state, acceleration, and gravity inputs",inputs:["model","positions","velocities","accelerations","gravityMps2"],outputs:["generalizedForces","dofOrder"],risk:"HIGH",providers:["dynamics.pinocchio"],status:"EXPERIMENTAL"},
  {id:"DYNAMICS.COMPARE_SOLVERS",domain:"dynamics",purpose:"Compare explicit dynamics result values from independent solvers against absolute or relative tolerances",inputs:["referenceResult","candidateResult","criteria","requireConverged"],outputs:["comparison"],risk:"HIGH",providers:["dynamics.comparison"],status:"PILOT"},
  {id:"ROBOTICS.LOAD_ASSET_RUNTIME",domain:"robotics",purpose:"Load a validated CAD-derived robotics asset into a configured simulation runtime",inputs:["asset"],outputs:["runtime_handle"],risk:"HIGH",providers:["robotics.runtime"],status:"EXPERIMENTAL"}
];
