import {createHash} from "node:crypto";
import {AuditEvent,AuditEventInput,AuditTrail} from "./types.js";

function assertInput(event:AuditEventInput):void{
  if(typeof event.timestamp!=="string"||Number.isNaN(Date.parse(event.timestamp)))
    throw new Error("Audit event timestamp must be valid.");
  if(!event.actor||typeof event.actor.subject!=="string"||!event.actor.subject.trim())
    throw new Error("Audit event actor subject is required.");
  if(!["USER","AGENT","SYSTEM"].includes(event.actor.actorType))
    throw new Error("Audit event actor type is invalid.");
  if(!event.action) throw new Error("Audit event action is required.");
  if(!event.outcome) throw new Error("Audit event outcome is required.");
  if(event.projectId!==undefined&&!event.projectId.trim())
    throw new Error("Audit event projectId cannot be empty.");
  if(event.resourceId!==undefined&&!event.resourceId.trim())
    throw new Error("Audit event resourceId cannot be empty.");
}

function canonical(event:Omit<AuditEvent,"hash">):string{
  return JSON.stringify({
    sequence:event.sequence,
    timestamp:event.timestamp,
    actor:event.actor,
    action:event.action,
    outcome:event.outcome,
    projectId:event.projectId??null,
    resourceType:event.resourceType??null,
    resourceId:event.resourceId??null,
    reason:event.reason??null,
    metadata:event.metadata??null,
    previousHash:event.previousHash
  });
}

function hash(event:Omit<AuditEvent,"hash">):string{
  return createHash("sha256").update(canonical(event),"utf8").digest("hex");
}

function clone(event:AuditEvent):AuditEvent{
  return structuredClone(event);
}

export class InMemoryAuditTrail implements AuditTrail{
  private readonly events:AuditEvent[]=[];

  append(input:AuditEventInput):AuditEvent{
    assertInput(input);
    const previous=this.events.at(-1);
    const eventWithoutHash:Omit<AuditEvent,"hash">={
      ...structuredClone(input),
      sequence:this.events.length+1,
      previousHash:previous?.hash??null
    };
    const event:AuditEvent={...eventWithoutHash,hash:hash(eventWithoutHash)};
    this.events.push(event);
    return clone(event);
  }

  list(projectId?:string):AuditEvent[]{
    return this.events
      .filter(event=>projectId===undefined||event.projectId===projectId)
      .map(clone);
  }

  head():AuditEvent|undefined{
    const event=this.events.at(-1);
    return event?clone(event):undefined;
  }

  verify():void{
    let previousHash:string|null=null;
    this.events.forEach((event,index)=>{
      if(event.sequence!==index+1) throw new Error("Audit trail sequence is invalid.");
      if(event.previousHash!==previousHash) throw new Error("Audit trail hash chain is broken.");
      const {hash:storedHash,...withoutHash}=event;
      if(hash(withoutHash)!==storedHash) throw new Error("Audit trail event hash is invalid.");
      previousHash=storedHash;
    });
  }
}

export function verifyAuditEvent(event:AuditEvent):void{
  assertInput(event);
  const {hash:storedHash,...withoutHash}=event;
  if(hash(withoutHash)!==storedHash) throw new Error("Audit event hash is invalid.");
}
