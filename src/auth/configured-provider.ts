import {timingSafeEqual} from "node:crypto";
import {AuthenticatedIdentity,AuthenticationProvider,AuthenticationRequest,EngineeringRole} from "./types.js";

export interface ConfiguredIdentity{
  credential:string;
  identity:Omit<AuthenticatedIdentity,"sessionId"|"authenticatedAt">;
}

export class ConfiguredCredentialAuthenticationProvider implements AuthenticationProvider{
  readonly id="configured-credential";
  constructor(private readonly configuration?:ConfiguredIdentity){}

  async authenticate(request:AuthenticationRequest):Promise<AuthenticatedIdentity|null>{
    const configured=this.configuration;
    if(!configured||!configured.credential) return null;
    const supplied=Buffer.from(request.credential??"","utf8");
    const expected=Buffer.from(configured.credential,"utf8");
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)) return null;
    return {
      subject:configured.identity.subject,
      roles:[...configured.identity.roles],
      projectIds:configured.identity.projectIds?[...configured.identity.projectIds]:undefined,
      authenticatedAt:new Date().toISOString()
    };
  }
}

export function configuredIdentityFromEnvironment(env:NodeJS.ProcessEnv=process.env):ConfiguredIdentity|undefined{
  const credential=env.ENGINEERING_AUTH_CREDENTIAL;
  const subject=env.ENGINEERING_AUTH_SUBJECT;
  if(!credential||!subject) return undefined;
  const roles=(env.ENGINEERING_AUTH_ROLES??"ENGINEER").split(",").map(value=>value.trim()).filter(Boolean) as EngineeringRole[];
  const projectIds=env.ENGINEERING_AUTH_PROJECT_IDS?.split(",").map(value=>value.trim()).filter(Boolean);
  return {credential,identity:{subject,roles,projectIds}};
}
