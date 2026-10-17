import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20261017104855_v2_0_29_durable_execution_jobs.sql"),"utf8").toLowerCase();
describe("durable execution migration contract",()=>{
 it("stores idempotency, attempt, result, cancellation and provenance state",()=>{
  for(const value of ["idempotency_key","request_hash","attempts","max_attempts","attempt_history","cancel_requested_at","provenance","artifact_ids","evidence_ids"])expect(sql).toContain(value);
 });
 it("uses row locking and a worker fencing token for concurrent claims",()=>{
  expect(sql).toContain("for update skip locked");expect(sql).toContain("lease_token");expect(sql).toContain("lease_expires_at");
 });
 it("restricts the claim RPC to service_role",()=>{
  expect(sql).toContain("revoke all on function public.claim_engineering_execution_job(text,integer) from public,anon,authenticated");
  expect(sql).toContain("grant execute on function public.claim_engineering_execution_job(text,integer) to service_role");
  expect(sql).toContain("alter table public.engineering_execution_jobs enable row level security");
 });
});
