import {describe,expect,it} from "vitest";
import {authorize,permissionsForRoles,requireAuthorization} from "../src/auth/policy.js";
import {AuthenticatedIdentity,AuthenticationProvider} from "../src/auth/types.js";

const identity=(roles:AuthenticatedIdentity["roles"],projectIds?:string[]):AuthenticatedIdentity=>({
  subject:"user-1",roles,projectIds,authenticatedAt:"2026-10-07T00:00:00.000Z"
});

describe("V2.0.6 identity and authorization boundary",()=>{
  it("maps roles to explicit permissions",()=>{
    expect(permissionsForRoles(["ENGINEER"])).toEqual(expect.arrayContaining(["PROJECT.READ","PROJECT.WRITE","TASK.PROPOSE","TASK.EXECUTE"]));
    expect(permissionsForRoles(["AGENT"])).toEqual(["PROJECT.READ","TASK.PROPOSE","EVIDENCE.READ"]);
    expect(permissionsForRoles(["REVIEWER"])).not.toContain("TASK.EXECUTE");
  });
  it("denies unauthorized execution permissions by default",()=>{
    const decision=authorize({identity:identity(["AGENT"]),permission:"TASK.EXECUTE",projectId:"P-1"});
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("TASK.EXECUTE");
  });
  it("enforces project scope when an identity is explicitly scoped",()=>{
    const allowed=authorize({identity:identity(["ENGINEER"],["P-1"]),permission:"TASK.EXECUTE",projectId:"P-1"});
    const denied=authorize({identity:identity(["ENGINEER"],["P-1"]),permission:"TASK.EXECUTE",projectId:"P-2"});
    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain("Project scope denied");
  });
  it("allows a reviewer to grant approval but not execute engineering work",()=>{
    expect(authorize({identity:identity(["REVIEWER"]),permission:"APPROVAL.GRANT",projectId:"P-1"}).allowed).toBe(true);
    expect(authorize({identity:identity(["REVIEWER"]),permission:"TASK.EXECUTE",projectId:"P-1"}).allowed).toBe(false);
  });
  it("combines roles without bypassing project scope",()=>{
    const decision=authorize({identity:identity(["ENGINEER","REVIEWER"],["P-1"]),permission:"APPROVAL.GRANT",projectId:"P-2"});
    expect(decision.allowed).toBe(false);
  });
  it("fails closed when a caller requires an unauthorized permission",()=>{
    expect(()=>requireAuthorization({identity:identity(["AGENT"]),permission:"ADMIN.IDENTITY"})).toThrow("Permission denied");
  });
  it("keeps authentication provider details outside the engineering core",async()=>{
    const provider:AuthenticationProvider={authenticate:async request=>request.credential==="valid"?identity(["ENGINEER"]):null};
    expect(await provider.authenticate({credential:"valid"})).toMatchObject({subject:"user-1",roles:["ENGINEER"]});
    expect(await provider.authenticate({credential:"invalid"})).toBeNull();
  });
});
