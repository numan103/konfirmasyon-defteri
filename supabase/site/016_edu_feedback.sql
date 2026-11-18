-- Alfa Edu reviews and lesson Q&A. Apply only this file for this feature.
create table if not exists public.edu_feedback (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null check (char_length(channel_id) between 1 and 120),
  section_id text not null check (char_length(section_id) between 1 and 60),
  topic_id text not null check (char_length(topic_id) between 1 and 60),
  lesson_id text check (lesson_id is null or char_length(lesson_id) between 1 and 60),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('review','question','answer')),
  parent_id uuid references public.edu_feedback(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  anonymous boolean not null default true,
  rating smallint,
  stage text not null default 'manual' check (stage in ('start','middle','end','manual')),
  body text not null check (char_length(body) between 5 and 3000),
  instructor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edu_feedback_kind_fields check (
    (kind = 'review' and parent_id is null and rating between 1 and 5 and rating is not null) or
    (kind = 'question' and parent_id is null and rating is null) or
    (kind = 'answer' and parent_id is not null and rating is null and instructor)
  )
);
create unique index if not exists edu_feedback_one_review
  on public.edu_feedback(channel_id, section_id, topic_id, user_id) where kind = 'review';
create index if not exists edu_feedback_topic
  on public.edu_feedback(channel_id, section_id, topic_id, kind, created_at desc);
create index if not exists edu_feedback_parent on public.edu_feedback(parent_id);
create index if not exists edu_feedback_rate_limit on public.edu_feedback(user_id, created_at desc);
alter table public.edu_feedback enable row level security;
revoke all on public.edu_feedback from anon, authenticated;
grant all on public.edu_feedback to service_role;
