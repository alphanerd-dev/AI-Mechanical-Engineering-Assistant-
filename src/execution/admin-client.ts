import {createClient} from "@supabase/supabase-js";
/** Server-only entry used by the separate Node worker; never import from client modules. */
export function createExecutionWorkerAdminClient(){
 const url=process.env.SUPABASE_URL?.trim()||process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(!url||!key)throw new Error("Execution worker requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
 if(key.startsWith("sb_publishable_")||key.startsWith("sb_anon_"))throw new Error("Execution worker refuses a public Supabase key.");
 if(key.startsWith("eyJ")){
  try{const payload=JSON.parse(Buffer.from(key.split(".")[1]??"","base64url").toString("utf8")) as {role?:unknown};if(payload.role!=="service_role")throw new Error("wrong role");}
  catch{throw new Error("Execution worker requires a valid service_role JWT or current sb_secret_ key.");}
 }else if(!key.startsWith("sb_secret_"))throw new Error("Execution worker requires a service_role JWT or current sb_secret_ key.");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
