import {EngineeringIntentInterpretation} from "./types.js";

export interface EngineeringIntentSession{
  sessionId:string;
  projectId:string;
  interpretation:EngineeringIntentInterpretation;
  updatedAt:string;
}

export interface EngineeringIntentSessionStore{
  get(sessionId:string,projectId:string):Promise<EngineeringIntentSession|undefined>;
  save(session:EngineeringIntentSession):Promise<void>;
  delete(sessionId:string,projectId:string):Promise<void>;
}

export class EngineeringIntentSessionPersistenceError extends Error{
  constructor(){
    super("Engineering intent session persistence failed.");
    this.name="EngineeringIntentSessionPersistenceError";
  }
}

function copySession(session:EngineeringIntentSession):EngineeringIntentSession{
  return {
    ...session,
    interpretation:{
      ...session.interpretation,
      extractedInputs:{...session.interpretation.extractedInputs},
      missingInputs:[...session.interpretation.missingInputs],
      contextUsed:[...session.interpretation.contextUsed],
      assumptions:[...session.interpretation.assumptions]
    }
  };
}

export class InMemoryEngineeringIntentSessionStore implements EngineeringIntentSessionStore{
  private readonly sessions=new Map<string,EngineeringIntentSession>();

  private key(sessionId:string,projectId:string):string{
    return projectId+"::"+sessionId;
  }

  async get(sessionId:string,projectId:string):Promise<EngineeringIntentSession|undefined>{
    const session=this.sessions.get(this.key(sessionId,projectId));
    return session?copySession(session):undefined;
  }

  async save(session:EngineeringIntentSession):Promise<void>{
    if(!session.sessionId.trim()||session.sessionId.length>128) throw new Error("sessionId must contain 1 to 128 characters.");
    if(!session.projectId.trim()) throw new Error("projectId is required.");
    this.sessions.set(this.key(session.sessionId,session.projectId),copySession(session));
  }

  async delete(sessionId:string,projectId:string):Promise<void>{
    this.sessions.delete(this.key(sessionId,projectId));
  }
}
