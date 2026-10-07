export const ENGINEERING_SESSION_COOKIE="engineering_session";

export function getSessionToken(request:Request):string|undefined{
  const header=request.headers.get("cookie");
  if(!header) return undefined;
  for(const part of header.split(";")){
    const [key,...value]=part.trim().split("=");
    if(key===ENGINEERING_SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function sessionCookie(token:string,maxAgeSeconds:number,secure=true):string{
  return [
    ENGINEERING_SESSION_COOKIE+"="+encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age="+String(maxAgeSeconds),
    secure?"Secure":""
  ].filter(Boolean).join("; ");
}

export function clearSessionCookie(secure=true):string{
  return [ENGINEERING_SESSION_COOKIE+"=","Path=/","HttpOnly","SameSite=Lax","Max-Age=0",secure?"Secure":""].filter(Boolean).join("; ");
}
