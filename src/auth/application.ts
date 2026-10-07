import {AuthenticatedIdentity,AuthenticationProvider} from "./types.js";
import {AuditTrail} from "../audit/types.js";
import {AuditAction,AuditOutcome} from "../audit/types.js";
import {authorize} from "./policy.js";
import {InMemoryRevocationStore,SignedSessionManager,SessionManager} from "./session.js";

export interface ApplicationAuthenticationConfig{
  provider:AuthenticationProvider;
  sessionManager:SessionManager;
  sessionTtlMs:number;
  audit:AuditTrail;
}

export interface SessionAuthenticationResult{
  identity:AuthenticatedIdentity;
  token:string;
}

export class ApplicationAuthenticationService{
  constructor(private readonly config:ApplicationAuthenticationConfig){}

  async authenticate(credential:string,now=new Date()):Promise<SessionAuthenticationResult|null>{
    const identity=await this.config.provider.authenticate({credential});
    if(!identity){
      this.audit(now,"AUTHENTICATION","DENIED","system","Authentication failed.");
      return null;
    }
    const token=this.config.sessionManager.create(identity,this.config.sessionTtlMs,now);
    this.audit(now,"AUTHENTICATION","SUCCESS",identity.subject,"Authentication succeeded.",{sessionId:identity.sessionId??"issued-at-session"});
    return {identity,token};
  }

  resolve(token:string,now=new Date()):AuthenticatedIdentity|null{
    return this.config.sessionManager.resolve(token,now);
  }

  revoke(token:string,now=new Date()):boolean{
    const identity=this.resolve(token,now);
    const revoked=this.config.sessionManager.revoke(token,now);
    if(revoked) this.audit(now,"SYSTEM_EVENT","SUCCESS",identity?.subject??"unknown","Session revoked.",{sessionId:identity?.sessionId??"unknown"});
    return revoked;
  }

  authorize(token:string,permission:Parameters<typeof authorize>[0]["permission"],projectId?:string,now=new Date()){
    const identity=this.resolve(token,now);
    if(!identity){
      const decision={allowed:false,reason:"Session is missing, expired, invalid, or revoked.",permission,subject:"anonymous",projectId};
      this.audit(now,"AUTHORIZATION","DENIED","anonymous",decision.reason,{permission,projectId});
      return decision;
    }
    const decision=authorize({identity,permission,projectId});
    this.audit(now,"AUTHORIZATION",decision.allowed?"ALLOWED":"DENIED",identity.subject,decision.reason,{permission,projectId,sessionId:identity.sessionId??"unknown"});
    return decision;
  }

  private audit(timestamp:Date,action:AuditAction,outcome:AuditOutcome,subject:string,reason:string,metadata:Record<string,unknown>={}){
    this.config.audit.append({timestamp:timestamp.toISOString(),actor:{subject,actorType:subject==="anonymous"?"SYSTEM":(metadata.actorType as "AGENT"|"USER"|"SYSTEM"|undefined)??"USER"},action,outcome,reason,metadata});
  }
}

export function createApplicationAuthenticationService(config:{provider:AuthenticationProvider;secret:string;sessionTtlMs:number;audit:AuditTrail}):ApplicationAuthenticationService{
  return new ApplicationAuthenticationService({provider:config.provider,sessionManager:new SignedSessionManager(config.secret,new InMemoryRevocationStore()),sessionTtlMs:config.sessionTtlMs,audit:config.audit});
}
