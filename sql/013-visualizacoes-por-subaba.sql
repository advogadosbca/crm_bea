-- ============================================================================
--  Visualizações independentes por sub-aba da Geral + config salva no banco
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec -i supabase-db psql -U postgres`. Idempotente.
--
--  O PROBLEMA
--  As sub-abas Funil Pré-Atendimento, Leads em Negociação e Ações mostram a
--  mesma fonte (Leads - CRM) e dividiam a mesma lista de visualizações: criar
--  um quadro numa aparecia nas outras (e em /tabelas). Negociação e Ações nem
--  tinham visualização de verdade no banco — ids fixos 'neg'/'acoes' — então
--  trocar para Quadro não gravava e voltava ao reabrir.
--
--  O QUE MUDA
--  1. db_views.escopo: a quem a visualização pertence. NULL = da própria fonte
--     (/tabelas). 'geral-funil' | 'geral-negociacao' | 'geral-acoes' = da
--     sub-aba da Geral. Cada lugar só lista as suas.
--  2. db_views.config: filtros, ordenação, agrupamento e cor condicional da
--     visualização. Antes ficavam no localStorage de cada navegador — o quadro
--     montado por uma pessoa não existia para as outras.
--  3. Semeia as sub-abas. As visualizações que o Funil mostra hoje (Funil e
--     Cadastros) MUDAM de dono para 'geral-funil' — assim quem usa o Funil não
--     perde nada (colunas ocultas, config do navegador). A fonte em /tabelas
--     ganha cópias delas. Negociação e Ações ganham um quadro cada.
-- ============================================================================

alter table public.db_views add column if not exists escopo text;
alter table public.db_views add column if not exists config jsonb;
create index if not exists db_views_table_escopo_idx on public.db_views (table_id, escopo);

do $$
declare
  lt uuid;
  v record;
  nova uuid;
begin
  select id into lt from public.db_tables where module_key = 'fonte-leads' limit 1;
  if lt is null then return; end if;
  -- já semeado: não faz de novo
  if exists (select 1 from public.db_views where table_id = lt and escopo like 'geral-%') then return; end if;

  for v in select * from public.db_views where table_id = lt and escopo is null order by position loop
    -- cópia que fica para /tabelas
    insert into public.db_views (table_id, name, type, position, escopo)
      values (lt, v.name, v.type, v.position, null) returning id into nova;
    -- a cópia herda as colunas ocultas da original
    update public.db_columns
       set config = jsonb_set(config, '{hiddenInViews}', (config->'hiddenInViews') || to_jsonb(nova::text))
     where table_id = lt and config->'hiddenInViews' ? v.id::text;
    -- a original passa a ser do Funil
    update public.db_views set escopo = 'geral-funil' where id = v.id;
  end loop;

  insert into public.db_views (table_id, name, type, position, escopo) values
    (lt, 'Leads em Negociação', 'board', 0, 'geral-negociacao'),
    (lt, 'Ações', 'board', 0, 'geral-acoes');
end $$;
