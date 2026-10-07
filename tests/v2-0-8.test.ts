import {describe,expect,it} from "vitest";
import {InMemoryAuditTrail} from "../src/audit/trail.js";
import {ConfiguredCredentialAuthenticationProvider} from "../src/auth/configured-provider.js";
import {ApplicationAuthenticationService} from "../src/auth/application.js";
import {SignedSessionManager,InMemoryRevocationStore} from "../src/auth/session.js";

const stamp=new Date("2026-10-07T00:00:00.000Z");
const identity={subject:"engineer-1",roles:["ENGINEER"] as const,projectIds:["P-1"] as const,authenticatedAt:stamp.toISOString()};

describe("V2.0.8 production authentication/session boundary",()=>{
  it("creates and validates signed sessions without storing the bearer token",()=>{
    const sessions=new SignedSessionManager("12345678901234567890123456789012",new InMemoryRevocationStore());
    const token=sessions.create(identity,3600000,stamp);
    expect(sessions.resolve(token,stamp)?.subject).toBe("engineer-1");
    expect(token).not.toContain("engineer-1");
  });

  it("rejects tampered and expired sessions",()=>{
    const sessions=new SignedSessionManager("12345678901234567890123456789012");
    const token=sessions.create(identity,1000,stamp);
    expect(sessions.resolve(token+"x",stamp)).toBeNull();
    expect(sessions.resolve(token,new Date(stamp.getTime()+1001))).toBeNull();
  });

  it("supports explicit session revocation",()=>{
    const sessions=new SignedSessionManager("12345678901234567890123456789012");
    const token=sessions.create(identity,3600000,stamp);
    expect(sessions.revoke(token,stamp)).toBe(true);
    expect(sessions.resolve(token,stamp)).toBeNull();
    expect(sessions.revoke(token,stamp)).toBe(false);
  });

  it("fails closed when no configured identity exists",async()=>{
    const provider=new ConfiguredCredentialAuthenticationProvider(undefined);
    expect(await provider.authenticate({credential:"anything"})).toBeNull();
  });

  it("authorizes active sessions and audits both allowed and denied decisions",async()=>{
    const audit=new InMemoryAuditTrail();
    const service=new ApplicationAuthenticationService({
      provider:new ConfiguredCredentialAuthenticationProvider({credential:"secret",identity:{subject:"engineer-1",roles:["ENGINEER"],projectIds:["P-1"]}}),
      sessionManager:new SignedSessionManager("12345678901234567890123456789012",new InMemoryRevocationStore()),
      sessionTtlMs:3600000,
      audit
    });
    const auth=await service.authenticate("secret",stamp);
    expect(auth).not.toBeNull();
    const allowed=service.authorize(auth!.token,"TASK.EXECUTE","P-1",stamp);
    const denied=service.authorize(auth!.token,"TASK.EXECUTE","P-2",stamp);
    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(audit.list()).toHaveLength(3);
    expect(audit.list()[2].outcome).toBe("DENIED");
    audit.verify();
  });

  it("rejects unauthorized agent execution and revoked sessions",async()=>{
    const provider=new ConfiguredCredentialAuthenticationProvider({credential:"agent-secret",identity:{subject:"agent-1",roles:["AGENT"]}});
    const service=new ApplicationAuthenticationService({
      provider,sessionManager:new SignedSessionManager("12345678901234567890123456789012",new InMemoryRevocationStore()),sessionTtlMs:3600000,audit:new InMemoryAuditTrail()
    });
    const auth=await service.authenticate("agent-secret",stamp);
    const denied=service.authorize(auth!.token,"TASK.EXECUTE","P-1",stamp);
    expect(denied.allowed).toBe(false);
    expect(service.revoke(auth!.token,stamp)).toBe(true);
    expect(service.authorize(auth!.token,"PROJECT.READ","P-1",stamp).allowed).toBe(false);
  });
});
