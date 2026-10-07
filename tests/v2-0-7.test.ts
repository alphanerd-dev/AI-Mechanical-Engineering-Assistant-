import {describe,expect,it} from "vitest";
import {InMemoryAuditTrail,verifyAuditEvent} from "../src/audit/index.js";

describe("V2.0.7 audit trail",()=>{
  it("appends immutable, sequenced events with a hash chain",()=>{
    const trail=new InMemoryAuditTrail();
    const first=trail.append({
      timestamp:"2026-10-07T10:00:00.000Z",
      actor:{subject:"user-1",actorType:"USER",roles:["ENGINEER"]},
      action:"TASK_EXECUTE",outcome:"SUCCESS",projectId:"P-1",resourceType:"TASK",resourceId:"T-1",
      metadata:{capability:"CAD.BUILD"}
    });
    const second=trail.append({
      timestamp:"2026-10-07T10:00:01.000Z",
      actor:{subject:"agent-1",actorType:"AGENT",roles:["AGENT"]},
      action:"AUTHORIZATION",outcome:"DENIED",projectId:"P-1",resourceType:"TASK",resourceId:"T-2",
      reason:"Permission denied."
    });
    expect(first.sequence).toBe(1);
    expect(first.previousHash).toBeNull();
    expect(second.sequence).toBe(2);
    expect(second.previousHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
    trail.verify();
  });

  it("returns defensive copies so callers cannot mutate stored history",()=>{
    const trail=new InMemoryAuditTrail();
    const event=trail.append({
      timestamp:"2026-10-07T10:00:00.000Z",
      actor:{subject:"system",actorType:"SYSTEM"},
      action:"SYSTEM_EVENT",outcome:"SUCCESS"
    });
    event.reason="tampered";
    expect(trail.head()?.reason).toBeUndefined();
    trail.verify();
  });

  it("filters by project without changing the canonical chain",()=>{
    const trail=new InMemoryAuditTrail();
    trail.append({timestamp:"2026-10-07T10:00:00.000Z",actor:{subject:"u1",actorType:"USER"},action:"PROJECT_WRITE",outcome:"SUCCESS",projectId:"P-1"});
    trail.append({timestamp:"2026-10-07T10:00:01.000Z",actor:{subject:"u2",actorType:"USER"},action:"PROJECT_WRITE",outcome:"SUCCESS",projectId:"P-2"});
    trail.append({timestamp:"2026-10-07T10:00:02.000Z",actor:{subject:"u1",actorType:"USER"},action:"TASK_PROPOSE",outcome:"PENDING",projectId:"P-1"});
    expect(trail.list("P-1")).toHaveLength(2);
    expect(trail.list("P-1")[1].previousHash).toBe(trail.list()[1].hash);
    trail.verify();
  });

  it("rejects invalid actor/timestamp/project inputs",()=>{
    const trail=new InMemoryAuditTrail();
    expect(()=>trail.append({timestamp:"bad",actor:{subject:"u",actorType:"USER"},action:"SYSTEM_EVENT",outcome:"SUCCESS"})).toThrow("timestamp");
    expect(()=>trail.append({timestamp:"2026-10-07T10:00:00.000Z",actor:{subject:"",actorType:"USER"},action:"SYSTEM_EVENT",outcome:"SUCCESS"})).toThrow("actor subject");
    expect(()=>trail.append({timestamp:"2026-10-07T10:00:00.000Z",actor:{subject:"u",actorType:"USER"},action:"SYSTEM_EVENT",outcome:"SUCCESS",projectId:""})).toThrow("projectId");
  });

  it("detects tampering in a captured event",()=>{
    const trail=new InMemoryAuditTrail();
    const event=trail.append({timestamp:"2026-10-07T10:00:00.000Z",actor:{subject:"u",actorType:"USER"},action:"AUTHORIZATION",outcome:"DENIED"});
    const tampered={...event,reason:"changed"};
    expect(()=>verifyAuditEvent(tampered)).toThrow("hash");
    trail.verify();
  });
});
