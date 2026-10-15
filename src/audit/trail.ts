import {createHash} from "node:crypto";
import {AuditEvent,AuditEventInput,AuditTrail} from "./types.js";

function assertInput(event:AuditEventInput):void{
  if(typeof event.timestamp!=="string"||Number.isNaN(Date.parse(event.timestamp)))
    throw new Error("Audit event timestamp must be valid.");
  if(!event.actor||typeof event.actor.subject!=="string"||!event.actor.subject.trim())
    throw new Error("Audit event actor subject is required.");
  if(!["USER","AGENT","SYSTEM"].includes(event.actor.actorType))
    throw new Error("Audit event actor type is invalid.");
  if(!["AUTHENTICATION","AUTHORIZATION","PROJECT_READ","PROJECT_WRITE","TASK_PROPOSE","TASK_EXECUTE","TASK_DELEGATE","APPROVAL_REQUEST","APPROVAL_GRANT","EVIDENCE_READ","EVIDENCE_WRITE","IDENTITY_ADMIN","SYSTEM_EVENT"].includes(event.action))
    throw new Error("Audit event action is invalid.");
  if(!["ALLOWED","DENIED","SUCCESS","FAILURE","BLOCKED","PENDING"].includes(event.outcome))
    throw new Error("Audit event outcome is invalid.");
  if(event.projectId!==undefined&&!event.projectId.trim())
    throw new Error("Audit event projectId cannot be empty.");
  if(event.resourceType!==undefined&&!event.resourceType.trim())
    throw new Error("Audit event resourceType cannot be empty.");
  if(event.resourceId!==undefined&&!event.resourceId.trim())
    throw new Error("Audit event resourceId cannot be empty.");
  if(event.reason!==undefined&&typeof event.reason!=="string")
    throw new Error("Audit event reason must be a string.");
  if(event.metadata!==undefined&&(!event.metadata||typeof event.metadata!=="object"||Array.isArray(event.metadata)))
    throw new Error("Audit event metadata must be an object.");
  if(event.correlation!==undefined){
    if(!event.correlation||typeof event.correlation!=="object"||Array.isArray(event.correlation))
      throw new Error("Audit event correlation must be an object.");
    for(const key of ["requestId","taskId","runId","providerId","validatorReceiptId","decisionId"] as const){
      const value=event.correlation[key];
      if(value!==undefined&&(typeof value!=="string"||!value.trim()))
        throw new Error("Audit correlation "+key+" must be a non-empty string.");
    }
    const digest=event.correlation.artifactSha256;
    if(digest!==undefined&&(typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest)))
      throw new Error("Audit correlation artifactSha256 must be a lowercase SHA-256 digest.");
  }
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
    correlation:event.correlation??null,
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

/** Runtime validation shared with the durable persistence boundary. */
export function assertAuditEventInput(event: AuditEventInput): void {
  assertInput(event);
}
