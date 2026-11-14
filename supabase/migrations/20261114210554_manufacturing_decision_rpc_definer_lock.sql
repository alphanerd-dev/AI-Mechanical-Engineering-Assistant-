-- Historical migration version retained to match the dedicated E2E ledger.
-- The earlier SECURITY DEFINER experiment was reverted before this PR is merged.
-- Keep the decision writer as SECURITY INVOKER; the following advisory-lock
-- migration removes the FOR UPDATE permission requirement without bypassing RLS.
alter function public.record_manufacturing_decision_with_audit(jsonb, jsonb)
  security invoker;
