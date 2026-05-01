create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  prompt text not null,
  answer text not null,
  agent_trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_role text not null,
  memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  steps jsonb not null default '[]'::jsonb,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.world_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  state jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.agent_memories enable row level security;
alter table public.missions enable row level security;
alter table public.world_states enable row level security;
alter table public.logs enable row level security;
alter table public.system_settings enable row level security;

create policy "users manage own conversations" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own memories" on public.agent_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own missions" on public.missions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own world states" on public.world_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users read own logs" on public.logs
  for select using (auth.uid() = user_id);

create policy "admin reads settings" on public.system_settings
  for select using ((auth.jwt() ->> 'email') = 'parreiracarvalhod@gmail.com');

create policy "admin writes settings" on public.system_settings
  for all using ((auth.jwt() ->> 'email') = 'parreiracarvalhod@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'parreiracarvalhod@gmail.com');
