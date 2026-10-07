import {NextResponse} from "next/server";
import {CapabilityRegistry} from "../../../../src/capabilities/registry";
import {CapabilityRouter} from "../../../../src/capabilities/router";
import {V2_0_11_CAPABILITIES} from "../../../../src/capabilities/v2-0-11";
import {RiskAdaptiveExperienceProvider} from "../../../../src/providers/experience";
import {authorizeSupabaseRequest} from "../../../../src/auth/supabase-service";

export const runtime="nodejs";

export async function POST(request:Request){
  const body=await request.json().catch(()=>({}));
  const projectId=typeof body.projectId==="string"&&body.projectId.trim()?body.projectId.trim():undefined;
  const authorization=await authorizeSupabaseRequest("TASK.PROPOSE",projectId);
  if(!authorization.allowed){
    return NextResponse.json({error:authorization.reason},{status:403});
  }

  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  const router=new CapabilityRouter(registry);
  registry.register(new RiskAdaptiveExperienceProvider());

  const result=await router.execute({
    capability:"ENGINEERING.ASSESS_EXPERIENCE",
    risk:"LOW",
    input:body
  });

  return result.success
    ?NextResponse.json(result.output)
    :NextResponse.json({error:result.error??"Experience assessment failed."},{status:500});
}
