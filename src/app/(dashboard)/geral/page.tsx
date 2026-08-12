import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { GeralClient } from './GeralClient'
import type { PendenciaResumo } from './PendenciasResumo'
import { DBColumn, DBRow, filterAdminOnly, isAdminRole } from '@/types/dynamic'

export default async function GeralPage({ searchParams }: {
  searchParams: Promise<{ card?: string }>
}) {
  // ?card=<id> vem do link de tarefa no painel do cliente: abre o cartão direto
  const { card: cardParam } = await searchParams
  const { supabase, user, profile } = await getAuthProfile()
  const workspaceId = profile?.workspace_id
  const assets = await getPageAssets('geral')

  const [{ data: contacts }, { data: members }, { data: kanbanCols }, { data: boardLists }, { data: boardLabels }, { data: boardCardsRaw }] = await Promise.all([
    supabase
      .from('contacts')
      .select('*, responsavel:profiles!contacts_responsavel_id_fkey(full_name, avatar_url)')
      .eq('workspace_id', workspaceId || '')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('workspace_id', workspaceId || ''),
    supabase
      .from('kanban_columns')
      .select('id, board_key, label, color, position')
      .eq('workspace_id', workspaceId || '')
      .order('position', { ascending: true }),
    supabase.from('board_lists').select('id, title, position').eq('workspace_id', workspaceId || '').order('position'),
    supabase.from('board_labels').select('id, name, color').eq('workspace_id', workspaceId || ''),
    supabase.from('board_cards').select('id, list_id, title, description, due_date, completed, position, board_card_members(profile_id), board_card_labels(label_id)').eq('workspace_id', workspaceId || '').order('position'),
  ])

  // tabelas dinâmicas do Geral (Alerta / Prazos) + fontes
  const { data: dynTables } = await supabase.from('db_tables').select('id, name, module_key').eq('workspace_id', workspaceId || '').order('position')
  const dynIds = (dynTables || []).map(t => t.id)
  let dynCols: DBColumn[] = []
  let dynRows: DBRow[] = []
  if (dynIds.length) {
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('db_columns').select('*').in('table_id', dynIds).order('position'),
      supabase.from('db_rows').select('*').in('table_id', dynIds).order('position').limit(100000),
    ])
    // colunas "somente admins" ficam fora do payload de quem não é admin
    dynCols = filterAdminOnly((c || []) as DBColumn[], isAdminRole(profile?.role)); dynRows = (r || []) as DBRow[]
  }
  const dynSources = (dynTables || []).map(t => ({ id: t.id, name: t.name, columns: dynCols.filter(c => c.table_id === t.id), rows: dynRows.filter(r => r.table_id === t.id) }))
  const tableOf = (key: string) => {
    const t = (dynTables || []).find(x => x.module_key === key)
    return t ? { tableId: t.id, columns: dynCols.filter(c => c.table_id === t.id), rows: dynRows.filter(r => r.table_id === t.id) } : null
  }
  const geralTables = { alerta: tableOf('geral-alerta'), prazos: tableOf('geral-prazos'), sources: dynSources }

  // Pendências processuais para o bloco da Geral. As linhas são as mesmas de
  // /pendencias — aqui só se traduz id de coluna e id de opção para texto, para
  // o componente não precisar conhecer o esquema da fonte.
  const pend = tableOf('pendencias')
  const pendencias: PendenciaResumo[] = (() => {
    if (!pend) return []
    const col = (nome: string) => pend.columns.find(c => c.name === nome)
    const cNum = col('Número do Processo'), cStatus = col('Status'), cData = col('Data de Retorno')
    const cMembros = col('Membros'), cContato = col('Contato'), cPrio = col('Prioridade'), cTipo = col('Tipo de Pendência')
    // a célula guarda ora o id da opção, ora o rótulo — a leitura aceita os dois
    const rotulo = (c: DBColumn | undefined, v: unknown) => {
      if (!c || v == null || v === '') return ''
      const o = (c.config?.options || []).find(x => x.id === v || x.label === v)
      return o ? o.label : String(v)
    }
    const texto = (c: DBColumn | undefined, v: unknown) => (c && v != null ? String(v) : '')

    return pend.rows
      .map(r => {
        const d = r.data as Record<string, unknown>
        const membros = cMembros && Array.isArray(d[cMembros.id]) ? (d[cMembros.id] as unknown[]).map(String) : []
        return {
          rowId: r.id,
          processo: texto(cNum, d[cNum?.id || '']),
          tipo: rotulo(cTipo, d[cTipo?.id || '']),
          status: rotulo(cStatus, d[cStatus?.id || '']),
          prioridade: rotulo(cPrio, d[cPrio?.id || '']),
          dataRetorno: (texto(cData, d[cData?.id || '']) || null) as string | null,
          contato: texto(cContato, d[cContato?.id || '']),
          membros,
        }
      })
      // o que já foi resolvido não é pendência: some da tela de trabalho e
      // continua no quadro completo, em /pendencias
      .filter(p => !['Concluída', 'Arquivada'].includes(p.status))
  })()

  const shortcuts = {
    contatosId: (dynTables || []).find(t => t.module_key === 'fonte-contatos')?.id || '',
    leadsId: (dynTables || []).find(t => t.module_key === 'fonte-leads')?.id || '',
  }

  // funil dinâmico: tabela Leads (quadro por Status pré-atendimento) com relação Contato
  const leadsSource = dynSources.find(s => s.id === shortcuts.leadsId)
  let leadsBoard: { tableId: string; columns: DBColumn[]; rows: DBRow[]; views: { id: string; name: string; type: string; position: number }[] } | null = null
  if (shortcuts.leadsId && leadsSource) {
    const { data: leadsViews } = await supabase.from('db_views').select('id, name, type, position').eq('table_id', shortcuts.leadsId).order('position')
    leadsBoard = { tableId: shortcuts.leadsId, columns: leadsSource.columns, rows: leadsSource.rows, views: leadsViews || [] }
  }

  const cols = kanbanCols || []
  const byBoard = (k: string) => cols.filter(c => c.board_key === k).map(({ id, label, color, position }) => ({ id, label, color, position }))

  const boardCards = (boardCardsRaw || []).map((c: { id: string; list_id: string; title: string; description?: string; due_date?: string; completed?: boolean; position: number; board_card_members?: { profile_id: string }[]; board_card_labels?: { label_id: string }[] }) => ({
    id: c.id, list_id: c.list_id, title: c.title, description: c.description, due_date: c.due_date,
    completed: !!c.completed, position: c.position,
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
      pendencias={pendencias}
      shortcuts={shortcuts}
      leadsBoard={leadsBoard}
      openCardId={cardParam}
    />
  )
}
