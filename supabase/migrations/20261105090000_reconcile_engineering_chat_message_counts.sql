-- Reconcile sidebar counts with the authoritative persisted conversation snapshots.
-- Older chat rows may have metadata written by a previous client/runtime revision.
update public.engineering_intent_sessions
set message_count = jsonb_array_length(conversation)
where session_id like 'engineering-chat-%'
  and jsonb_typeof(conversation) = 'array'
  and message_count is distinct from jsonb_array_length(conversation);
