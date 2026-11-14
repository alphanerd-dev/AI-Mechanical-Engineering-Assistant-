-- Make the trust boundary of pilot readiness inputs explicit in every durable record.
alter table public.engineering_manufacturing_assessments
  add column source_evidence_status text not null default 'USER_SUPPLIED_UNVERIFIED'
  check (source_evidence_status = 'USER_SUPPLIED_UNVERIFIED');
