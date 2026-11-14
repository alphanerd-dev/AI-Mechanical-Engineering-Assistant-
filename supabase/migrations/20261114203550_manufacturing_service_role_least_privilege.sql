-- Keep service-role access limited to immutable record reads and inserts.
revoke all on table public.engineering_manufacturing_assessments from service_role;
revoke all on table public.engineering_manufacturing_decisions from service_role;
grant select, insert on table public.engineering_manufacturing_assessments to service_role;
grant select, insert on table public.engineering_manufacturing_decisions to service_role;
