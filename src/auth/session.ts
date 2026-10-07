import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import {AuthenticatedIdentity,EngineeringRole} from "./types.js";

export interface SessionClaims{
  sessionId:string;
  subject:string;
  roles:readonly EngineeringRole[];
  projectIds?:readonly string[];
  issuedAt:number;
  expiresAt:number;
}

export interface SessionManager{
  create(identity:AuthenticatedIdentity,ttlMs:number,now?:Date):string;
  resolve(token:string,now?:Date):AuthenticatedIdentity|null;
  revoke(token:string,now?:Date):boolean;
}

export interface RevocationStore{
  revoke(sessionId:string,expiresAt:number):void;
  isRevoked(sessionId:string,now:number):boolean;
}

export class InMemoryRevocationStore implements RevocationStore{
  private readonly entries=new Map<string,number>();
  revoke(sessionId:string,expiresAt:number):void{this.entries.set(sessionId,expiresAt);}
  isRevoked(sessionId:string,now:number):boolean{
    const expiresAt=this.entries.get(sessionId);
    if(expiresAt===undefined) return false;
    if(expiresAt<=now){this.entries.delete(sessionId);return false;}
    return true;
  }
}

function encode(value:unknown):string{
  return Buffer.from(JSON.stringify(value),"utf8").toString("base64url");
}
function decode(value:string):unknown{return JSON.parse(Buffer.from(value,"base64url").toString("utf8"));}

function sign(input:string,secret:string):string{
  return createHmac("sha256",secret).update(input,"utf8").digest("base64url");
}
function validRole(role:unknown):role is EngineeringRole{return ["ENGINEER","REVIEWER","ADMIN","AGENT"].includes(String(role));}

function validSecret(secret:string):void{
  if(typeof secret!=="string"||secret.length<32) throw new Error("Session secret must be at least 32 characters.");
}

export class SignedSessionManager implements SessionManager{
  constructor(private readonly secret:string,private readonly revocations:RevocationStore=new InMemoryRevocationStore()){validSecret(secret);}

  create(identity:AuthenticatedIdentity,ttlMs:number,now=new Date()):string{
    if(!Number.isInteger(ttlMs)||ttlMs<=0) throw new Error("Session TTL must be a positive integer.");
    if(!identity||!identity.subject.trim()) throw new Error("Session identity subject is required.");
    if(identity.roles.length===0||identity.roles.some(role=>!validRole(role))) throw new Error("Session identity contains an invalid role.");
    const issuedAt=now.getTime();
    const expiresAt=issuedAt+ttlMs;
    const claims:SessionClaims={
      sessionId:randomUUID(),
      subject:identity.subject,
      roles:[...identity.roles],
      projectIds:identity.projectIds?[...identity.projectIds]:undefined,
      issuedAt,
      expiresAt
    };
    const payload=encode(claims);
    const signature=sign(payload,this.secret);
    return payload+"."+signature;
  }

  resolve(token:string,now=new Date()):AuthenticatedIdentity|null{
    try{
      const [payload,providedSignature]=token.split(".");
      if(!payload||!providedSignature) return null;
      const expected=sign(payload,this.secret);
      const a=Buffer.from(providedSignature,"utf8"),b=Buffer.from(expected,"utf8");
      if(a.length!==b.length||!timingSafeEqual(a,b)) return null;
      const claims=decode(payload) as Partial<SessionClaims>;
      if(typeof claims.sessionId!=="string"||typeof claims.subject!=="string"||!Array.isArray(claims.roles)||claims.roles.some(role=>!validRole(role))||typeof claims.issuedAt!=="number"||typeof claims.expiresAt!=="number") return null;
      const nowMs=now.getTime();
      if(claims.expiresAt<=nowMs||claims.issuedAt>nowMs) return null;
      if(this.revocations.isRevoked(claims.sessionId,nowMs)) return null;
      return {subject:claims.subject,roles:[...claims.roles],projectIds:claims.projectIds?[...claims.projectIds]:undefined,sessionId:claims.sessionId,authenticatedAt:new Date(claims.issuedAt).toISOString()};
    }catch{return null;}
  }

  revoke(token:string,now=new Date()):boolean{
    try{
      const identity=this.resolve(token,now);
      if(!identity?.sessionId) return false;
      const [payload]=token.split(".");
      const claims=decode(payload) as SessionClaims;
      this.revocations.revoke(claims.sessionId,claims.expiresAt);
      return true;
    }catch{return false;}
  }
}
