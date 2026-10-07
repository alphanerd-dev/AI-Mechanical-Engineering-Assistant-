import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityProvider} from "../capabilities/registry.js";
import {EngineeringWorkspaceSnapshot} from "../workspace/types.js";
import {validateEngineeringWorkspaceSnapshot} from "../workspace/validation.js";
import {InMemoryEngineeringWorkspaceStore} from "../workspace/store.js";
import {EngineeringTaskGraph,EngineeringTaskTransition} from "../task-graph/types.js";
import {getReadyTasks} from "../task-graph/ready.js";
import {validateEngineeringTaskGraph,transitionTask} from "../task-graph/validation.js";
import {ProjectState} from "../core/types.js";

export class EngineeringWorkspaceProvider implements CapabilityProvider{
  readonly id="workspace.core";
  readonly capabilities=[
    "WORKSPACE.CREATE","WORKSPACE.GET","WORKSPACE.SAVE",
    "TASK_GRAPH.VALIDATE","TASK_GRAPH.GET_READY","TASK_GRAPH.TRANSITION"
  ];

  constructor(private readonly store=new InMemoryEngineeringWorkspaceStore()){}

  async execute(request:CapabilityRequest):Promise<CapabilityResult>{
    try{
      if(request.capability==="WORKSPACE.CREATE"){
        const workspace=request.input.workspace as EngineeringWorkspaceSnapshot|undefined;
        if(!workspace) return {capability:request.capability,provider:this.id,success:false,error:"A workspace snapshot is required."};
        validateEngineeringWorkspaceSnapshot(workspace);
        const saved=this.store.save(workspace,0);
        return {capability:request.capability,provider:this.id,success:true,output:saved};
      }

      if(request.capability==="WORKSPACE.GET"){
        const workspaceId=String(request.input.workspaceId??"");
        if(!workspaceId) return {capability:request.capability,provider:this.id,success:false,error:"workspaceId is required."};
        const workspace=this.store.get(workspaceId);
        if(!workspace) return {capability:request.capability,provider:this.id,success:false,error:`Workspace not found: ${workspaceId}.`};
        return {capability:request.capability,provider:this.id,success:true,output:workspace};
      }

      if(request.capability==="WORKSPACE.SAVE"){
        const workspace=request.input.workspace as EngineeringWorkspaceSnapshot|undefined;
        if(!workspace) return {capability:request.capability,provider:this.id,success:false,error:"A workspace snapshot is required."};
        const expected=request.input.expectedRevision as number|undefined;
        const saved=this.store.save(workspace,expected);
        return {capability:request.capability,provider:this.id,success:true,output:saved};
      }

      if(request.capability==="TASK_GRAPH.VALIDATE"){
        const graph=request.input.taskGraph as EngineeringTaskGraph|undefined;
        if(!graph) return {capability:request.capability,provider:this.id,success:false,error:"A task graph is required."};
        const errors=validateEngineeringTaskGraph(graph);
        return {capability:request.capability,provider:this.id,success:errors.length===0,output:{valid:errors.length===0,errors}};
      }

      if(request.capability==="TASK_GRAPH.GET_READY"){
        const graph=request.input.taskGraph as EngineeringTaskGraph|undefined;
        if(!graph) return {capability:request.capability,provider:this.id,success:false,error:"A task graph is required."};
        const project=request.input.project as ProjectState|undefined;
        return {capability:request.capability,provider:this.id,success:true,output:getReadyTasks(graph,project)};
      }

      if(request.capability==="TASK_GRAPH.TRANSITION"){
        const graph=request.input.taskGraph as EngineeringTaskGraph|undefined;
        const taskId=String(request.input.taskId??"");
        const status=String(request.input.status??"") as EngineeringTaskTransition;
        if(!graph||!taskId||!status) return {capability:request.capability,provider:this.id,success:false,error:"taskGraph, taskId and status are required."};
        return {capability:request.capability,provider:this.id,success:true,output:transitionTask(graph,taskId,status)};
      }

      return {capability:request.capability,provider:this.id,success:false,error:"Unsupported workspace capability."};
    }catch(error){
      return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Workspace operation failed."};
    }
  }
}
