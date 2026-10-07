import {describe,expect,it} from "vitest";
import {CollaborationProvider} from "../src/providers/collaboration.js";
import {DurableWorkspaceRecord,EngineeringProjectRecord,ProjectMembershipRecord} from "../src/collaboration/types.js";

const project:EngineeringProjectRecord={id:"P-1",ownerId:"U-1",name:"Test project",stage:"PROBLEM",status:"ACTIVE",revision:1,createdAt:"2026-10-07T00:00:00.000Z",updatedAt:"2026-10-07T00:00:00.000Z"};
const membership:ProjectMembershipRecord={projectId:"P-1",userId:"U-1",role:"ADMIN",createdAt:project.createdAt,updatedAt:project.updatedAt};
const workspace:DurableWorkspaceRecord={projectId:"P-1",revision:1,snapshot:{schemaVersion:1,id:"W-1",name:"Test",project:{id:"P-1",name:"Test",stage:"PROBLEM",status:"ACTIVE",requirements:[],assumptions:[],openQuestions:[],unresolvedRisks:[],events:[]},taskGraph:{id:"G-1",projectId:"P-1",revision:1,tasks:[]},revision:1,savedAt:project.createdAt},savedAt:project.createdAt};

describe("V2.0.9 collaboration provider",()=>{
 it("reads project and memberships through the provider boundary",async()=>{
  const provider=new CollaborationProvider({getProject:async()=>project,listProjectMemberships:async()=>[membership],getWorkspace:async()=>workspace,saveWorkspace:async record=>record});
  expect((await provider.execute({capability:"PROJECT.GET",risk:"LOW",input:{projectId:"P-1"}})).success).toBe(true);
  expect((await provider.execute({capability:"PROJECT.MEMBERS",risk:"LOW",input:{projectId:"P-1"}})).output).toEqual([membership]);
 });
 it("rejects cross-project workspace writes",async()=>{
  const provider=new CollaborationProvider({getProject:async()=>project,listProjectMemberships:async()=>[membership],getWorkspace:async()=>workspace,saveWorkspace:async record=>record});
  const response=await provider.execute({capability:"WORKSPACE.DURABLE_SAVE",risk:"MEDIUM",input:{projectId:"P-2",workspace}});
  expect(response.success).toBe(false);
 });
 it("preserves optimistic revision input",async()=>{
  let seen:number|undefined;
  const provider=new CollaborationProvider({getProject:async()=>project,listProjectMemberships:async()=>[membership],getWorkspace:async()=>workspace,saveWorkspace:async(record,expected)=>{seen=expected;return record}});
  const response=await provider.execute({capability:"WORKSPACE.DURABLE_SAVE",risk:"MEDIUM",input:{projectId:"P-1",workspace,expectedRevision:1}});
  expect(response.success).toBe(true);
  expect(seen).toBe(1);
 });
});
