-- V2.0.23: resumable engineering intent conversation snapshot (P2).
-- Extends durable intent sessions with a versioned visible conversation.
-- Existing interpretation-only rows remain valid; conversation defaults to [].

alter table public.engineering_intent_sessions
  add column if not exists schema_version integer not null default 1
    check (schema_version >= 1),
  add column if not exists conversation jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conversation) = 'array'),
  add column if not exists snapshot_revision integer not null default 1
    check (snapshot_revision >= 1);

comment on column public.engineering_intent_sessions.schema_version is
  'Version of the session snapshot contract. Bump only with a migration and reader compatibility.';
comment on column public.engineering_intent_sessions.conversation is
  'Visible engineering conversation messages required to resume after refresh. Not engineering verification evidence.';

comment on column public.engineering_intent_sessions.snapshot_revision is
  'Monotonic session snapshot revision used for compare-and-set writes to prevent stale tabs overwriting newer conversation state.';
