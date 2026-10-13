'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/db-rows'
import { disparaPromocao, promoverLead } from '@/lib/promover-lead'
import { DBColumn, DBRow, DataSource, SelectOption } from '@/types/dynamic'
import { FichaRegistro } from '@/components/dynamic/DynamicBoard'
import { useSomenteLeitura } from '@/components/layout/RoleProvider'
import { Aviso, useAviso } from '@/components/ui/Aviso'
import { DatePicker } from '@/components/ui/DatePicker'
import { AlertTriangle, RefreshCw, ListTodo, ArrowUpRight, X, CalendarClock, Plus, Search, UserPlus } from 'lucide-react'

/**
 * Painel de controle de leads (sub-aba Atendimentos da Geral).
 *
 * Nasceu do "Controle de Atendimentos" que o escritório montou à parte (um HTML
 * estático regerado a partir de uma planilha). Aqui não há tabela própria: tudo
 * é calculado AO VIVO da fonte Leads, a mesma dos quadros das outras sub-abas.
 * Cada número vem de uma coluna da fonte, achada pelo nome:
 *
 *   Data do atendimento → quando o atendimento foi marcado (sql/014)
 *   Atendimento         → compareceu? (Sim / Não; vazio = sem baixa)
 *   Situação            → "Contrato fechado" = fechou; "Não fechou" e
 *                         "Fechou mas desistiu" = não fechou
 *   Contrato Assinado   → marcado também conta como fechou
 *   Demanda             → área
 *   Valor do contrato   → honorário proposto; o fixo e o % saem do texto da
 *                         opção ("R$ 2.497,00 + 35%")
 *   Follow-up           → 1º a 10º contato (as bolinhas)
 *
 * Mexer aqui grava na linha do lead, igual a mexer no quadro.
 */

const COLS = {
  nome: 'Nome', telefone: 'Telefone', data: 'Data do atendimento', atendimento: 'Atendimento',
  situacao: 'Situação', demanda: 'Demanda', valor: 'Valor do contrato', followup: 'Follow-up',
  assinado: 'Contrato Assinado',
} as const

const nrm = (s: string) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtPct = (v: number) => `${Math.round(v * 10) / 10}%`.replace('.', ',')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** "R$ 2.497,00 + 35%" → { fixo: 2497, pct: 35 }; texto fora do padrão → null */
export function lerValorContrato(label: string): { fixo: number | null; pct: number | null } | null {
  const fixoM = label.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i)
  const pctM = label.match(/(\d+(?:[.,]\d+)?)\s*%/)
  if (!fixoM && !pctM) return null
  const fixo = fixoM ? Number(fixoM[1].replace(/\./g, '').replace(',', '.')) : null
  const p = pctM ? Number(pctM[1].replace(',', '.')) : null
  return { fixo: fixo != null && !isNaN(fixo) ? fixo : null, pct: p != null && !isNaN(p) ? p : null }
}

/** valor de data do lead ("AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM", hora local) */
function lerData(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v.length === 10 ? `${v}T00:00` : v)
  return isNaN(d.getTime()) ? null : d
}

const caixa: React.CSSProperties = { background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }

function Tag({ texto, cor }: { texto: string; cor: string }) {
  return <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap" style={{ background: `${cor}22`, color: cor }}>{texto}</span>
}

function Tabela({ titulos, children }: { titulos: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={caixa}>
      <table className="w-full text-sm">
        <thead><tr className="border-b" style={{ borderColor: 'var(--notion-border)' }}>
          {titulos.map(t => <th key={t} className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{t}</th>)}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

type Detalhe = 'marcados' | 'vieram' | 'fecharam' | null
interface Member { id: string; full_name: string }

export function Atendimentos({ tableId, initialColumns, initialRows, sources, members, userId, workspaceId, lists, ativo }: {
  tableId: string; initialColumns: DBColumn[]; initialRows: DBRow[]; sources: DataSource[]
  members: Member[]; userId: string; workspaceId: string
  lists: { id: string; title: string; position: number }[]
  /** sub-aba visível agora: ao voltar para ela, relê os leads do banco */
  ativo: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const somenteLeitura = useSomenteLeitura()
  const { msg, mostrar } = useAviso()
  const [columns, setColumns] = useState(initialColumns)
  const [rows, setRows] = useState(initialRows)
  useEffect(() => { setColumns(initialColumns) }, [initialColumns])
  useEffect(() => { setRows(initialRows) }, [initialRows])
  const [area, setArea] = useState<string>('todas')
  const [mes, setMes] = useState<string>('geral')
  const [detalhe, setDetalhe] = useState<Detalhe>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [tarefaPara, setTarefaPara] = useState<DBRow | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date())

  // ---------- leitura ao vivo ----------
  async function recarregar() {
    setAtualizando(true)
    try {
      const rs = await fetchAllRows<DBRow>((de, ate) =>
        supabase.from('db_rows').select('*').eq('table_id', tableId).order('position').order('id').range(de, ate))
      setRows(rs); setAtualizadoEm(new Date())
    } catch (e) {
      mostrar({ texto: `Não consegui atualizar: ${(e as Error).message}`, tipo: 'erro' })
    } finally { setAtualizando(false) }
  }
  // voltou para a sub-aba: os quadros ao lado podem ter mudado algum lead
  const jaAtivo = useRef(ativo)
  useEffect(() => {
    if (ativo && !jaAtivo.current) void recarregar()
    jaAtivo.current = ativo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo])

  // o que foi gravado aqui precisa aparecer nos quadros das outras sub-abas
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sincronizarPagina = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 800)
  }

  // ---------- colunas da fonte ----------
  const col = useMemo(() => {
    const achar = (nome: string) => columns.find(c => nrm(c.name) === nrm(nome))
    return Object.fromEntries(Object.entries(COLS).map(([k, nome]) => [k, achar(nome)])) as Record<keyof typeof COLS, DBColumn | undefined>
  }, [columns])
  const faltando = (['data', 'atendimento', 'situacao', 'demanda'] as const).filter(k => !col[k]).map(k => COLS[k])

  const opcao = (c: DBColumn | undefined, v: unknown): SelectOption | undefined =>
    c ? (c.config.options || []).find(o => o.id === v || o.label === v) : undefined
  const rotulo = (c: DBColumn | undefined, v: unknown) => opcao(c, v)?.label || ''
  const opcaoPorRotulo = (c: DBColumn | undefined, label: string) =>
    c ? (c.config.options || []).find(o => nrm(o.label) === nrm(label)) : undefined

  // ---------- leitura de um lead ----------
  const agora = new Date()
  const L = (r: DBRow) => {
    const data = col.data ? lerData(r.data[col.data.id]) : null
    const atend = nrm(rotulo(col.atendimento, r.data[col.atendimento?.id || '']))
    const situ = nrm(rotulo(col.situacao, r.data[col.situacao?.id || '']))
    const assinado = col.assinado ? r.data[col.assinado.id] === true : false
    const valorLabel = rotulo(col.valor, r.data[col.valor?.id || ''])
    const fu = col.followup ? (col.followup.config.options || []).findIndex(o => o.id === r.data[col.followup!.id] || o.label === r.data[col.followup!.id]) : -1
    return {
      r, data,
      nome: String(r.data[col.nome?.id || ''] || '(sem nome)'),
      telefone: String(r.data[col.telefone?.id || ''] || ''),
      area: rotulo(col.demanda, r.data[col.demanda?.id || '']) || 'Não classificado',
      veio: atend === 'sim', naoVeio: atend === 'nao',
      fechou: situ === 'contrato fechado' || assinado,
      naoFechou: situ === 'nao fechou' || situ === 'fechou mas desistiu',
      situacao: rotulo(col.situacao, r.data[col.situacao?.id || '']),
      valorLabel, valor: valorLabel ? lerValorContrato(valorLabel) : null,
      followup: fu, // -1 = nenhum contato; 0 = 1º contato...
      passou: !!data && data < agora,
    }
  }
  type Lead = ReturnType<typeof L>

  const marcadosTodos = useMemo(() => rows.map(L).filter(l => l.data).sort((a, b) => a.data!.getTime() - b.data!.getTime()),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, col])
  const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const meses = useMemo(() => [...new Set(marcadosTodos.map(l => chaveMes(l.data!)))].sort(), [marcadosTodos])
  const areas = useMemo(() => [...new Set(marcadosTodos.map(l => l.area))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [marcadosTodos])
  const lista = marcadosTodos.filter(l => (area === 'todas' || l.area === area) && (mes === 'geral' || chaveMes(l.data!) === mes))

  // ---------- funil ----------
  const vieram = lista.filter(l => l.veio)
  const naoVieram = lista.filter(l => l.naoVeio)
  // arquivado conta nos números (o contrato fechado e arquivado continua sendo
  // contrato), mas sai das listas de ação: ninguém dá baixa nem retoma arquivado
  const semBaixa = lista.filter(l => !l.veio && !l.naoVeio && l.passou && !l.r.arquivado_em)
  const futuros = lista.filter(l => !l.veio && !l.naoVeio && !l.passou)
  const baseComparecimento = vieram.length + naoVieram.length + semBaixa.length
  const fecharam = vieram.filter(l => l.fechou)
  const naoFecharam = vieram.filter(l => !l.fechou && l.naoFechou)
  const aguardando = vieram.filter(l => !l.fechou && !l.naoFechou)

  // ---------- ticket ----------
  const comValor = vieram.filter(l => l.valor)
  const fixos = comValor.map(l => l.valor!.fixo).filter((v): v is number => v != null)
  const pcts = comValor.map(l => l.valor!.pct).filter((v): v is number => v != null)
  const valorIlegivel = vieram.filter(l => l.valorLabel && !l.valor)
  const media = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

  const porArea = useMemo(() => {
    const m = new Map<string, { qtd: number; soma: number; pcts: number[] }>()
    for (const l of fecharam) {
      const g = m.get(l.area) || { qtd: 0, soma: 0, pcts: [] }
      g.qtd++; g.soma += l.valor?.fixo || 0; if (l.valor?.pct != null) g.pcts.push(l.valor.pct)
      m.set(l.area, g)
    }
    return [...m.entries()].sort((a, b) => b[1].soma - a[1].soma)
  }, [fecharam])

  // não veio, ou veio e ainda não fechou
  const followup = lista.filter(l => (l.naoVeio || (l.veio && !l.fechou)) && !l.r.arquivado_em)

  // ---------- gravação ----------
  /**
   * Grava um campo do lead. Relê a linha antes de mesclar: o lead pode ter sido
   * editado no quadro ao lado (ou por outra pessoa) desde que esta tela leu.
   */
  async function salvarCampos(rowId: string, patch: Record<string, unknown>): Promise<boolean> {
    if (somenteLeitura) return false
    const { data: atual, error: e1 } = await supabase.from('db_rows').select('data').eq('id', rowId).single()
    if (e1 || !atual) { mostrar({ texto: `Não consegui gravar: ${e1?.message || 'lead não encontrado'}`, tipo: 'erro' }); return false }
    const data = { ...(atual.data as Record<string, unknown>), ...patch }
    const quando = new Date().toISOString()
    const { error } = await supabase.from('db_rows').update({ data, updated_by: userId, updated_at: quando }).eq('id', rowId)
    if (error) { mostrar({ texto: `Não consegui gravar: ${error.message}`, tipo: 'erro' }); return false }
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, data, updated_at: quando, updated_by: userId } : r))
    // marcar "Contrato Assinado" aqui tem o mesmo efeito que no quadro: vira cliente
    for (const [colId, value] of Object.entries(patch)) {
      if (disparaPromocao(columns.find(c => c.id === colId), value)) {
        const res = await promoverLead(rowId)
        if (res) mostrar(res)
      }
    }
    sincronizarPagina()
    return true
  }
  const salvar = (rowId: string, colId: string, value: unknown) => salvarCampos(rowId, { [colId]: value })
  /** lead criado pelo "Adicionar atendimento" quando ainda não existia na fonte */
  async function criarLead(data: Record<string, unknown>): Promise<DBRow | null> {
    const minPos = rows.reduce((m, r) => Math.min(m, r.position), 0)
    const { data: novo, error } = await supabase.from('db_rows')
      .insert({ table_id: tableId, data, position: minPos - 1, created_by: userId, updated_by: userId })
      .select('*').single()
    if (error || !novo) { mostrar({ texto: `Não consegui cadastrar o lead: ${error?.message || 'erro'}`, tipo: 'erro' }); return null }
    setRows(rs => [novo as DBRow, ...rs])
    sincronizarPagina()
    return novo as DBRow
  }
  const [adicionando, setAdicionando] = useState(false)
  async function salvarOpcoes(colId: string, options: SelectOption[]) {
    const c = columns.find(x => x.id === colId); if (!c) return
    const config = { ...c.config, options }
    setColumns(cs => cs.map(x => x.id === colId ? { ...x, config } : x))
    await supabase.from('db_columns').update({ config }).eq('id', colId)
    sincronizarPagina()
  }
  async function arquivar(rowId: string, arq: boolean) {
    const arquivado_em = arq ? new Date().toISOString() : null
    const { error } = await supabase.from('db_rows').update({ arquivado_em }).eq('id', rowId)
    if (error) { mostrar({ texto: `Não consegui ${arq ? 'arquivar' : 'restaurar'}: ${error.message}`, tipo: 'erro' }); return }
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, arquivado_em } : r))
    sincronizarPagina()
  }
  const marcarAtendimento = (l: Lead, label: 'Sim' | 'Não') => {
    const o = opcaoPorRotulo(col.atendimento, label)
    if (col.atendimento && o) void salvar(l.r.id, col.atendimento.id, o.id)
  }
  /** bolinha i (0 = 1º contato): marca até ela; clicar na última marcada desmarca uma */
  const marcarFollowup = (l: Lead, i: number) => {
    const c = col.followup; if (!c) return
    const opts = c.config.options || []
    const alvo = i === l.followup ? i - 1 : i
    void salvar(l.r.id, c.id, alvo >= 0 ? opts[alvo]?.id ?? null : null)
  }

  const linhaAberta = rows.find(r => r.id === aberto) || null

  // ---------- render ----------
  if (faltando.length) {
    return (
      <div className="rounded-xl p-6 border text-sm" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)', color: 'var(--notion-text-2)' }}>
        O painel lê a fonte <b>Leads</b> e não achou a(s) coluna(s): <b>{faltando.join(', ')}</b>. Se foram renomeadas, volte o nome original.
      </div>
    )
  }

  const chip = (on: boolean): React.CSSProperties => ({
    background: on ? 'var(--notion-accent)' : 'var(--notion-bg-2)', color: on ? '#fff' : 'var(--notion-text-2)',
    border: `1px solid ${on ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
  })
  const fmtData = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  const filtroTexto = `${area === 'todas' ? 'Todas as áreas' : area} · ${mes === 'geral' ? 'todos os meses' : (() => { const [a, m] = mes.split('-'); return `${MESES[Number(m) - 1]}/${a}` })()}`

  const tagLead = (l: Lead) => l.fechou ? <Tag texto="Fechou" cor="#10B981" />
    : l.naoVeio ? <Tag texto="Não compareceu" cor="#EF4444" />
    : l.veio && l.naoFechou ? <Tag texto={l.situacao || 'Não fechou'} cor="#EF4444" />
    : l.veio ? <Tag texto="Aguardando decisão" cor="#F59E0B" />
    : l.passou ? <Tag texto="Sem baixa" cor="#F59E0B" />
    : <Tag texto="Agendado" cor="#3B82F6" />

  const linhaLead = (l: Lead, acoes?: React.ReactNode) => (
    <tr key={l.r.id} className="border-b transition-colors hover:bg-[var(--notion-bg-3)]" style={{ borderColor: 'var(--notion-border)' }}>
      <td className="px-3 py-2">
        <button onClick={() => setAberto(l.r.id)} className="text-sm font-medium hover:underline text-left" style={{ color: 'var(--notion-text)' }}>{l.nome}</button>
        {l.telefone && <span className="block text-[11px]" style={{ color: 'var(--notion-text-3)' }}>{l.telefone}</span>}
      </td>
      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>{fmtData(l.data!)}</td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--notion-text-2)' }}>{l.area}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: l.valorLabel ? '#FBBF24' : 'var(--notion-text-3)' }}>{l.valorLabel || '—'}</td>
      <td className="px-3 py-2">{tagLead(l)}</td>
      {acoes !== undefined && <td className="px-3 py-2">{acoes}</td>}
    </tr>
  )
  const cards: { key: Exclude<Detalhe, null>; titulo: string; valor: number; selo: string; sub: string; cor: string }[] = [
    { key: 'marcados', titulo: 'Marcados', valor: lista.length, selo: 'Total', sub: `${futuros.length} ainda por vir`, cor: '#818CF8' },
    { key: 'vieram', titulo: 'Compareceram', valor: vieram.length, selo: `${pct(vieram.length, baseComparecimento)}%`, sub: `de ${baseComparecimento} que já deviam ter vindo`, cor: '#10B981' },
    { key: 'fecharam', titulo: 'Fecharam', valor: fecharam.length, selo: `${pct(fecharam.length, vieram.length)}%`, sub: `de ${vieram.length} que vieram`, cor: '#FBBF24' },
  ]
  const grupos: Record<Exclude<Detalhe, null>, { titulo: string; itens: Lead[] }[]> = {
    marcados: [{ titulo: 'Já passaram', itens: lista.filter(l => l.passou) }, { titulo: 'Por vir', itens: futuros }],
    vieram: [{ titulo: '✓ Compareceram', itens: vieram }, { titulo: '✕ Não compareceram', itens: naoVieram }, { titulo: '⏳ Sem baixa (já passou)', itens: semBaixa }, { titulo: 'Por vir', itens: futuros }],
    fecharam: [{ titulo: '✓ Fecharam', itens: fecharam }, { titulo: '✕ Não fecharam', itens: naoFecharam }, { titulo: '⏳ Aguardando decisão', itens: aguardando }],
  }

  return (
    <div className="space-y-6">
      <Aviso msg={msg} onClose={() => mostrar(null)} />

      {/* filtros */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {['todas', ...areas].map(a => (
            <button key={a} onClick={() => setArea(a)} className="px-3 py-1 rounded-full text-xs font-medium transition-colors" style={chip(area === a)}>
              {a === 'todas' ? 'Todas as áreas' : a}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {['geral', ...meses].map(m => (
            <button key={m} onClick={() => setMes(m)} className="px-3 py-1 rounded-full text-xs font-medium transition-colors" style={chip(mes === m)}>
              {m === 'geral' ? 'Geral (todos os meses)' : (() => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1]}/${a}` })()}
            </button>
          ))}
          <div className="flex-1" />
          {/* hora do relógio: servidor e navegador podem discordar no minuto */}
          <span suppressHydrationWarning className="text-[11px]" style={{ color: 'var(--notion-text-3)' }}>ao vivo · lido às {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={() => void recarregar()} disabled={atualizando} title="Reler os leads agora"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs hover:bg-[var(--notion-bg-3)] disabled:opacity-50" style={{ color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {!somenteLeitura && (
            <button onClick={() => setAdicionando(true)} title="Marcar um atendimento para um lead"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-opacity hover:opacity-90" style={{ background: 'var(--notion-accent)', color: '#fff' }}>
              <Plus className="w-3.5 h-3.5" /> Adicionar atendimento
            </button>
          )}
        </div>
      </div>

      {marcadosTodos.length === 0 ? (
        <div className="rounded-xl p-8 border text-center" style={caixa}>
          <CalendarClock className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--notion-text-3)' }} />
          <p className="text-sm" style={{ color: 'var(--notion-text)' }}>Nenhum lead com <b>Data do atendimento</b> ainda.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--notion-text-3)' }}>Preencha esse campo na ficha do lead quando o atendimento for marcado — o painel conta a partir dele.</p>
        </div>
      ) : (
        <>
          {/* sem baixa: o que mais distorce o funil */}
          {semBaixa.length > 0 && (
            <section className="rounded-xl border p-4" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.35)' }}>
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color: '#FBBF24' }}>
                <AlertTriangle className="w-4 h-4" /> {semBaixa.length} atendimento(s) já passaram e estão sem baixa
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--notion-text-2)' }}>Enquanto o campo Atendimento estiver vazio, o comparecimento fica subestimado. Dê baixa aqui mesmo:</p>
              <Tabela titulos={['Cliente', 'Data', 'Área', 'Valor', 'Status', 'Compareceu?']}>
                {semBaixa.map(l => linhaLead(l, somenteLeitura ? null : (
                  <span className="flex gap-1">
                    <button onClick={() => marcarAtendimento(l, 'Sim')} className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}>Veio</button>
                    <button onClick={() => marcarAtendimento(l, 'Não')} className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>Não veio</button>
                  </span>
                )))}
              </Tabela>
            </section>
          )}

          {/* funil */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--notion-text-3)' }}>
              Funil de atendimentos <span className="normal-case font-normal">— {filtroTexto} · clique para ver os clientes</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cards.map(c => (
                <button key={c.key} onClick={() => setDetalhe(d => d === c.key ? null : c.key)}
                  className="text-left rounded-xl p-4 border transition-all hover:border-[var(--notion-accent)]"
                  style={{ ...caixa, borderColor: detalhe === c.key ? 'var(--notion-accent)' : 'var(--notion-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--notion-text-2)' }}>{c.titulo}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: `${c.cor}22`, color: c.cor }}>{c.selo}</span>
                  </div>
                  <div className="text-3xl font-bold" style={{ color: 'var(--notion-text)' }}>{c.valor}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--notion-text-3)' }}>{c.sub}</div>
                </button>
              ))}
            </div>
            {detalhe && (
              <div className="mt-3 space-y-3">
                {grupos[detalhe].filter(g => g.itens.length).map(g => (
                  <div key={g.titulo}>
                    <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--notion-text-2)' }}>{g.titulo} · {g.itens.length}</p>
                    <Tabela titulos={['Cliente', 'Data', 'Área', 'Valor', 'Status']}>
                      {g.itens.map(l => linhaLead(l))}
                    </Tabela>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ticket cobrado */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--notion-text-3)' }}>
              Ticket cobrado <span className="normal-case font-normal">— quem compareceu · {filtroTexto}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              {[
                { t: 'Com valor informado', v: String(comValor.length), s: `de ${vieram.length} atendimento(s) realizado(s)` },
                { t: 'Valor médio cobrado', v: fixos.length ? fmtBRL(media(fixos)) : '—', s: 'honorário fixo' },
                { t: '% médio cobrado', v: pcts.length ? fmtPct(media(pcts)) : '—', s: 'honorário de êxito' },
              ].map(k => (
                <div key={k.t} className="rounded-xl p-4 border" style={caixa}>
                  <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--notion-text-2)' }}>{k.t}</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--notion-text)' }}>{k.v}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--notion-text-3)' }}>{k.s}</div>
                </div>
              ))}
            </div>
            {valorIlegivel.length > 0 && (
              <p className="text-xs mb-2" style={{ color: '#FBBF24' }}>
                {valorIlegivel.length} lead(s) com &quot;Valor do contrato&quot; fora do padrão &quot;R$ … + …%&quot; ficaram fora da média: {valorIlegivel.map(l => l.valorLabel).join(', ')}
              </p>
            )}
            {comValor.length > 0 && (
              <Tabela titulos={['Cliente', 'Data', 'Área', 'Valor', 'Status']}>
                {comValor.map(l => linhaLead(l))}
              </Tabela>
            )}
          </section>

          {/* valores fechados por área */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--notion-text-3)' }}>
              Valores fechados por área <span className="normal-case font-normal">— {fecharam.length} contrato(s) · {filtroTexto}</span>
            </h3>
            {porArea.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Nenhum contrato fechado neste filtro.</p>
            ) : (
              <Tabela titulos={['Área', 'Qtd.', 'Valor fechado (fixo)', '% médio']}>
                {porArea.map(([a, g]) => (
                  <tr key={a} className="border-b" style={{ borderColor: 'var(--notion-border)' }}>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{a}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--notion-text-2)' }}>{g.qtd}</td>
                    <td className="px-3 py-2 text-xs font-medium" style={{ color: '#FBBF24' }}>{fmtBRL(g.soma)}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: '#34D399' }}>{g.pcts.length ? fmtPct(media(g.pcts)) : '—'}</td>
                  </tr>
                ))}
              </Tabela>
            )}
          </section>

          {/* follow-up */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--notion-text-3)' }}>
              Follow-up <span className="normal-case font-normal">— não veio, ou veio e ainda não fechou · {followup.length}</span>
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--notion-text-3)' }}>
              As bolinhas são o campo <b>Follow-up</b> do lead (1º a 10º contato) — gravam na hora e aparecem nos quadros.
            </p>
            {followup.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Ninguém para retomar neste filtro.</p>
            ) : (
              <Tabela titulos={['Cliente', 'Data', 'Área', 'Valor', 'Status', 'Contatos feitos']}>
                {followup.map(l => {
                  const total = col.followup?.config.options?.length || 10
                  return linhaLead(l, (
                      <span className="flex items-center gap-2">
                        <span className="flex gap-1" title={l.followup >= 0 ? `${l.followup + 1}º contato feito` : 'Nenhum contato registrado'}>
                          {Array.from({ length: total }, (_, i) => (
                            <button key={i} disabled={somenteLeitura || !col.followup} onClick={() => marcarFollowup(l, i)}
                              className="w-4 h-4 rounded-full text-[8px] font-semibold flex items-center justify-center transition-colors disabled:cursor-default"
                              style={{
                                background: i <= l.followup ? 'var(--notion-accent)' : 'transparent',
                                color: i <= l.followup ? '#fff' : 'var(--notion-text-3)',
                                border: `1px solid ${i <= l.followup ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
                              }}>{i + 1}</button>
                          ))}
                        </span>
                        {!somenteLeitura && (
                          <button onClick={() => setTarefaPara(l.r)} title="Criar tarefa no Quadro de Tarefas vinculada a este lead"
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] hover:bg-[var(--notion-bg-4)] whitespace-nowrap" style={{ color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
                            <ListTodo className="w-3 h-3" /> Tarefa
                          </button>
                        )}
                      </span>
                  ))
                })}
              </Tabela>
            )}
          </section>
        </>
      )}

      {/* ficha do lead: a mesma dos quadros (campos, tarefas vinculadas e comentários) */}
      {linhaAberta && (
        <FichaRegistro row={linhaAberta} columns={[...columns].sort((a, b) => a.position - b.position)} members={members} sources={sources} userId={userId}
          onClose={() => setAberto(null)} updateCell={(id, c, v) => void salvar(id, c, v)} updateColumnOptions={salvarOpcoes}
          onArquivar={arquivar}
          onDeleted={() => { setRows(rs => rs.filter(r => r.id !== linhaAberta.id)); setAberto(null) }} />
      )}

      {adicionando && col.data && (
        <AdicionarAtendimento rows={rows} col={col} rotulo={rotulo}
          onClose={() => setAdicionando(false)}
          onCriarLead={criarLead}
          onSalvar={async (row, patch, msgOk) => {
            const ok = await salvarCampos(row.id, patch)
            if (ok) { setAdicionando(false); mostrar({ texto: msgOk, tipo: 'ok' }) }
          }} />
      )}

      {tarefaPara && (
        <NovaTarefa lead={tarefaPara} nome={String(tarefaPara.data[col.nome?.id || ''] || 'Lead')} lists={lists} members={members}
          userId={userId} workspaceId={workspaceId}
          onClose={() => setTarefaPara(null)}
          onCriada={() => { setTarefaPara(null); mostrar({ texto: 'Tarefa criada no Quadro de Tarefas (aba Tabelas) e vinculada ao lead.', tipo: 'ok' }); sincronizarPagina() }}
          onErro={t => mostrar({ texto: t, tipo: 'erro' })} />
      )}
    </div>
  )
}

/**
 * Cria um cartão no Quadro de Tarefas já vinculado ao lead — o mesmo vínculo que
 * o botão "Cliente" do cartão grava (board_activity kind 'contact'), então a
 * tarefa aparece na ficha do lead e o cartão abre a ficha de volta.
 */
function NovaTarefa({ lead, nome, lists, members, userId, workspaceId, onClose, onCriada, onErro }: {
  lead: DBRow; nome: string; lists: { id: string; title: string; position: number }[]; members: Member[]
  userId: string; workspaceId: string; onClose: () => void; onCriada: () => void; onErro: (t: string) => void
}) {
  const supabase = createClient()
  const ordenadas = [...lists].sort((a, b) => a.position - b.position)
  const [titulo, setTitulo] = useState(`Follow-up: ${nome}`)
  const [listId, setListId] = useState(ordenadas[0]?.id || '')
  const [prazo, setPrazo] = useState('')
  const [resp, setResp] = useState(userId)
  const [salvando, setSalvando] = useState(false)
  const inp: React.CSSProperties = { background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || !listId) return
    setSalvando(true)
    const { count } = await supabase.from('board_cards').select('id', { count: 'exact', head: true }).eq('list_id', listId)
    const { data: card, error } = await supabase.from('board_cards').insert({
      workspace_id: workspaceId, list_id: listId, title: titulo.trim(), position: count || 0, created_by: userId,
      due_date: prazo ? new Date(`${prazo}T12:00:00`).toISOString() : null,
    }).select('id').single()
    if (error || !card) { setSalvando(false); onErro(`Não consegui criar a tarefa: ${error?.message || 'erro'}`); return }
    const extras = [
      supabase.from('board_activity').insert({ card_id: card.id, user_id: userId, kind: 'contact', text: JSON.stringify({ contactId: lead.id, name: nome }) }),
      ...(resp ? [supabase.from('board_card_members').insert({ card_id: card.id, profile_id: resp })] : []),
    ]
    const res = await Promise.all(extras)
    setSalvando(false)
    const falha = res.find(r => r.error)
    if (falha?.error) { onErro(`A tarefa foi criada, mas não consegui completar o vínculo: ${falha.error.message}`); return }
    onCriada()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={criar} className="w-full max-w-md rounded-xl p-5 space-y-3 shadow-2xl animate-fade-in" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--notion-text)' }}><ListTodo className="w-4 h-4" /> Nova tarefa para {nome}</h3>
          <button type="button" onClick={onClose} style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
        </div>
        <label className="block text-xs" style={{ color: 'var(--notion-text-2)' }}>Título
          <input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm" style={inp} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs" style={{ color: 'var(--notion-text-2)' }}>Lista
            <select value={listId} onChange={e => setListId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm" style={inp}>
              {ordenadas.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </label>
          <label className="block text-xs" style={{ color: 'var(--notion-text-2)' }}>Responsável
            <select value={resp} onChange={e => setResp(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm" style={inp}>
              <option value="">— ninguém —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </label>
        </div>
        <div className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Prazo
          <div className="mt-1"><DatePicker value={prazo} onChange={setPrazo} /></div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Cancelar</button>
          <button type="submit" disabled={salvando || !titulo.trim() || !listId} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: 'var(--notion-accent)', color: '#fff' }}>
            {salvando ? 'Criando…' : <>Criar tarefa <ArrowUpRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * "Adicionar atendimento": acha o lead na fonte Leads (nome ou telefone) e
 * grava a Data do atendimento nele — é isso que o coloca no painel. Se o lead
 * ainda não existe, cadastra ali mesmo (nome + telefone + data).
 *
 * Telefone se compara só pelos dígitos: "31 9 9531-6990", "(31) 99531-6990" e
 * "995316990" acham o mesmo lead.
 */
function AdicionarAtendimento({ rows, col, rotulo, onClose, onSalvar, onCriarLead }: {
  rows: DBRow[]
  col: Record<keyof typeof COLS, DBColumn | undefined>
  rotulo: (c: DBColumn | undefined, v: unknown) => string
  onClose: () => void
  onSalvar: (row: DBRow, patch: Record<string, unknown>, msgOk: string) => Promise<void>
  onCriarLead: (data: Record<string, unknown>) => Promise<DBRow | null>
}) {
  const [q, setQ] = useState('')
  const [escolhido, setEscolhido] = useState<DBRow | null>(null)
  const [novo, setNovo] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [dia, setDia] = useState('')
  const [hora, setHora] = useState('09:00')
  const [salvando, setSalvando] = useState(false)
  const inp: React.CSSProperties = { background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }
  const digitos = (s: string) => (s || '').replace(/\D/g, '')

  const campo = (r: DBRow, c?: DBColumn) => (c ? r.data[c.id] : undefined)
  const nomeDe = (r: DBRow) => String(campo(r, col.nome) || '(sem nome)')
  const telDe = (r: DBRow) => String(campo(r, col.telefone) || '')

  const resultados = useMemo(() => {
    const termo = nrm(q)
    const dq = digitos(q)
    const temLetra = /[a-zà-ú]/i.test(q)
    if (termo.length < 2 && dq.length < 3) return []
    const achados = rows.filter(r => {
      const porNome = temLetra && nrm(nomeDe(r)).includes(termo)
      const porTel = dq.length >= 3 && digitos(telDe(r)).includes(dq)
      return porNome || porTel
    })
    // começa com o termo primeiro, depois quem mexeu por último
    const comeca = (r: DBRow) => (temLetra && nrm(nomeDe(r)).startsWith(termo)) || (dq.length >= 3 && digitos(telDe(r)).startsWith(dq)) ? 0 : 1
    return achados
      .sort((a, b) => comeca(a) - comeca(b) || (b.updated_at || '').localeCompare(a.updated_at || ''))
      .slice(0, 8)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, rows])

  const dataAtual = escolhido && col.data ? lerData(campo(escolhido, col.data)) : null
  const atendAtual = escolhido ? rotulo(col.atendimento, campo(escolhido, col.atendimento)) : ''
  const reagendaNaoVeio = nrm(atendAtual) === 'nao'
  const fmt = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const buscaCurta = nrm(q).length < 2 && digitos(q).length < 3

  function abrirNovo() {
    setNovo(true); setEscolhido(null)
    if (digitos(q).length >= 8 && !/[a-zà-ú]/i.test(q)) setTelefone(q.trim()); else setNome(q.trim())
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!col.data || !dia) return
    const quando = `${dia}T${hora || '09:00'}`
    setSalvando(true)
    if (novo) {
      // não duplicar: o mesmo telefone já pode estar na fonte com outro nome
      const dt = digitos(telefone)
      const jaExiste = dt.length >= 8 ? rows.find(r => digitos(telDe(r)).endsWith(dt.slice(-8))) : undefined
      if (jaExiste) { setSalvando(false); setNovo(false); setEscolhido(jaExiste); return }
      const data: Record<string, unknown> = { [col.data.id]: quando }
      if (col.nome) data[col.nome.id] = nome.trim()
      if (col.telefone && telefone.trim()) data[col.telefone.id] = telefone.trim()
      const criado = await onCriarLead(data)
      setSalvando(false)
      if (criado) onClose()
      return
    }
    if (!escolhido) { setSalvando(false); return }
    const patch: Record<string, unknown> = { [col.data.id]: quando }
    // faltou e foi reagendado: o "Não" era do atendimento anterior
    if (reagendaNaoVeio && col.atendimento) patch[col.atendimento.id] = null
    await onSalvar(escolhido, patch, `Atendimento de ${nomeDe(escolhido)} marcado para ${fmt(new Date(quando))}.`)
    setSalvando(false)
  }

  const podeSalvar = !!dia && (novo ? !!nome.trim() : !!escolhido)
  const areaDe = (r: DBRow) => rotulo(col.demanda, campo(r, col.demanda))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={salvar} className="w-full max-w-lg rounded-xl p-5 space-y-4 shadow-2xl animate-fade-in" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
            <CalendarClock className="w-4 h-4" /> Adicionar atendimento
          </h3>
          <button type="button" onClick={onClose} style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
        </div>

        {!novo && !escolhido && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={inp}>
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar lead por nome ou telefone…"
                className="flex-1 bg-transparent text-sm outline-none" style={{ color: 'var(--notion-text)' }} />
            </div>
            <div className="mt-2 space-y-1 max-h-80 overflow-y-auto">
              {resultados.map(r => {
                const d = col.data ? lerData(campo(r, col.data)) : null
                const area = areaDe(r)
                return (
                  <button type="button" key={r.id} onClick={() => setEscolhido(r)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-[var(--notion-bg-3)]"
                    style={{ border: '1px solid var(--notion-border)' }}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{nomeDe(r)}</span>
                      <span className="block text-[11px]" style={{ color: 'var(--notion-text-3)' }}>
                        {telDe(r) || 'sem telefone'}{area ? ` · ${area}` : ''}{r.arquivado_em ? ' · arquivado' : ''}
                      </span>
                    </span>
                    {d && <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}>marcado {fmt(d)}</span>}
                  </button>
                )
              })}
              {!buscaCurta && resultados.length === 0 && (
                <p className="text-xs px-1 py-2" style={{ color: 'var(--notion-text-3)' }}>Nenhum lead encontrado com &quot;{q}&quot;.</p>
              )}
              {buscaCurta && (
                <p className="text-xs px-1 py-2" style={{ color: 'var(--notion-text-3)' }}>Digite ao menos 2 letras do nome ou 3 números do telefone.</p>
              )}
            </div>
            <button type="button" onClick={abrirNovo} className="mt-2 flex items-center gap-1.5 text-xs hover:underline" style={{ color: 'var(--notion-accent)' }}>
              <UserPlus className="w-3.5 h-3.5" /> Não achou? Cadastrar lead novo
            </button>
          </div>
        )}

        {escolhido && (
          <div className="rounded-lg p-3" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{nomeDe(escolhido)}</p>
                <p className="text-[11px]" style={{ color: 'var(--notion-text-3)' }}>
                  {telDe(escolhido) || 'sem telefone'}{areaDe(escolhido) ? ` · ${areaDe(escolhido)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setEscolhido(null)} className="text-[11px] hover:underline whitespace-nowrap" style={{ color: 'var(--notion-accent)' }}>trocar lead</button>
            </div>
            {dataAtual && (
              <p className="text-[11px] mt-2" style={{ color: '#FBBF24' }}>
                Já tinha atendimento marcado em {fmt(dataAtual)}{atendAtual ? ` (Atendimento: ${atendAtual})` : ''}. A data nova substitui a anterior.
                {reagendaNaoVeio && ' Como ele não tinha vindo, o campo Atendimento volta para vazio.'}
              </p>
            )}
          </div>
        )}

        {novo && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Novo lead na fonte <b>Leads</b>:</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs" style={{ color: 'var(--notion-text-2)' }}>Nome *
                <input autoFocus value={nome} onChange={e => setNome(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm" style={inp} />
              </label>
              <label className="block text-xs" style={{ color: 'var(--notion-text-2)' }}>Telefone
                <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="31 9 9999-9999" className="mt-1 w-full px-3 py-2 rounded-lg text-sm" style={inp} />
              </label>
            </div>
            <button type="button" onClick={() => setNovo(false)} className="text-[11px] hover:underline" style={{ color: 'var(--notion-accent)' }}>← voltar para a busca</button>
          </div>
        )}

        {(escolhido || novo) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="text-xs" style={{ color: 'var(--notion-text-2)' }}>Data do atendimento *
              <div className="mt-1"><DatePicker value={dia} onChange={setDia} /></div>
            </div>
            <label className="block text-xs" style={{ color: 'var(--notion-text-2)' }}>Hora
              <input type="time" value={hora} onChange={e => setHora(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm" style={inp} />
            </label>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>Cancelar</button>
          <button type="submit" disabled={!podeSalvar || salvando} className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--notion-accent)', color: '#fff' }}>
            {salvando ? 'Salvando…' : novo ? 'Cadastrar e marcar' : 'Marcar atendimento'}
          </button>
        </div>
      </form>
    </div>
  )
}
