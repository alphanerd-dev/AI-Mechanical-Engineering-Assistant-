import {EngineeringIntentInterpretation} from "./types.js";

export interface EngineeringIntentSession{
  sessionId:string;
  projectId:string;
  interpretation:EngineeringIntentInterpretation;
  updatedAt:string;
}

export interface EngineeringIntentSessionStore{
  get(sessionId:string,projectId:string):EngineeringIntentSession|undefined;
  save(session:EngineeringIntentSession):void;
  delete(sessionId:string,projectId:string):void;
}

export class InMemoryEngineeringIntentSessionStore implements EngineeringIntentSessionStore{
  private readonly sessions=new Map<string,EngineeringIntentSession>();

  private key(sessionId:string,projectId:string):string{
    return sessionId+"::"+projectId;
  }

  get(sessionId:string,projectId:string):EngineeringIntentSession|undefined{
    const session=this.sessions.get(this.key(sessionId,projectId));
    return session?{
      ...session,
      interpretation:{
        ...session.interpretation,
        extractedInputs:{...session.interpretation.extractedInputs},
        missingInputs:[...session.interpretation.missingInputs],
        contextUsed:[...session.interpretation.contextUsed],
        assumptions:[...session.interpretation.assumptions]
      }
    }:undefined;
  }

  save(session:EngineeringIntentSession):void{
    if(!session.sessionId.trim()) throw new Error("sessionId is required.");
    if(!session.projectId.trim()) throw new Error("projectId is required.");
    this.sessions.set(this.key(session.sessionId,session.projectId),{
      ...session,
      interpretation:{
        ...session.interpretation,
        extractedInputs:{...session.interpretation.extractedInputs},
        missingInputs:[...session.interpretation.missingInputs],
        contextUsed:[...session.interpretation.contextUsed],
        assumptions:[...session.interpretation.assumptions]
      }
    });
  }

  delete(sessionId:string,projectId:string):void{
    this.sessions.delete(this.key(sessionId,projectId));
  }
}
