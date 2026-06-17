-- V4: tabela para registrar eventos recebidos pelo webhook da Meta/Instagram.
-- Rode este script no Supabase SQL Editor.

create table if not exists webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  origem text default 'webhook',
  tipo_evento text default 'comment',
  instagram_media_id text,
  instagram_comment_id text,
  instagram_username text,
  comentario_texto text,
  produto_encontrado boolean default false,
  modo_seguro boolean default true,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table webhook_eventos enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.webhook_eventos to service_role;
