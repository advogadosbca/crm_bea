-- ============================================================================
--  Avaliações — sinal Verde/Amarelo/Vermelho de "Entrega confiável" por tarefa
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec supabase-db psql -U postgres` ou colar no SQL Editor. Idempotente.
--
--  O PEDIDO (Lucas B&A, áudio de 22/09/2026): o head avalia, tarefa por tarefa
--  concluída no Quadro, duas notas — "entrega no prazo" (1 ou 10, sem meio
--  termo: ou cumpriu ou não) e "quantidade de correção" (1 a 10) — mais uma
--  observação livre. No fim do mês soma cada nota separadamente e divide pela
--  quantidade de tarefas avaliadas, dando a média de cada critério por pessoa.
--  Só o Item 1 ("Entrega confiável") dos três blocos entra no sistema por
--  enquanto; os itens 2 e 3 (organização da área, evolução) ficam de fora.
--
--  POR QUE `card_id` É ÚNICO — uma tarefa concluída é avaliada uma vez. A lista
--  de "pendentes" na tela é justamente `board_cards` concluído SEM linha aqui
--  (consulta derivada, não um outro carimbo de data). Excluir a avaliação faz
--  a tarefa voltar sozinha pra pendentes — não precisa de campo de "status".
-- ============================================================================

create table if not exists public.avaliacoes_entrega (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  card_id uuid not null references public.board_cards(id) on delete cascade,
  avaliado_id uuid not null references public.profiles(id) on delete cascade,
  avaliador_id uuid references public.profiles(id) on delete set null,
  entrega_no_prazo integer not null check (entrega_no_prazo in (1, 10)),
  quantidade_correcao integer not null check (quantidade_correcao between 1 and 10),
  observacao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.avaliacoes_entrega is
  'Avaliação de "entrega confiável" (Item 1 dos três blocos) por tarefa concluída no Quadro. '
  'Uma linha por card_id — apagar a linha devolve o card pra fila de pendentes.';

create unique index if not exists avaliacoes_entrega_card_unico_idx
  on public.avaliacoes_entrega (card_id);

create index if not exists avaliacoes_entrega_avaliado_idx
  on public.avaliacoes_entrega (workspace_id, avaliado_id, created_at desc);

create or replace function public.tg_avaliacoes_entrega_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists avaliacoes_entrega_updated_at on public.avaliacoes_entrega;
create trigger avaliacoes_entrega_updated_at
  before update on public.avaliacoes_entrega
  for each row execute function public.tg_avaliacoes_entrega_updated_at();

alter table public.avaliacoes_entrega enable row level security;

-- só admin/super_admin mexe aqui — a tela já é bloqueada pro resto (cadeado),
-- isso é a segunda trava, direto no banco
drop policy if exists avaliacoes_entrega_rw on public.avaliacoes_entrega;
create policy avaliacoes_entrega_rw on public.avaliacoes_entrega
  for all using (
    workspace_id = public.my_workspace_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
  )
  with check (
    workspace_id = public.my_workspace_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
  );

select count(*) as linhas_avaliacoes_entrega from public.avaliacoes_entrega;
