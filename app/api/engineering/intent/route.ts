import {NextResponse} from "next/server";
import {CapabilityRegistry} from "../../../../src/capabilities/registry";
import {CapabilityRouter} from "../../../../src/capabilities/router";
import {V2_0_10_CAPABILITIES} from "../../../../src/capabilities/v2-0-10";
import {V2_0_11_CAPABILITIES} from "../../../../src/capabilities/v2-0-11";
import {V2_0_12_CAPABILITIES} from "../../../../src/capabilities/v2-0-12";
import {V2_0_14_CAPABILITIES} from "../../../../src/capabilities/v2-0-14";
import {EngineeringCompletionProvider} from "../../../../src/providers/engineering-completion";
import {RiskAdaptiveExperienceProvider} from "../../../../src/providers/experience";
import {EngineeringContextProvider} from "../../../../src/providers/context";
import {AIEngineeringIntentProvider} from "../../../../src/providers/ai-intent";
import {DeterministicShaftIntentInterpreter} from "../../../../src/intent/shaft";
import {authorizeSupabaseRequest} from "../../../../src/auth/supabase-service";

export const runtime="nodejs";

export async function POST(request:Request){
  const body=await request.json().catch(()=>({}));
  const projectId=typeof body.projectId==="string"&&body.projectId.trim()?body.projectId.trim():undefined;

  const authorization=await authorizeSupabaseRequest("TASK.EXECUTE",projectId);
  if(!authorization.allowed){
    return NextResponse.json({error:authorization.reason},{status:403});
  }

  if(typeof body.rawIntent!=="string"||!body.rawIntent.trim()){
    return NextResponse.json({error:"rawIntent is required."},{status:400});
  }
  if(!projectId){
    return NextResponse.json({error:"projectId is required."},{status:400});
  }

  const registry=new CapabilityRegistry();
  registry.registerCatalog(V2_0_10_CAPABILITIES);
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  registry.registerCatalog(V2_0_12_CAPABILITIES);
  registry.registerCatalog(V2_0_14_CAPABILITIES);

  const router=new CapabilityRouter(registry);
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new AIEngineeringIntentProvider(router,new DeterministicShaftIntentInterpreter()));

  const result=await router.execute({
    capability:"ENGINEERING.ENTER_FROM_INTENT",
    risk:"HIGH",
    input:{
      rawIntent:body.rawIntent.trim(),
      projectId,
      context:body.context,
      approval:body.approval
    }
  });

  if(!result.success&&result.output){
    return NextResponse.json(result.output,{status:422});
  }

  return result.success
    ?NextResponse.json(result.output)
    :NextResponse.json({error:result.error??"Engineering intent execution failed."},{status:500});
}
