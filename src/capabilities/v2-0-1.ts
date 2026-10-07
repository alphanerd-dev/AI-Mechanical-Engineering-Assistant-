import {CapabilityDefinition} from "../core/types.js";

export const V2_0_1_CAPABILITIES:CapabilityDefinition[]=[
  {id:"WORKSPACE.CREATE",domain:"orchestration",purpose:"Create an immutable engineering workspace snapshot containing project state and a validated task graph",inputs:["workspace"],outputs:["workspace"],risk:"MEDIUM",providers:["workspace.core"],status:"PILOT"},
  {id:"WORKSPACE.GET",domain:"orchestration",purpose:"Read a provider-neutral engineering workspace snapshot",inputs:["workspaceId"],outputs:["workspace"],risk:"LOW",providers:["workspace.core"],status:"PILOT"},
  {id:"WORKSPACE.SAVE",domain:"orchestration",purpose:"Persist a new workspace revision with optimistic concurrency protection",inputs:["workspace","expectedRevision"],outputs:["workspace"],risk:"MEDIUM",providers:["workspace.core"],status:"PILOT"},
  {id:"TASK_GRAPH.VALIDATE",domain:"orchestration",purpose:"Validate task graph structure, project boundaries, and dependency cycles",inputs:["taskGraph"],outputs:["validation"],risk:"LOW",providers:["workspace.core"],status:"PILOT"},
  {id:"TASK_GRAPH.GET_READY",domain:"orchestration",purpose:"Determine which proposed or failed tasks are ready for bounded execution",inputs:["taskGraph","project"],outputs:["ready_tasks"],risk:"MEDIUM",providers:["workspace.core"],status:"PILOT"},
  {id:"TASK_GRAPH.TRANSITION",domain:"orchestration",purpose:"Apply an explicit task state transition under the task graph state machine",inputs:["taskGraph","taskId","status"],outputs:["taskGraph"],risk:"MEDIUM",providers:["workspace.core"],status:"PILOT"}
];
