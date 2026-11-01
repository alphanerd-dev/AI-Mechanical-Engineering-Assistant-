-- Keep the project chat-history rail light: session summaries are persisted with each revision.
alter table public.engineering_intent_sessions
  add column if not exists chat_title text not null default 'New conversation'
    check (length(trim(chat_title)) between 1 and 62),
  add column if not exists message_count integer not null default 0
    check (message_count between 0 and 200);

-- Preserve an accurate count for existing transcripts without transferring message bodies.
update public.engineering_intent_sessions
set message_count = jsonb_array_length(conversation)
where message_count = 0 and jsonb_array_length(conversation) > 0;

create index if not exists engineering_chat_sessions_project_updated_idx
  on public.engineering_intent_sessions(project_id, updated_at desc)
  where session_id like 'engineering-chat-%';

comment on column public.engineering_intent_sessions.chat_title is
  'A concise, first-engineer-message summary used by the project chat list; not an engineering result or approval.';
comment on column public.engineering_intent_sessions.message_count is
  'Count of stored visible conversation messages for chat-list display; not a task, run, or artifact count.';
