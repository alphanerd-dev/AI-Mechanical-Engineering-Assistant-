-- The decision RPC locks the immutable assessment row to serialize final decisions.
-- Keep direct service-role UPDATE/DELETE grants revoked; use a narrowly scoped,
-- fixed-search-path SECURITY DEFINER function exposed only to service_role.
alter function public.record_manufacturing_decision_with_audit(jsonb, jsonb)
  security definer;
revoke all on function public.record_manufacturing_decision_with_audit(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_manufacturing_decision_with_audit(jsonb, jsonb)
  to service_role;
