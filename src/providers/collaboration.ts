import {CapabilityRequest,CapabilityResult} from "../core/types.js";
import {CapabilityProvider} from "../capabilities/registry.js";
import {CollaborationStore,DurableWorkspaceRecord,EngineeringProjectRecord,ProjectMembershipRecord} from "../collaboration/types.js";
export class CollaborationProvider implements CapabilityProvider{
readonly id="collaboration.supabase"; readonly capabilities=["PROJECT.GET","PROJECT.MEMBERS","WORKSPACE.DURABLE_GET","WORKSPACE.DURABLE_SAVE"];
constructor(private readonly store:CollaborationStore){}
async execute(request:CapabilityRequest):Promise<CapabilityResult>{
try{const projectId=String(request.input.projectId??""); if(!projectId)return {capability:request.capability,provider:this.id,success:false,error:"projectId is required."};
if(request.capability==="PROJECT.GET"){const project:EngineeringProjectRecord|undefined=await this.store.getProject(projectId);return {capability:request.capability,provider:this.id,success:Boolean(project),output:project,error:project?undefined:"Project not found."};}
if(request.capability==="PROJECT.MEMBERS"){const memberships:readonly ProjectMembershipRecord[]=await this.store.listProjectMemberships(projectId);return {capability:request.capability,provider:this.id,success:true,output:memberships};}
if(request.capability==="WORKSPACE.DURABLE_GET"){const workspace=await this.store.getWorkspace(projectId);return {capability:request.capability,provider:this.id,success:Boolean(workspace),output:workspace,error:workspace?undefined:"Durable workspace not found."};}
if(request.capability==="WORKSPACE.DURABLE_SAVE"){const workspace=request.input.workspace as DurableWorkspaceRecord|undefined;if(!workspace)return {capability:request.capability,provider:this.id,success:false,error:"workspace is required."};if(workspace.projectId!==projectId)return {capability:request.capability,provider:this.id,success:false,error:"Workspace projectId does not match request projectId."};const expectedRevision=request.input.expectedRevision as number|undefined;const saved=await this.store.saveWorkspace(workspace,expectedRevision);return {capability:request.capability,provider:this.id,success:true,output:saved};}
return {capability:request.capability,provider:this.id,success:false,error:"Unsupported collaboration capability."};}catch(error){return {capability:request.capability,provider:this.id,success:false,error:error instanceof Error?error.message:"Collaboration operation failed."};}}
}
