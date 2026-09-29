'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, X, Loader2, ChevronDown, ChevronUp, User, Phone, UserPlus,
  AlertTriangle, Send, RotateCw, MessageSquareText,
} from 'lucide-react'
import { Field, Textarea } from '@/components/ui/primitives'
import type { CasoNovo } from '@/lib/casos-novos'

interface Membro { id: string; full_name: string }

type Aba = 'pendentes' | 'decididos'

const fmtQuando = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—')

/**
 * Casos de clientes novos que a Sofia trouxe do WhatsApp. O advogado lê o
 * relato e aprova ou recusa; a decisão avisa a cliente (webhook do n8n) e a
 * Sofia segue a conversa a partir do status gravado aqui.
 */
export function CasosNovos({ pendentes, decididos, membros }: {
  pendentes: CasoNovo[]; decididos: CasoNovo[]; membros: Membro[]
}) {
  const [aba, setAba] = useState<Aba>('pendentes')
  const [aberto, setAberto] = useState<string | null>(null)
  const visiveis = aba === 'pendentes' ? pendentes : decididos

  const Aba = ({ id, label, n }: { id: Aba; label: string; n: number }) => (
    <button onClick={() => { setAba(id); setAberto(null) }}
      className="flex items-center gap-1.5 px-3 py-2 text-sm -mb-px border-b-2 transition-colors"
      style={{ color: aba === id ? 'var(--notion-text)' : 'var(--notion-text-3)', borderColor: aba === id ? 'var(--notion-accent)' : 'transparent' }}>
      {label}
      <span className="px-1.5 rounded-full text-[10px] font-semibold"
        style={{ background: aba === id ? 'var(--notion-accent)' : 'var(--notion-bg-4)', color: aba === id ? '#fff' : 'var(--notion-text-3)' }}>{n}</span>
    </button>
  )

  return (
    <>
      <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
        <Aba id="pendentes" label="Aguardando aprovação" n={pendentes.length} />
        <Aba id="decididos" label="Decididos" n={decididos.length} />
      </div>

      {visiveis.length === 0 && (
        <div className="py-16 text-center">
          <UserPlus className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--notion-text-3)' }} />
          <p className="text-sm" style={{ color: 'var(--notion-text-3)' }}>
            {aba === 'pendentes' ? 'Nenhum caso novo esperando aprovação.' : 'Nenhum caso decidido ainda.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {visiveis.map(c => (
          <CardCaso key={c.id} c={c} membros={membros}
            aberto={aberto === c.id} onToggle={() => setAberto(a => (a === c.id ? null : c.id))} />
        ))}
      </div>
    </>
  )
}

/* ---------------- Card de um caso ---------------- */
function CardCaso({ c, membros, aberto, onToggle }: {
  c: CasoNovo; membros: Membro[]; aberto: boolean; onToggle: () => void
}) {
  const router = useRouter()
  const pendente = c.status === 'pendente'
  const decisor = membros.find(m => m.id === c.decidido_por)?.full_name

  function abrir() {
    // abrir o relato = ler. Marca sem esperar: o ponto de "não lido" é só um
    // lembrete, não vale segurar a tela por ele.
    if (!aberto && pendente && !c.lida_em) {
      void fetch('/api/casos/acao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, acao: 'ler' }),
      })
    }
    onToggle()
  }

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
      <button onClick={abrir} className="w-full text-left px-3 py-2.5 hover:bg-[var(--notion-bg-3)] transition-colors">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {c.area && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: 'rgba(96,165,250,0.15)', color: '#60A5FA' }}>{c.area}</span>
              )}
              {!pendente && <SeloStatus status={c.status} />}
              <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--notion-text-2)' }}>
                <User className="w-2.5 h-2.5" /> {c.nome || 'sem nome'}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--notion-text-3)' }}>{c.telefone}</span>
              {pendente && !c.lida_em && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--notion-accent)' }} title="não lido" />
              )}
            </div>
            <p className="text-sm truncate" style={{ color: 'var(--notion-text)' }}>{c.relato.slice(0, 160)}</p>
            <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap" style={{ color: 'var(--notion-text-3)' }}>
              <span>recebido {fmtQuando(c.updated_at > c.created_at && pendente ? c.updated_at : c.created_at)}</span>
              {!pendente && <span>{c.status} por {decisor || '—'} em {fmtQuando(c.decidido_em)}</span>}
              {!pendente && !c.webhook_enviado_em && (
                <span className="flex items-center gap-1" style={{ color: '#FBBF24' }}>
                  <AlertTriangle className="w-3 h-3" /> cliente não avisada
                </span>
              )}
            </div>
          </div>
          {aberto ? <ChevronUp className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--notion-text-3)' }} />
            : <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--notion-text-3)' }} />}
        </div>
      </button>

      {aberto && (
        <div className="px-3 pb-3 border-t pt-3" style={{ borderColor: 'var(--notion-border)' }}>
          {/* quem é e por onde falar, sem sair da tela */}
          <div className="mb-3 flex items-center gap-3 flex-wrap text-xs px-3 py-2 rounded"
            style={{ background: 'var(--notion-bg)', color: 'var(--notion-text-2)' }}>
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" style={{ color: 'var(--notion-text-3)' }} />
              <b style={{ color: 'var(--notion-text)' }}>{c.nome || 'sem nome'}</b>
            </span>
            <a href={`https://wa.me/${soDigitosComDdi(c.telefone)}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 hover:underline" style={{ color: 'var(--notion-accent)' }}>
              <Phone className="w-3.5 h-3.5" /> {c.telefone}
            </a>
            {c.lead_row_id && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--notion-text-3)' }}>
                <UserPlus className="w-3.5 h-3.5" /> no Funil Pré-Atendimento
              </span>
            )}
          </div>

          {/* o relato inteiro, como a Sofia registrou — é o que se aprova */}
          <p className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--notion-text-3)' }}>
            <MessageSquareText className="w-3 h-3" /> Relato colhido pela Sofia
          </p>
          <p className="mb-3 text-sm leading-relaxed whitespace-pre-wrap px-3 py-2.5 rounded max-h-[28rem] overflow-y-auto"
            style={{ background: 'var(--notion-bg)', color: 'var(--notion-text)' }}>{c.relato}</p>

          {pendente
            ? <FormularioDecisao c={c} onPronto={() => router.refresh()} />
            : <ResumoDecisao c={c} decisor={decisor} onPronto={() => router.refresh()} />}
        </div>
      )}
    </div>
  )
}

function SeloStatus({ status }: { status: CasoNovo['status'] }) {
  const aprovado = status === 'aprovado'
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: aprovado ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)', color: aprovado ? '#34D399' : '#F87171' }}>
      {status}
    </span>
  )
}

/* ---------------- Aprovar / recusar ---------------- */
function FormularioDecisao({ c, onPronto }: { c: CasoNovo; onPronto: () => void }) {
  const [observacao, setObservacao] = useState('')
  const [confirmando, setConfirmando] = useState<'aprovar' | 'recusar' | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function decidir(acao: 'aprovar' | 'recusar') {
    setSalvando(true); setErro(null)
    const r = await fetch('/api/casos/acao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, acao, observacao }),
    })
    const d = await r.json()
    setSalvando(false); setConfirmando(null)
    if (!r.ok) { setErro(d.error || 'Falha'); return }
    // a decisão está gravada mesmo assim; o card vai para "Decididos" com o
    // botão de reenviar o aviso
    if (d.aviso && !d.aviso.enviado) alert(`Caso ${d.status}, mas a cliente não foi avisada: ${d.aviso.motivo}`)
    onPronto()
  }

  return (
    <div className="space-y-3">
      <Field label="Recado para a Sofia (opcional)">
        <Textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)}
          placeholder="Ex.: pedir carteira de trabalho e os últimos holerites antes do atendimento." />
      </Field>
      <p className="text-[11px] -mt-1" style={{ color: 'var(--notion-text-3)' }}>
        A Sofia lê este recado quando consultar o caso e usa na conversa com a cliente.
      </p>

      {erro && <p className="text-xs" style={{ color: '#F87171' }}>{erro}</p>}

      {confirmando ? (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span style={{ color: '#FBBF24' }}>
            {confirmando === 'aprovar'
              ? `Aprovar o caso de ${c.nome || c.telefone}? A cliente será avisada e a Sofia segue para o agendamento.`
              : `Recusar o caso de ${c.nome || c.telefone}? A cliente será avisada.`}
          </span>
          <button onClick={() => decidir(confirmando)} disabled={salvando}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium"
            style={{ background: confirmando === 'recusar' ? '#B91C1C' : 'var(--notion-accent)', color: '#fff', opacity: salvando ? 0.7 : 1 }}>
            {salvando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Confirmar
          </button>
          <button onClick={() => setConfirmando(null)} disabled={salvando} style={{ color: 'var(--notion-text-3)' }}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button onClick={() => setConfirmando('aprovar')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--notion-accent)', color: '#fff' }}>
            <Check className="w-3.5 h-3.5" /> Aprovar caso
          </button>
          <button onClick={() => setConfirmando('recusar')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
            <X className="w-3.5 h-3.5" /> Recusar
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------------- Caso já decidido ---------------- */
function ResumoDecisao({ c, decisor, onPronto }: { c: CasoNovo; decisor?: string; onPronto: () => void }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function reenviar() {
    setEnviando(true); setErro(null)
    const r = await fetch('/api/casos/acao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, acao: 'reenviar' }),
    })
    const d = await r.json()
    setEnviando(false)
    if (!r.ok) { setErro(d.error || 'Falha'); return }
    if (!d.aviso?.enviado) { setErro(`Não saiu de novo: ${d.aviso?.motivo}`); return }
    onPronto()
  }

  return (
    <div className="space-y-2 text-xs" style={{ color: 'var(--notion-text-2)' }}>
      <p className="flex items-center gap-2 flex-wrap">
        <SeloStatus status={c.status} />
        por {decisor || '—'} em {fmtQuando(c.decidido_em)}
        {c.webhook_enviado_em && (
          <span className="flex items-center gap-1" style={{ color: 'var(--notion-text-3)' }}>
            · <Send className="w-3 h-3" /> cliente avisada {fmtQuando(c.webhook_enviado_em)}
          </span>
        )}
      </p>
      {c.observacao && (
        <p className="px-3 py-2 rounded" style={{ background: 'var(--notion-bg)' }}>
          <span style={{ color: 'var(--notion-text-3)' }}>Recado para a Sofia: </span>{c.observacao}
        </p>
      )}
      {!c.webhook_enviado_em && (
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ color: '#FBBF24' }}>
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            A cliente não foi avisada{c.webhook_erro ? `: ${c.webhook_erro}` : '.'}
          </span>
          <button onClick={reenviar} disabled={enviando}
            className="flex items-center gap-1 px-2 py-1 rounded-md"
            style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)', opacity: enviando ? 0.7 : 1 }}>
            {enviando ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />} Reenviar aviso
          </button>
        </div>
      )}
      {erro && <p style={{ color: '#F87171' }}>{erro}</p>}
    </div>
  )
}

/** Só dígitos com o 55 na frente, para o link do WhatsApp. */
function soDigitosComDdi(bruto: string) {
  const d = (bruto || '').replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d
}
