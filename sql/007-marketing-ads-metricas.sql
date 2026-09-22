-- ============================================================================
--  Marketing / Anúncios — métricas diárias de Google Ads e Meta Ads
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec supabase-db psql -U postgres` ou colar no SQL Editor. Idempotente.
--
--  O PEDIDO: um fluxo n8n busca, uma vez por dia, os dados de ONTEM das contas
--  de Google Ads e Meta Ads da Bernardes & Azevedo e envia pro CRM via
--  POST /api/v1/marketing/metricas. Essa tabela guarda um retrato por
--  (workspace, plataforma, conta, dia) — não é a tabela `campanhas` (essa é uma
--  lista de campanhas cadastrada à mão pela equipe; aqui é a série histórica
--  automática vinda das APIs de anúncios).
--
--  POR QUE upsert por (workspace_id, plataforma, conta_id, data) — se o fluxo
--  rodar de novo no mesmo dia (reprocessamento, retry), atualiza a linha do dia
--  em vez de duplicar.
-- ============================================================================

create table if not exists public.marketing_ads_metricas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plataforma text not null check (plataforma in ('google_ads', 'meta_ads')),
  conta_id text not null,
  conta_nome text,
  data date not null,
  anuncios_ativos integer not null default 0,
  impressoes bigint not null default 0,
  cliques bigint not null default 0,
  leads integer not null default 0,
  investimento numeric(12,2) not null default 0,
  cpm numeric(10,2) not null default 0,
  ctr numeric(6,2) not null default 0,
  cpc numeric(10,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.marketing_ads_metricas is
  'Retrato diário (D-1) das contas de anúncios, uma linha por workspace/plataforma/conta/dia. '
  'Alimentada pelo fluxo n8n via POST /api/v1/marketing/metricas — não editar à mão.';

create unique index if not exists marketing_ads_metricas_unico_idx
  on public.marketing_ads_metricas (workspace_id, plataforma, conta_id, data);

-- A tela consulta "últimos N dias por plataforma" o tempo todo
create index if not exists marketing_ads_metricas_consulta_idx
  on public.marketing_ads_metricas (workspace_id, plataforma, data desc);

create or replace function public.tg_marketing_ads_metricas_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists marketing_ads_metricas_updated_at on public.marketing_ads_metricas;
create trigger marketing_ads_metricas_updated_at
  before update on public.marketing_ads_metricas
  for each row execute function public.tg_marketing_ads_metricas_updated_at();

alter table public.marketing_ads_metricas enable row level security;

drop policy if exists marketing_ads_metricas_rw on public.marketing_ads_metricas;
create policy marketing_ads_metricas_rw on public.marketing_ads_metricas
  for all using (workspace_id = public.my_workspace_id())
  with check (workspace_id = public.my_workspace_id());

select count(*) as linhas_marketing_ads_metricas from public.marketing_ads_metricas;
