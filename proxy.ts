import {NextResponse,type NextRequest} from "next/server";
import {getApplicationAuthenticationService} from "./src/auth/runtime.js";
import {getSessionToken} from "./src/auth/http.js";

export function proxy(request:NextRequest){
  const pathname=request.nextUrl.pathname;
  const isPage=pathname.startsWith("/projects");
  const isEngineeringApi=pathname.startsWith("/api/engineering/");
  if(!isPage&&!isEngineeringApi) return NextResponse.next();
  let service;
  try{service=getApplicationAuthenticationService();}
  catch(error){
    if(isEngineeringApi) return NextResponse.json({error:error instanceof Error?error.message:"Authentication is not configured."},{status:503});
    return NextResponse.redirect(new URL("/login?error=auth_not_configured",request.url));
  }
  const token=getSessionToken(request);
  const identity=token?service.resolve(token):null;
  if(identity) return NextResponse.next();
  if(isEngineeringApi) return NextResponse.json({error:"Unauthenticated."},{status:401});
  return NextResponse.redirect(new URL("/login",request.url));
}

export const config={matcher:["/projects/:path*","/api/engineering/:path*"]};
