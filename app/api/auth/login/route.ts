import {NextResponse} from "next/server";
import {getApplicationAuthenticationService} from "../../../../src/auth/runtime.js";
import {sessionCookie} from "../../../../src/auth/http.js";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const contentType=request.headers.get("content-type")??"";
    const credential=contentType.includes("application/json")
      ?String(((await request.json().catch(()=>({}))) as {credential?:unknown}).credential??"")
      :String(((await request.formData().catch(()=>new FormData())).get("credential"))??"");
    if(!credential.trim()) return NextResponse.json({error:"Credential is required."},{status:400});
    const service=getApplicationAuthenticationService();
    const result=await service.authenticate(credential);
    if(!result) return NextResponse.json({error:"Authentication failed."},{status:401});
    const response=NextResponse.redirect(new URL("/",request.url));
    response.headers.append("Set-Cookie",sessionCookie(result.token,8*60*60,true));
    return response;
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Authentication is not configured."},{status:503});
  }
}
