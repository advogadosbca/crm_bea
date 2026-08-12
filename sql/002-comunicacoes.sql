-- ============================================================================
--  Central de Novidades — comunicações processuais
-- ============================================================================
--  COMO RODAR: `node migrate-comunicacoes.mjs` (usa pg-meta com a service_role
--  de .env.prod), ou colar no SQL Editor do Supabase self-hosted.
--  É idempotente — pode rodar quantas vezes quiser.
--
--  POR QUE ESTA TABELA EXISTE
--  Até aqui a última publicação do DJEN era gravada numa CÉLULA da fonte
--  "Processos Judiciais" (coluna "Atualização Comunica"), que é sobrescrita a
--  cada sincronização. Isso impede tudo que a central de novidades precisa:
--    - não existe "não lido", porque não existe item, existe um campo;
--    - duas publicações entre duas rodadas = a primeira some sem ser vista;
--    - não dá para aprovar uma e deixar outra pendente;
--    - a aprovação (quem, quando, virou qual tarefa) não tem onde morar.
--  Aqui é uma linha por comunicação, imutável. A célula continua existindo,
--  mas passa a ser só uma prévia para leitura rápida na tabela.
--
--  IDEMPOTÊNCIA DA INGESTÃO
--  O DJEN devolve `id` e `hash` próprios por item (conferido em 100 publicações
--  reais: os dois vêm preenchidos em 100%). Os índices únicos abaixo tornam o
--  pipeline seguro para reprocessar: rodar de novo nunca duplica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. OAB no perfil — para casar o advogado intimado com o usuário do sistema
-- ----------------------------------------------------------------------------
-- O item do DJEN traz `destinatarioadvogados[].advogado.numero_oab`. Com a OAB
-- no perfil, o sistema sabe qual dos dois advogados foi efetivamente intimado
-- sem precisar de regra inventada.
alter table public.profiles add column if not exists oab text;
alter table public.profiles add column if not exists oab_uf text;

-- ----------------------------------------------------------------------------
-- 2. Segredos do workspace (chave da IA)
-- ----------------------------------------------------------------------------
-- Tabela separada de `workspaces` de propósito: `workspaces` é lida pelo
-- cliente (banner, logo, nome) com `select *` em mais de um lugar. Guardar a
-- chave lá vazaria ela para o navegador. Aqui não há NENHUMA policy e a RLS
-- está ligada — ou seja, só a service_role (rotas de servidor) enxerga.
create table if not exists public.workspace_secrets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  ia_provider  text not null default 'gemini',
  ia_api_key   text,
  ia_modelo    text not null default 'gemini-2.5-flash',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);
alter table public.workspace_secrets enable row level security;

-- Webhook que leva o aviso ao cliente (n8n -> WhatsApp). Fica aqui pelo mesmo
-- motivo da chave: é endpoint com token na URL na maioria das montagens.
alter table public.workspace_secrets add column if not exists webhook_cliente_url text;

-- ----------------------------------------------------------------------------
-- 3. Comunicações
-- ----------------------------------------------------------------------------
create table if not exists public.comunicacoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- vínculo com a fonte dinâmica de processos (db_rows.id). Sem FK porque
  -- db_rows é genérica e a linha pode ser recriada numa reimportação; a
  -- comunicação não deve sumir junto.
  processo_row_id uuid,
  cnj text not null,

  -- origem
  fonte       text not null default 'djen',   -- djen | datajud | mni
  external_id text,                           -- items[].id
  hash_origem text,                           -- items[].hash

  -- conteúdo: `texto` guarda a publicação INTEIRA. A mediana real é 885
  -- caracteres e o maior que medi tem 26.130 — o corte de 600 do
  -- limparPublicacao() descartava 73% do conteúdo, justamente o que a
  -- classificação precisa ler.
  texto            text not null,
  data_publicacao  date,
  tipo_comunicacao text,
  tipo_documento   text,
  nome_classe      text,
  orgao            text,
  tribunal         text,
  meio             text,                      -- D = diário, E = eletrônico
  link             text,

  -- destinatários vindos do próprio DJEN
  advogados_intimados jsonb not null default '[]'::jsonb,  -- [{nome,oab,uf,profile_id}]
  partes              jsonb not null default '[]'::jsonb,  -- [{nome,polo}]

  -- quem TRATA no escritório. Não é o mesmo que o advogado intimado: só dois
  -- advogados aparecem nas comunicações, mas quem faz a reunião com o cliente
  -- é o resto da equipe. Vem da coluna "Responsável" da fonte de Processos.
  responsaveis uuid[] not null default '{}',

  -- ciclo de vida
  status            text not null default 'nova',   -- nova | aprovada | dispensada
  lida_em           timestamptz,
  aprovada_por      uuid references public.profiles(id) on delete set null,
  aprovada_em       timestamptz,
  dispensada_motivo text,

  -- classificação por IA (nunca bloqueia a novidade: se falhar fica nulo e o
  -- item aparece cru, marcado como não classificado)
  classificacao        jsonb,
  classificado_em      timestamptz,
  classificacao_modelo text,
  classificacao_erro   text,

  -- o que a aprovação gerou (trava de idempotência: aprovar duas vezes não
  -- cria duas tarefas nem manda duas mensagens)
  pendencia_row_id   uuid,
  audiencia_row_id   uuid,
  webhook_enviado_em timestamptz,

  -- o tribunal pode cancelar uma publicação já divulgada. Se ela já virou
  -- tarefa com prazo, isso precisa aparecer na cara do advogado.
  cancelada        boolean not null default false,
  cancelada_motivo text,

  -- quando o CRM viu pela primeira vez. É este o campo de "novidade", não a
  -- data de publicação: publicação de 29/07 pode ser detectada em 12/08 e
  -- filtro por data_publicacao a esconderia.
  detectado_em timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint comunicacoes_status_ck check (status in ('nova','aprovada','dispensada'))
);

-- dedupe: `id` do DJEN quando existe, `hash` como reserva para fonte que não
-- tenha id próprio. Índices parciais para os dois não brigarem entre si.
create unique index if not exists comunicacoes_uniq_external
  on public.comunicacoes (workspace_id, fonte, external_id)
  where external_id is not null;

create unique index if not exists comunicacoes_uniq_hash
  on public.comunicacoes (workspace_id, fonte, hash_origem)
  where hash_origem is not null and external_id is null;

create index if not exists comunicacoes_caixa
  on public.comunicacoes (workspace_id, status, detectado_em desc);

create index if not exists comunicacoes_cnj
  on public.comunicacoes (workspace_id, cnj);

create index if not exists comunicacoes_responsaveis
  on public.comunicacoes using gin (responsaveis);

-- updated_at automático
create or replace function public.tg_comunicacoes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists comunicacoes_touch on public.comunicacoes;
create trigger comunicacoes_touch before update on public.comunicacoes
  for each row execute function public.tg_comunicacoes_touch();

-- ----------------------------------------------------------------------------
-- 4. RLS: membros do workspace LEEM; escrita só pela service_role
-- ----------------------------------------------------------------------------
-- Toda mutação (marcar lida, aprovar, dispensar) passa por route handler no
-- servidor. Assim a criação da tarefa, o carimbo de auditoria e o webhook
-- ficam num lugar só, e o cliente não consegue aprovar pulando essa lógica.
alter table public.comunicacoes enable row level security;

drop policy if exists comunicacoes_select on public.comunicacoes;
create policy comunicacoes_select on public.comunicacoes
  for select using (workspace_id = public.my_workspace_id());

-- ----------------------------------------------------------------------------
-- 5. Coluna "Responsável" na fonte Processos Judiciais
-- ----------------------------------------------------------------------------
-- Tipo `people` (múltiplo) e não `person`: na prática a linha tem o advogado
-- que responde pelo processo E quem conversa com o cliente, que são pessoas
-- diferentes neste escritório.
insert into public.db_columns (table_id, name, type, config, position)
select t.id, 'Responsável', 'people', '{}'::jsonb,
       coalesce((select max(c2.position) + 1 from public.db_columns c2 where c2.table_id = t.id), 0)
from public.db_tables t
where t.module_key = 'processos'
  and not exists (
    select 1 from public.db_columns c
    where c.table_id = t.id and c.name = 'Responsável'
  );

-- ----------------------------------------------------------------------------
-- 6. Verificação
-- ----------------------------------------------------------------------------
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'comunicacoes')       as tabela_comunicacoes,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'workspace_secrets')  as tabela_secrets,
  (select count(*) from public.db_columns c
     join public.db_tables t on t.id = c.table_id
    where t.module_key = 'processos' and c.name = 'Responsável')          as coluna_responsavel,
  (select count(*) from information_schema.columns
     where table_name = 'profiles' and column_name = 'oab')               as profiles_oab;
