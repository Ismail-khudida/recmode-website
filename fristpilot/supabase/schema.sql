-- FristPilot – Datenbank-Schema
-- Im Supabase SQL Editor ausführen.
-- Die Tabelle `auth.users` wird von Supabase Auth verwaltet.

-- ------------------------------------------------------------------
-- documents
-- ------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  file_name       text not null,
  file_url        text,                 -- Pfad im Storage-Bucket
  file_type       text,                 -- z.B. application/pdf, image/png
  extracted_text  text,                 -- erkannter Rohtext (best effort)
  analysis_json   jsonb,                -- strukturiertes KI-Ergebnis
  created_at      timestamptz not null default now()
);

create index if not exists documents_user_id_created_at_idx
  on public.documents (user_id, created_at desc);

-- ------------------------------------------------------------------
-- reminders
-- ------------------------------------------------------------------
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  document_id   uuid references public.documents (id) on delete set null,
  title         text not null,
  description   text,
  due_date      date,
  status        text not null default 'open' check (status in ('open', 'done')),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists reminders_user_id_status_idx
  on public.reminders (user_id, status, due_date);

-- ------------------------------------------------------------------
-- Row Level Security: Nutzer dürfen nur ihre eigenen Daten sehen.
-- ------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.reminders enable row level security;

drop policy if exists "documents are private" on public.documents;
create policy "documents are private"
  on public.documents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "reminders are private" on public.reminders;
create policy "reminders are private"
  on public.reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Storage-Bucket für Dokumente
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Nutzer dürfen nur auf Dateien in ihrem eigenen Ordner (user_id/...) zugreifen.
drop policy if exists "users manage own files" on storage.objects;
create policy "users manage own files"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
