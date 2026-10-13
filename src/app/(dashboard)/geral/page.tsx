import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { GeralClient, type LeadsBoard, type Mode } from './GeralClient'
import { podeVerAba } from '@/lib/abas'

/** sub-abas da Geral, na ordem da tela; a chave de acesso é "geral.<sub>" (lib/abas) */
const SUB_ABAS: Mode[] = ['tabela', 'funil', 'negociacao', 'acoes', 'atendimentos']
import type { DBView } from '@/components/dynamic/DynamicBoard'
import { DBColumn, DBRow, filterAdminOnly, isAdminRole } from '@/types/dynamic'
import { fetchAllRows } from '@/lib/db-rows'

export default async function GeralPage({ searchParams }: {
  searchParams: Promise<{ card?: string }>
}) {
  // ?card=<id> vem do link de tarefa no painel do cliente: abre o cartão direto
  const { card: cardParam } = await searchParams
  const { supabase, user, profile } = await getAuthProfile()
  const workspaceId = profile?.workspace_id
  const ws = workspaceId || ''

  // Nada aqui depende de outra consulta: tudo sai junto (antes eram 4 idas em fila)
  const [assets, { data: contacts }, { data: members }, { data: kanbanCols }, { data: boardLists }, { data: boardLabels }, { data: boardCardsRaw }, { data: dynTables }] = await Promise.all([
    getPageAssets('geral'),
    supabase
      .from('contacts')
      .select('*, responsavel:profiles!contacts_responsavel_id_fkey(full_name, avatar_url)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('workspace_id', ws),
    supabase
      .from('kanban_columns')
      .select('id, board_key, label, color, position')
      .eq('workspace_id', ws)
      .order('position', { ascending: true }),
    supabase.from('board_lists').select('id, title, position').eq('workspace_id', ws).order('position'),
    supabase.from('board_labels').select('id, name, color').eq('workspace_id', ws),
    supabase.from('board_cards').select('id, list_id, title, description, due_date, completed, encerrado_em, arquivado_em, position, board_card_members(profile_id), board_card_labels(label_id)').eq('workspace_id', ws).order('position'),
    // tabelas dinâmicas do Geral (Alerta / Prazos / Pendências / Leads) + fontes
    supabase.from('db_tables').select('id, name, module_key').eq('workspace_id', ws).order('position'),
  ])

  const dynIds = (dynTables || []).map(t => t.id)
  const idDe = (key: string) => (dynTables || []).find(t => t.module_key === key)?.id || ''
  const shortcuts = {
    contatosId: idDe('fonte-contatos'),
    leadsId: idDe('fonte-leads'),
    // o Quadro de Tarefas usa para achar os processos do cliente dentro de dynSources
    processosId: idDe('processos'),
  }

  let dynCols: DBColumn[] = []
  let dynRows: DBRow[] = []
  let leadsViews: (DBView & { escopo: string | null })[] = []
  if (dynIds.length) {
    const [{ data: c }, { data: v }] = await Promise.all([
      supabase.from('db_columns').select('*').in('table_id', dynIds).order('position'),
      shortcuts.leadsId
        ? supabase.from('db_views').select('id, name, type, position, config, escopo')
          .eq('table_id', shortcuts.leadsId).like('escopo', 'geral-%').order('position')
        : Promise.resolve({ data: [] }),
    ])
    // colunas "somente admins" ficam fora do payload de quem não é admin
    dynCols = filterAdminOnly((c || []) as DBColumn[], isAdminRole(profile?.role))
    leadsViews = (v || []) as typeof leadsViews

    // Linhas SÓ das fontes que esta página mostra — e das que elas apontam por
    // relação (Processos → Clientes), para chips, rollups e fichas aninhadas.
    // Antes vinham as linhas de TODAS as fontes (Financeiro inteiro incluso),
    // ~3 MB de JSON a cada entrada na Geral, e era isso que deixava a troca de
    // página lenta. As outras fontes seguem na lista (nome + colunas), sem linhas.
    const usadas = new Set(
      ['fonte-leads', 'geral-alerta', 'geral-prazos', 'pendencias', 'processos', 'fonte-contatos'].map(idDe).filter(Boolean),
    )
    for (let mudou = true; mudou;) {
      mudou = false
      for (const col of dynCols) {
        const alvo = col.type === 'relation' ? col.config?.sourceTableId as string | undefined : undefined
        if (alvo && usadas.has(col.table_id) && !usadas.has(alvo) && dynIds.includes(alvo)) { usadas.add(alvo); mudou = true }
      }
    }
    // As linhas vêm PAGINADAS: são milhares somando as tabelas e o PostgREST
    // corta em 1000 por resposta, calado. Sem paginar, a maior parte dos
    // Processos Judiciais não chegava aqui e o cartão de tarefa abria sem os
    // processos ativos do cliente. Ver lib/db-rows.
    if (usadas.size) {
      dynRows = await fetchAllRows<DBRow>((de, ate) =>
        supabase.from('db_rows').select('*').in('table_id', [...usadas]).order('position').order('id').range(de, ate))
    }
  }
  const dynSources = (dynTables || []).map(t => ({ id: t.id, name: t.name, columns: dynCols.filter(c => c.table_id === t.id), rows: dynRows.filter(r => r.table_id === t.id) }))
  const tableOf = (key: string) => {
    const t = (dynTables || []).find(x => x.module_key === key)
    return t ? { tableId: t.id, columns: dynCols.filter(c => c.table_id === t.id), rows: dynRows.filter(r => r.table_id === t.id) } : null
  }
  const geralTables = {
    alerta: tableOf('geral-alerta'),
    prazos: tableOf('geral-prazos'),
    // as mesmas linhas de /pendencias — o quadro da Geral edita o mesmo registro
    pendencias: tableOf('pendencias'),
    sources: dynSources,
  }

  // Funil / Negociação / Ações: a mesma fonte Leads, mas cada sub-aba com as
  // próprias visualizações (db_views.escopo, ver sql/013) — antes as três
  // dividiam a lista e um quadro criado numa aparecia nas outras
  const leadsSource = dynSources.find(s => s.id === shortcuts.leadsId)
  let leadsBoard: LeadsBoard | null = null
  if (shortcuts.leadsId && leadsSource) {
    const doEscopo = (e: string) => leadsViews.filter(v => v.escopo === e).map(({ escopo: _, ...v }) => v as DBView)
    leadsBoard = {
      tableId: shortcuts.leadsId, columns: leadsSource.columns, rows: leadsSource.rows,
      views: { funil: doEscopo('geral-funil'), negociacao: doEscopo('geral-negociacao'), acoes: doEscopo('geral-acoes') },
    }
  }

  const cols = kanbanCols || []
  const byBoard = (k: string) => cols.filter(c => c.board_key === k).map(({ id, label, color, position }) => ({ id, label, color, position }))

  const boardCards = (boardCardsRaw || []).map((c: { id: string; list_id: string; title: string; description?: string; due_date?: string; completed?: boolean; encerrado_em?: string; arquivado_em?: string; position: number; board_card_members?: { profile_id: string }[]; board_card_labels?: { label_id: string }[] }) => ({
    id: c.id, list_id: c.list_id, title: c.title, description: c.description, due_date: c.due_date,
    completed: !!c.completed, encerrado_em: c.encerrado_em || null, arquivado_em: c.arquivado_em || null, position: c.position,
    members: (c.board_card_members || []).map(m => m.profile_id),
    labels: (c.board_card_labels || []).map(l => l.label_id),
  }))

  return (
    <GeralClient
      contacts={contacts || []}
      members={members || []}
      workspaceId={workspaceId || ''}
      userId={user!.id}
      userRole={profile?.role || 'colaborador'}
      headerAssets={assets}
      kanbanColumns={{ funil: byBoard('funil'), negociacao: byBoard('negociacao'), acoes: byBoard('acoes') }}
      board={{ lists: boardLists || [], cards: boardCards, labels: boardLabels || [] }}
      geralTables={geralTables}
      shortcuts={shortcuts}
      leadsBoard={leadsBoard}
      openCardId={cardParam}
      subAbasLiberadas={SUB_ABAS.filter(m => podeVerAba(profile?.role, profile?.abas, `geral.${m === 'tabela' ? 'tabelas' : m}`))}
    />
  )
}
