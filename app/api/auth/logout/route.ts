import {NextResponse} from "next/server";
import {getApplicationAuthenticationService} from "../../../../src/auth/runtime.js";
import {clearSessionCookie,getSessionToken} from "../../../../src/auth/http.js";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const service=getApplicationAuthenticationService();
    const token=getSessionToken(request);
    if(token) service.revoke(token);
    const response=NextResponse.redirect(new URL("/login",request.url));
    response.headers.append("Set-Cookie",clearSessionCookie(true));
    return response;
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Authentication is not configured."},{status:503});
  }
}
