import {NextResponse} from "next/server";
import {verifyResearchFinding} from "../../../../src/research/verification";

export async function POST(request:Request){
  try{
    const body=await request.json();
    const result=verifyResearchFinding({finding:body.finding,method:body.method,verifier:body.verifier,notes:body.notes,evidenceUri:body.evidenceUri});
    return NextResponse.json(result,{status:result.verified?200:422});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Verification failed."},{status:400});
  }
}
