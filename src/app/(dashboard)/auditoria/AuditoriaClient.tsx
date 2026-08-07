'use client'

import { useMemo, useState } from 'react'
import { History, Plus, Trash2, ChevronDown, Search, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { EditableHeader, HeaderAssets } from '@/components/layout/EditableHeader'
import { initials, personColor } from '@/lib/people'

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  record_label: string | null
  context: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}

export interface Membro { id: string; full_name: string; avatar_url?: string | null }

/** nome amigável de cada tabela do banco */
const TIPOS: Record<string, string> = {
  db_rows: 'Registro',
  db_columns: 'Coluna',
  db_tables: 'Fonte de dados',
  db_views: 'Visualização',
  contacts: 'Contato',
  processos: 'Processo',
  audiencias: 'Audiência',
  alvaras: 'Alvará',
  acoes_coletivas: 'Ação coletiva',
  transacoes: 'Transação',
  board_cards: 'Cartão',
  board_lists: 'Lista do quadro',
  kanban_columns: 'Coluna de funil',
}
const tipoLabel = (t: string) => TIPOS[t] || t

type Periodo = '7' | '30' | 'tudo'
type Acao = 'tudo' | 'criou' | 'excluiu'

export function AuditoriaClient({ headerAssets, logs: iniciais, members, colNames, pageSize }: {
  headerAssets: HeaderAssets
  logs: AuditLog[]
  members: Membro[]
  colNames: Record<string, string>
  pageSize: number
}) {
  const supabase = createClient()
  const [logs, setLogs] = useState(iniciais)
  const [fim, setFim] = useState(iniciais.length < pageSize)
  const [carregando, setCarregando] = useState(false)

  const [busca, setBusca] = useState('')
  const [acao, setAcao] = useState<Acao>('tudo')
  const [periodo, setPeriodo] = useState<Periodo>('30')
  const [autor, setAutor] = useState('tudo')
  const [aberto, setAberto] = useState<string | null>(null)

  const nome = (id: string | null) => members.find(m => m.id === id)?.full_name || 'Sistema'

  async function carregarMais() {
    setCarregando(true)
    const ultimo = logs[logs.length - 1]
    const { data } = await supabase
      .from('audit_logs')
      .select('id, user_id, action, table_name, record_id, record_label, context, old_data, new_data, created_at')
      .lt('created_at', ultimo.created_at)
      .order('created_at', { ascending: false })
      .limit(pageSize)
    const novos = (data || []) as AuditLog[]
    setLogs(l => [...l, ...novos])
    if (novos.length < pageSize) setFim(true)
    setCarregando(false)
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const corte = periodo === 'tudo' ? 0 : Date.now() - Number(periodo) * 864e5
    return logs.filter(l => {
      if (acao !== 'tudo' && l.action !== acao) return false
      if (autor !== 'tudo' && l.user_id !== autor) return false
      if (corte && new Date(l.created_at).getTime() < corte) return false
      if (!q) return true
      return [l.record_label, l.context, tipoLabel(l.table_name), nome(l.user_id)]
        .some(v => (v || '').toLowerCase().includes(q))
    })
  }, [logs, busca, acao, periodo, autor]) // eslint-disable-line react-hooks/exhaustive-deps

  // agrupa por dia
  const dias = useMemo(() => {
    const mapa = new Map<string, AuditLog[]>()
    for (const l of filtrados) {
      const d = new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      if (!mapa.has(d)) mapa.set(d, [])
      mapa.get(d)!.push(l)
    }
    return [...mapa.entries()]
  }, [filtrados])

  const criados = filtrados.filter(l => l.action === 'criou').length
  const excluidos = filtrados.filter(l => l.action === 'excluiu').length

  return (
    <div className="min-h-screen">
      <EditableHeader title="Auditoria" icon={History} color="#A78BFA"
        gradient="linear-gradient(135deg, #2e1065 0%, #4c1d95 60%, #2e1065 100%)"
        pageKey="auditoria" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit}
        subtitle="Tudo que foi adicionado e excluído no sistema · visível somente para administradores" />

      <div className="px-16 py-6">
        {/* resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <Card label="Eventos no filtro" valor={filtrados.length} cor="#A78BFA" />
          <Card label="Adicionados" valor={criados} cor="#10B981" icon={Plus} />
          <Card label="Excluídos" valor={excluidos} cor="#F87171" icon={Trash2} />
        </div>

        {/* filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--notion-text-3)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por registro, módulo ou pessoa..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--notion-bg-2)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }} />
          </div>
          <Chips valor={acao} setValor={v => setAcao(v as Acao)} opcoes={[
            { v: 'tudo', label: 'Tudo' }, { v: 'criou', label: 'Adicionados' }, { v: 'excluiu', label: 'Excluídos' },
          ]} />
          <Chips valor={periodo} setValor={v => setPeriodo(v as Periodo)} opcoes={[
            { v: '7', label: '7 dias' }, { v: '30', label: '30 dias' }, { v: 'tudo', label: 'Tudo' },
          ]} />
          <select value={autor} onChange={e => setAutor(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--notion-bg-2)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}>
            <option value="tudo">Todas as pessoas</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>

        {/* timeline */}
        {dias.length === 0 ? (
          <p className="text-sm text-center py-16" style={{ color: 'var(--notion-text-3)' }}>
            Nenhum evento no filtro atual.
          </p>
        ) : dias.map(([dia, itens]) => (
          <section key={dia} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--notion-text-3)' }}>{dia}</h2>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--notion-border)' }}>
              {itens.map(l => {
                const criou = l.action === 'criou'
                const cor = criou ? '#10B981' : '#F87171'
                const Icone = criou ? Plus : Trash2
                const dados = l.old_data || l.new_data
                const expandido = aberto === l.id
                return (
                  <div key={l.id} className="border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <button onClick={() => setAberto(expandido ? null : l.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--notion-bg-2)]">
                      <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: `${cor}22`, color: cor }}>
                        <Icone className="w-3.5 h-3.5" />
                      </span>

                      <span className="text-sm min-w-0 flex-1" style={{ color: 'var(--notion-text)' }}>
                        <b style={{ color: cor }}>{criou ? 'Adicionou' : 'Excluiu'}</b>
                        {' '}
                        <span style={{ color: 'var(--notion-text-3)' }}>{tipoLabel(l.table_name).toLowerCase()}</span>
                        {' '}
                        <span className="font-medium">{l.record_label || '(sem título)'}</span>
                        {l.context && l.context !== l.table_name && (
                          <span style={{ color: 'var(--notion-text-3)' }}> em {l.context}</span>
                        )}
                      </span>

                      <span className="inline-flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: 'var(--notion-text-2)' }}>
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold"
                          style={{ background: `${personColor(l.user_id)}33`, color: personColor(l.user_id), border: `1px solid ${personColor(l.user_id)}66` }}>
                          {initials(nome(l.user_id))}
                        </span>
                        <span className="hidden sm:inline">{nome(l.user_id)}</span>
                      </span>

                      <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--notion-text-3)' }}>
                        {new Date(l.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {dados && (
                        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
                          style={{ color: 'var(--notion-text-3)', transform: expandido ? 'rotate(180deg)' : 'none' }} />
                      )}
                    </button>

                    {expandido && dados && (
                      <div className="px-4 pb-3 pt-1">
                        <p className="text-[11px] mb-1.5" style={{ color: 'var(--notion-text-3)' }}>
                          Conteúdo do registro {criou ? 'criado' : 'excluído'} — serve para conferência e recuperação manual.
                        </p>
                        <Detalhes dados={dados} colNames={colNames} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {!fim && (
          <div className="flex justify-center py-4">
            <button onClick={carregarMais} disabled={carregando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--notion-bg-3)] disabled:opacity-50"
              style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)', color: 'var(--notion-text-2)' }}>
              {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Carregar mais
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** mostra os campos do registro; nas tabelas dinâmicas troca o id da coluna pelo nome */
function Detalhes({ dados, colNames }: { dados: Record<string, unknown>; colNames: Record<string, string> }) {
  const bruto = (dados.data && typeof dados.data === 'object' ? dados.data : dados) as Record<string, unknown>
  const IGNORAR = new Set(['id', 'table_id', 'workspace_id', 'position', 'created_at', 'updated_at', 'created_by', 'updated_by'])

  const campos = Object.entries(bruto)
    .filter(([k, v]) => !IGNORAR.has(k) && v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [colNames[k] || k, Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)] as const)

  if (!campos.length) return <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Registro sem conteúdo.</p>

  return (
    <div className="rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5"
      style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
      {campos.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-xs min-w-0">
          <span className="flex-shrink-0" style={{ color: 'var(--notion-text-3)' }}>{k}:</span>
          <span className="truncate" style={{ color: 'var(--notion-text)' }} title={v}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function Card({ label, valor, cor, icon: Icon }: { label: string; valor: number; cor: string; icon?: typeof Plus }) {
  return (
    <div className="rounded-xl px-4 py-3 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
      <p className="text-xs mb-1 flex items-center gap-1.5" style={{ color: 'var(--notion-text-3)' }}>
        {Icon && <Icon className="w-3 h-3" style={{ color: cor }} />}{label}
      </p>
      <p className="text-2xl font-semibold" style={{ color: cor }}>{valor}</p>
    </div>
  )
}

function Chips({ valor, setValor, opcoes }: { valor: string; setValor: (v: string) => void; opcoes: { v: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
      {opcoes.map(o => (
        <button key={o.v} onClick={() => setValor(o.v)}
          className="px-2.5 py-1 rounded-md text-xs transition-colors"
          style={{
            background: valor === o.v ? 'var(--notion-bg-4)' : 'transparent',
            color: valor === o.v ? 'var(--notion-text)' : 'var(--notion-text-3)',
          }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
