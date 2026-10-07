import {InMemoryAuditTrail} from "../audit/trail.js";
import {ApplicationAuthenticationService,createApplicationAuthenticationService} from "./application.js";
import {configuredIdentityFromEnvironment,ConfiguredCredentialAuthenticationProvider} from "./configured-provider.js";

const SESSION_TTL_MS=8*60*60*1000;
const globalKey="__ENGINEERING_AUTH_SERVICE__";
type GlobalWithAuth=typeof globalThis & {[globalKey]?:ApplicationAuthenticationService};

export function getApplicationAuthenticationService():ApplicationAuthenticationService{
  const holder=globalThis as GlobalWithAuth;
  const existing=holder[globalKey];
  if(existing) return existing;
  const secret=process.env.AUTH_SESSION_SECRET??process.env.AUTH_SECRET;
  if(!secret) throw new Error("AUTH_SESSION_SECRET or AUTH_SECRET is required.");
  const service=createApplicationAuthenticationService({
    provider:new ConfiguredCredentialAuthenticationProvider(configuredIdentityFromEnvironment()),
    secret,
    sessionTtlMs:SESSION_TTL_MS,
    audit:new InMemoryAuditTrail()
  });
  holder[globalKey]=service;
  return service;
}
