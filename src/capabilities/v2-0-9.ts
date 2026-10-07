import {CapabilityDefinition} from "../core/types.js";
export const V2_0_9_CAPABILITIES:CapabilityDefinition[]=[
{id:"PROJECT.GET",domain:"orchestration",purpose:"Read a project within an authorized engineering project boundary",inputs:["projectId"],outputs:["project"],risk:"LOW",providers:["collaboration.supabase"],status:"PILOT"},
{id:"PROJECT.MEMBERS",domain:"orchestration",purpose:"Read memberships for an authorized engineering project",inputs:["projectId"],outputs:["memberships"],risk:"LOW",providers:["collaboration.supabase"],status:"PILOT"},
{id:"WORKSPACE.DURABLE_GET",domain:"orchestration",purpose:"Read the durable engineering workspace snapshot for an authorized project",inputs:["projectId"],outputs:["workspace"],risk:"LOW",providers:["collaboration.supabase"],status:"PILOT"},
{id:"WORKSPACE.DURABLE_SAVE",domain:"orchestration",purpose:"Persist an engineering workspace snapshot with optimistic revision protection",inputs:["workspace","expectedRevision"],outputs:["workspace"],risk:"MEDIUM",providers:["collaboration.supabase"],status:"PILOT"}
];
