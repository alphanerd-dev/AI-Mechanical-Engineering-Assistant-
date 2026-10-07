import {NextResponse} from "next/server";
import {getApplicationAuthenticationService} from "../../../../src/auth/runtime.js";
import {getSessionToken} from "../../../../src/auth/http.js";

export const runtime="nodejs";

export async function GET(request:Request){
  try{
    const service=getApplicationAuthenticationService();
    const token=getSessionToken(request);
    const identity=token?service.resolve(token):null;
    if(!identity) return NextResponse.json({authenticated:false},{status:401});
    return NextResponse.json({authenticated:true,identity});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Authentication is not configured."},{status:503});
  }
}
