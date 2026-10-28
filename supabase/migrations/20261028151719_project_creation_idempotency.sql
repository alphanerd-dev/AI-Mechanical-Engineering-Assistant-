-- Project creation retries are common after mobile/network timeouts. Bind an optional request key
-- to the normalized payload and enforce uniqueness per verified owner at the database boundary.
alter table public.engineering_projects
  add column creation_request_key text,
  add column creation_payload_sha256 text;

alter table public.engineering_projects
  add constraint engineering_projects_creation_idempotency_pair_check
  check (
    (creation_request_key is null and creation_payload_sha256 is null)
    or (
      creation_request_key is not null
      and creation_request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      and creation_payload_sha256 is not null
      and creation_payload_sha256 ~ '^[a-f0-9]{64}$'
    )
  );

create unique index engineering_projects_owner_creation_request_key_unique
  on public.engineering_projects (owner_id, creation_request_key)
  where creation_request_key is not null;

comment on column public.engineering_projects.creation_request_key is
  'Optional owner-scoped idempotency key for safe project creation retries; never treated as authorization.';
comment on column public.engineering_projects.creation_payload_sha256 is
  'SHA-256 of the normalized name/problemStatement payload bound to creation_request_key.';
