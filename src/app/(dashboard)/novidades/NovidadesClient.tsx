'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Check, X, Loader2, Sparkles, AlertTriangle, CalendarClock, Clock,
  FileText, ChevronDown, ChevronUp, Filter, Send, Ban,
} from 'lucide-react'
import { Field, Input, Select } from '@/components/ui/primitives'
import { EditableHeader, type HeaderAssets } from '@/components/layout/EditableHeader'

export interface Classificacao {
  acao_necessaria: boolean
  tipo: string
  resumo: string
  evento_data: string | null
  evento_hora: string | null
  prazo_dias: number | null
  prazo_contagem: string | null
  relevante_para_cliente: boolean
  confianca: 'alta' | 'media' | 'baixa'
  trecho: string
  prazo?: { publicacao: string; inicio: string; fim: string; avisos: string[] } | null
}

export interface Comunicacao {
  id: string
  cnj: string
  texto: string
  data_publicacao: string | null
  tipo_comunicacao: string | null
  tipo_documento: string | null
  nome_classe: string | null
  orgao: string | null
  tribunal: string | null
  link: string | null
  advogados_intimados: { nome: string; oab: string; uf: string; profile_id: string | null }[]
  partes: { nome: string; polo: string }[]
  responsaveis: string[]
  status: string
  lida_em: string | null
  classificacao: Classificacao | null
  classificacao_erro: string | null
  cancelada: boolean
  detectado_em: string
  pendencia_row_id: string | null
  webhook_enviado_em: string | null
  aprovada_em?: string | null
}

interface Membro { id: string; full_name: string }

const TIPOS_LABEL: Record<string, string> = {
  audiencia: 'Audiência', pericia: 'Perícia', prazo: 'Prazo', sentenca: 'Sentença',
  acordao: 'Acórdão', alvara: 'Alvará', despacho: 'Despacho',
  arquivamento: 'Arquivamento', outro: 'Outro',
}
const TIPO_COR: Record<string, string> = {
  audiencia: '#F472B6', pericia: '#A78BFA', prazo: '#FBBF24', sentenca: '#34D399',
  acordao: '#34D399', alvara: '#60A5FA', despacho: '#94A3B8',
  arquivamento: '#94A3B8', outro: '#94A3B8',
}
const OPCOES_PENDENCIA = [
  '', 'Documentação', 'Requerimento Administrativo', 'Cobrar na Secretaria', 'Cumprimento de Sentença',
  'Manifestar no Processo', 'Alvará judicial', 'FGTS', 'Parcelamento', 'Conversar com cliente',
  'Guia de desarquivamento', 'Aguardando sentença/decisão',
]
const OPCOES_PRIORIDADE = ['Baixa', 'Média', 'Alta', 'Urgente']

const fmtCnj = (d: string) =>
  d?.length === 20 ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}` : d
const fmtData = (s?: string | null) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString('pt-BR') : '—')

export function NovidadesClient({ headerAssets, novas, tratadas, membros, userId, isAdmin }: {
  headerAssets: HeaderAssets
  novas: Comunicacao[]; tratadas: Comunicacao[]; membros: Membro[]; userId: string; isAdmin: boolean
}) {
  const router = useRouter()
  const [aba, setAba] = useState<'acao' | 'informativas' | 'tratadas'>('acao')
  const [soMinhas, setSoMinhas] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [classificando, setClassificando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const visiveis = useMemo(() => {
    const base = soMinhas ? novas.filter(c => c.responsaveis?.includes(userId)) : novas
    if (aba === 'tratadas') return tratadas
    // sem classificação a comunicação vai para "precisa de ação": melhor o
    // advogado olhar algo dispensável do que perder algo que importava
    if (aba === 'acao') return base.filter(c => !c.classificacao || c.classificacao.acao_necessaria)
    return base.filter(c => c.classificacao && !c.classificacao.acao_necessaria)
  }, [aba, soMinhas, novas, tratadas, userId])

  const naoClassificadas = novas.filter(c => !c.classificacao && !c.classificacao_erro).length
  const comErro = novas.filter(c => c.classificacao_erro).length

  async function classificarPendentes() {
    setClassificando(true); setMsg(null)
    const r = await fetch('/api/v1/novidades/classificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limite: 40 }),
    })
    const d = await r.json()
    setClassificando(false)
    if (!r.ok) { setMsg(d.error || 'Falha ao classificar'); return }
    setMsg(`${d.classificadas} classificadas${d.erros ? `, ${d.erros} com erro` : ''}${d.restantes ? ` — faltam ${d.restantes}` : ''}.`)
    router.refresh()
  }

  const Aba = ({ id, label, n }: { id: typeof aba; label: string; n: number }) => (
    <button onClick={() => setAba(id)}
      className="flex items-center gap-1.5 px-3 py-2 text-sm -mb-px border-b-2 transition-colors"
      style={{ color: aba === id ? 'var(--notion-text)' : 'var(--notion-text-3)', borderColor: aba === id ? 'var(--notion-accent)' : 'transparent' }}>
      {label}
      <span className="px-1.5 rounded-full text-[10px] font-semibold"
        style={{ background: aba === id ? 'var(--notion-accent)' : 'var(--notion-bg-4)', color: aba === id ? '#fff' : 'var(--notion-text-3)' }}>{n}</span>
    </button>
  )

  const contaAcao = (soMinhas ? novas.filter(c => c.responsaveis?.includes(userId)) : novas)
    .filter(c => !c.classificacao || c.classificacao.acao_necessaria).length
  const contaInfo = (soMinhas ? novas.filter(c => c.responsaveis?.includes(userId)) : novas)
    .filter(c => c.classificacao && !c.classificacao.acao_necessaria).length

  return (
    <div className="min-h-screen">
      <EditableHeader title="Novidades" icon={Bell} color="#FBBF24"
        gradient="linear-gradient(135deg, #422006 0%, #713f12 60%, #422006 100%)"
        pageKey="novidades" workspaceId={headerAssets.workspaceId}
        initialBanner={headerAssets.banner} initialLogo={headerAssets.logo} canEdit={headerAssets.canEdit} />

      <div className="px-16 py-6 max-w-5xl">
      {/* barra de controle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setSoMinhas(s => !s)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors"
          style={{
            background: soMinhas ? 'var(--notion-bg-4)' : 'var(--notion-bg-2)',
            color: soMinhas ? 'var(--notion-text)' : 'var(--notion-text-2)',
            border: `1px solid ${soMinhas ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
          }}>
          <Filter className="w-3 h-3" /> Só as minhas
        </button>

        {isAdmin && (naoClassificadas > 0 || comErro > 0) && (
          <button onClick={classificarPendentes} disabled={classificando}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs"
            style={{ background: 'var(--notion-accent)', color: '#fff', opacity: classificando ? 0.7 : 1 }}>
            {classificando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Classificar {naoClassificadas} pendente(s)
          </button>
        )}
        {comErro > 0 && (
          <span className="text-xs flex items-center gap-1" style={{ color: '#FBBF24' }}>
            <AlertTriangle className="w-3 h-3" /> {comErro} sem classificação (erro na IA) — aparecem cruas
          </span>
        )}
        {msg && <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>{msg}</span>}
      </div>

      {/* abas */}
      <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        <Aba id="acao" label="Precisa de ação" n={contaAcao} />
        <Aba id="informativas" label="Informativas" n={contaInfo} />
        <Aba id="tratadas" label="Tratadas" n={tratadas.length} />
      </div>

      {visiveis.length === 0 && (
        <div className="py-16 text-center">
          <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--notion-text-3)' }} />
          <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>
            {aba === 'tratadas' ? 'Nada tratado ainda.' : 'Nenhuma novidade por aqui.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {visiveis.map(c => (
          <Card key={c.id} c={c} membros={membros} userId={userId}
            aberta={aberta === c.id} onToggle={() => setAberta(a => (a === c.id ? null : c.id))}
            somenteLeitura={aba === 'tratadas'} />
        ))}
      </div>
      </div>
    </div>
  )
}

/* ---------------- Card de uma comunicação ---------------- */
function Card({ c, membros, userId, aberta, onToggle, somenteLeitura }: {
  c: Comunicacao; membros: Membro[]; userId: string; aberta: boolean; onToggle: () => void; somenteLeitura: boolean
}) {
  const router = useRouter()
  const cls = c.classificacao
  const cor = TIPO_COR[cls?.tipo || 'outro'] || '#94A3B8'

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{ background: 'var(--notion-bg-2)', borderColor: c.cancelada ? 'rgba(248,113,113,0.5)' : 'var(--notion-border)' }}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5 hover:bg-[var(--notion-bg-3)] transition-colors">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {cls ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: `${cor}22`, color: cor }}>{TIPOS_LABEL[cls.tipo] || cls.tipo}</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-3)' }}>não classificada</span>
              )}
              {c.cancelada && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1"
                  style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>
                  <Ban className="w-2.5 h-2.5" /> CANCELADA PELO TRIBUNAL
                </span>
              )}
              {cls?.confianca === 'baixa' && (
                <span className="text-[10px] flex items-center gap-1" style={{ color: '#FBBF24' }}>
                  <AlertTriangle className="w-2.5 h-2.5" /> leitura incerta
                </span>
              )}
              <span className="font-mono text-[11px]" style={{ color: 'var(--notion-text-3)' }}>{fmtCnj(c.cnj)}</span>
              {!c.lida_em && !somenteLeitura && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--notion-accent)' }} title="não lida" />
              )}
            </div>

            <p className="text-sm truncate" style={{ color: 'var(--notion-text)' }}>
              {cls?.resumo || c.texto.slice(0, 140)}
            </p>

            <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap" style={{ color: 'var(--notion-text-3)' }}>
              <span>{c.tribunal} · {c.orgao}</span>
              <span>publicado {fmtData(c.data_publicacao)}</span>
              {cls?.evento_data && (
                <span className="flex items-center gap-1" style={{ color: '#F472B6' }}>
                  <CalendarClock className="w-3 h-3" /> {fmtData(cls.evento_data)}{cls.evento_hora ? ` às ${cls.evento_hora}` : ''}
                </span>
              )}
              {cls?.prazo?.fim && (
                <span className="flex items-center gap-1" style={{ color: '#FBBF24' }}>
                  <Clock className="w-3 h-3" /> prazo até {fmtData(cls.prazo.fim)} ({cls.prazo_dias} dias {cls.prazo_contagem === 'corridos' ? 'corridos' : 'úteis'})
                </span>
              )}
              {c.advogados_intimados?.length > 0 && (
                <span>intimado: {c.advogados_intimados.map(a => a.nome.split(' ')[0]).join(', ')}</span>
              )}
            </div>
          </div>
          {aberta ? <ChevronUp className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--notion-text-3)' }} />
            : <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--notion-text-3)' }} />}
        </div>
      </button>

      {aberta && (
        <div className="px-3 pb-3 border-t pt-3" style={{ borderColor: 'var(--notion-border)' }}>
          {/* trecho citado: o que permite conferir a leitura da IA em segundos */}
          {cls?.trecho && (
            <div className="mb-3 px-3 py-2 rounded text-xs italic"
              style={{ background: 'var(--notion-bg)', borderLeft: `2px solid ${cor}`, color: 'var(--notion-text-2)' }}>
              “{cls.trecho}”
              <span className="block mt-1 not-italic text-[10px]" style={{ color: 'var(--notion-text-3)' }}>
                trecho citado pela IA para sustentar a leitura
              </span>
            </div>
          )}
          {c.classificacao_erro && (
            <p className="mb-3 text-xs" style={{ color: '#FBBF24' }}>
              A IA não conseguiu classificar: {c.classificacao_erro}
            </p>
          )}

          <details className="mb-3">
            <summary className="text-xs cursor-pointer" style={{ color: 'var(--notion-text-3)' }}>
              <FileText className="w-3 h-3 inline mr-1" /> Texto completo da publicação
            </summary>
            <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap px-3 py-2 rounded max-h-72 overflow-y-auto"
              style={{ background: 'var(--notion-bg)', color: 'var(--notion-text-2)' }}>{c.texto}</p>
            {c.link && (
              <a href={c.link} target="_blank" rel="noreferrer" className="text-xs mt-1 inline-block" style={{ color: 'var(--notion-accent)' }}>
                abrir no DJEN →
              </a>
            )}
          </details>

          {somenteLeitura ? (
            <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>
              {c.status === 'aprovada' ? 'Aprovada' : 'Dispensada'} em {c.aprovada_em ? new Date(c.aprovada_em).toLocaleString('pt-BR') : '—'}
              {c.pendencia_row_id && ' · pendência criada'}
              {c.webhook_enviado_em && ' · cliente avisado'}
            </p>
          ) : (
            <FormularioAprovacao c={c} membros={membros} userId={userId} onPronto={() => router.refresh()} />
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------- Formulário de aprovação ---------------- */
/**
 * Formulário PRÉ-PREENCHIDO e editável, não um ✓ cego: a extração da IA erra, e
 * confirmar sem poder corrigir produziria tarefa errada no quadro.
 */
function FormularioAprovacao({ c, membros, userId, onPronto }: {
  c: Comunicacao; membros: Membro[]; userId: string; onPronto: () => void
}) {
  const cls = c.classificacao
  const alvo = cls?.prazo?.fim || cls?.evento_data || null

  const [tipoPendencia, setTipoPendencia] = useState(sugerirPendencia(cls?.tipo))
  const [prioridade, setPrioridade] = useState(sugerirPrioridade(cls?.tipo, alvo))
  const [dataRetorno, setDataRetorno] = useState(alvo || '')
  const [membrosSel, setMembrosSel] = useState<string[]>(c.responsaveis?.length ? c.responsaveis : [userId])
  const [criarAud, setCriarAud] = useState(cls?.tipo === 'audiencia' && !!cls?.evento_data)
  const [audData, setAudData] = useState(cls?.evento_data || '')
  const [avisar, setAvisar] = useState(false)   // sempre desmarcado por padrão
  const [mensagem, setMensagem] = useState(mensagemPadrao(c, cls))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(acao: 'aprovar' | 'dispensar') {
    setSalvando(true); setErro(null)
    const r = await fetch('/api/novidades/acao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: c.id, acao,
        dados: {
          tipo: cls?.tipo || 'outro', tipoPendencia, prioridade,
          dataRetorno: dataRetorno || null, membros: membrosSel,
          criarAudiencia: criarAud, audienciaData: audData || null, audienciaHora: cls?.evento_hora || null,
        },
        avisarCliente: acao === 'aprovar' && avisar,
        mensagemCliente: mensagem,
      }),
    })
    const d = await r.json()
    setSalvando(false)
    if (!r.ok) { setErro(d.error || 'Falha'); return }
    if (d.aviso && avisar && !d.aviso.enviado) { setErro(`Tarefa criada, mas o aviso não saiu: ${d.aviso.motivo}`); }
    onPronto()
  }

  return (
    <div className="space-y-3">
      {cls?.prazo?.avisos?.length ? (
        <div className="text-[11px] px-2.5 py-2 rounded flex gap-1.5"
          style={{ background: 'rgba(251,191,36,0.08)', color: '#FBBF24' }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>{cls.prazo.avisos.join(' ')}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo de pendência">
          <Select value={tipoPendencia} onChange={e => setTipoPendencia(e.target.value)}>
            {OPCOES_PENDENCIA.map(o => <option key={o} value={o}>{o || '— escolher —'}</option>)}
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select value={prioridade} onChange={e => setPrioridade(e.target.value)}>
            {OPCOES_PRIORIDADE.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>
        <Field label="Data de retorno">
          <Input type="date" value={dataRetorno} onChange={e => setDataRetorno(e.target.value)} />
        </Field>
        <Field label="Responsáveis">
          <div className="flex flex-wrap gap-1 px-2 py-1.5 rounded-lg max-h-24 overflow-y-auto"
            style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
            {membros.map(m => {
              const on = membrosSel.includes(m.id)
              return (
                <button key={m.id} type="button"
                  onClick={() => setMembrosSel(s => on ? s.filter(x => x !== m.id) : [...s, m.id])}
                  className="px-1.5 py-0.5 rounded text-[11px]"
                  style={{ background: on ? 'var(--notion-accent)' : 'var(--notion-bg-4)', color: on ? '#fff' : 'var(--notion-text-2)' }}>
                  {m.full_name}
                </button>
              )
            })}
          </div>
        </Field>
      </div>

      {(cls?.tipo === 'audiencia' || cls?.evento_data) && (
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--notion-text-2)' }}>
          <input type="checkbox" checked={criarAud} onChange={e => setCriarAud(e.target.checked)} />
          Criar também linha em Audiências
          {criarAud && (
            <input type="date" value={audData} onChange={e => setAudData(e.target.value)}
              className="ml-1 px-2 py-1 rounded text-xs"
              style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
          )}
        </label>
      )}

      {/* aviso ao cliente: separado, desmarcado, com o texto à vista antes de sair */}
      <div className="rounded-lg p-2.5" style={{ background: 'var(--notion-bg)', border: '1px solid var(--notion-border)' }}>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--notion-text-2)' }}>
          <input type="checkbox" checked={avisar} onChange={e => setAvisar(e.target.checked)}
            disabled={!!c.webhook_enviado_em} />
          <Send className="w-3 h-3" />
          Avisar o cliente
          {c.webhook_enviado_em && <span style={{ color: 'var(--notion-text-3)' }}>(já avisado)</span>}
          {!c.webhook_enviado_em && cls?.relevante_para_cliente && (
            <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}>
              a IA achou relevante para o cliente
            </span>
          )}
        </label>
        {avisar && (
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={3}
            className="w-full mt-2 px-2 py-1.5 rounded text-xs outline-none resize-y"
            style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
        )}
      </div>

      {erro && <p className="text-xs" style={{ color: '#F87171' }}>{erro}</p>}

      <div className="flex items-center gap-2">
        <button onClick={() => enviar('aprovar')} disabled={salvando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--notion-accent)', color: '#fff', opacity: salvando ? 0.7 : 1 }}>
          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Aprovar e criar tarefa
        </button>
        <button onClick={() => enviar('dispensar')} disabled={salvando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
          <X className="w-3.5 h-3.5" /> Dispensar
        </button>
      </div>
    </div>
  )
}

function sugerirPendencia(tipo?: string) {
  const m: Record<string, string> = {
    audiencia: 'Conversar com cliente', pericia: 'Conversar com cliente',
    prazo: 'Manifestar no Processo', sentenca: 'Manifestar no Processo',
    acordao: 'Manifestar no Processo', alvara: 'Alvará judicial',
  }
  return (tipo && m[tipo]) || ''
}

function sugerirPrioridade(tipo?: string, alvo?: string | null) {
  if (alvo) {
    const dias = Math.ceil((new Date(`${alvo}T12:00:00Z`).getTime() - Date.now()) / 86400000)
    if (dias <= 5) return 'Urgente'
    if (dias <= 15) return 'Alta'
  }
  if (tipo === 'audiencia' || tipo === 'pericia' || tipo === 'prazo') return 'Alta'
  return 'Média'
}

/** Rascunho da mensagem — o advogado lê e edita antes de qualquer envio. */
function mensagemPadrao(c: Comunicacao, cls: Classificacao | null) {
  const proc = fmtCnj(c.cnj)
  if (cls?.tipo === 'audiencia' && cls.evento_data) {
    return `Olá! Temos uma novidade no seu processo ${proc}: foi marcada audiência para ${fmtData(cls.evento_data)}${cls.evento_hora ? ` às ${cls.evento_hora}` : ''}. Entraremos em contato para combinar os detalhes.`
  }
  if (cls?.resumo) {
    return `Olá! Novidade no seu processo ${proc}: ${cls.resumo} Qualquer dúvida, estamos à disposição.`
  }
  return `Olá! Houve uma movimentação no seu processo ${proc} em ${fmtData(c.data_publicacao)}. Nossa equipe está analisando e retorna em breve.`
}
