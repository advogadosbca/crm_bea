'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Clock, Filter, ArrowRight, User } from 'lucide-react'

/**
 * Pendências processuais na Geral — visão de quem abre o sistema de manhã.
 *
 * Não é um segundo quadro: o kanban completo continua em /pendencias. Aqui o
 * que importa é "o que vence primeiro e é meu", então a ordem é por Data de
 * Retorno e o vencido salta aos olhos.
 *
 * São as MESMAS linhas de `Pendências Processuais` (db_rows), resolvidas no
 * servidor. Nada é copiado: se fosse cópia, alguém concluiria de um lado e o
 * outro ficaria mostrando pendente para sempre.
 */
export interface PendenciaResumo {
  rowId: string
  processo: string
  tipo: string
  status: string
  prioridade: string
  dataRetorno: string | null
  contato: string
  membros: string[]
}

const COR_PRIORIDADE: Record<string, string> = {
  'Urgente': '#F87171', 'Alta': '#FB923C', 'Média': '#FBBF24', 'Baixa': '#94A3B8',
}

const hoje = () => new Date().toISOString().slice(0, 10)
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR')

/** dias até a data (negativo = já venceu) */
function diasAte(data: string) {
  const alvo = new Date(`${data}T12:00:00Z`).getTime()
  const agora = new Date(`${hoje()}T12:00:00Z`).getTime()
  return Math.round((alvo - agora) / 86400000)
}

function prazoLabel(data: string | null) {
  if (!data) return { texto: 'sem prazo', cor: 'var(--notion-text-3)', urgente: false }
  const d = diasAte(data)
  if (d < 0) return { texto: `venceu há ${Math.abs(d)} dia${Math.abs(d) > 1 ? 's' : ''}`, cor: '#F87171', urgente: true }
  if (d === 0) return { texto: 'vence hoje', cor: '#F87171', urgente: true }
  if (d === 1) return { texto: 'vence amanhã', cor: '#FBBF24', urgente: true }
  if (d <= 5) return { texto: `em ${d} dias`, cor: '#FBBF24', urgente: true }
  return { texto: fmt(data), cor: 'var(--notion-text-3)', urgente: false }
}

export function PendenciasResumo({ pendencias, membros, userId }: {
  pendencias: PendenciaResumo[]
  membros: { id: string; full_name: string }[]
  userId: string
}) {
  // começa filtrado: a Geral é tela de trabalho, não de supervisão
  const [soMinhas, setSoMinhas] = useState(true)

  const lista = useMemo(() => {
    const base = soMinhas ? pendencias.filter(p => p.membros.includes(userId)) : pendencias
    return [...base].sort((a, b) => {
      // sem prazo vai para o fim — não compete com o que tem data
      if (!a.dataRetorno) return 1
      if (!b.dataRetorno) return -1
      return a.dataRetorno.localeCompare(b.dataRetorno)
    })
  }, [pendencias, soMinhas, userId])

  const minhas = pendencias.filter(p => p.membros.includes(userId)).length
  const vencidas = lista.filter(p => p.dataRetorno && diasAte(p.dataRetorno) < 0).length
  const nome = (id: string) => membros.find(m => m.id === id)?.full_name || ''

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--notion-text)' }}>
          <Clock className="w-4 h-4" style={{ color: '#EF4444' }} /> Pendências Processuais
        </h2>
        {vencidas > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>
            {vencidas} vencida{vencidas > 1 ? 's' : ''}
          </span>
        )}
        <button onClick={() => setSoMinhas(s => !s)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors"
          style={{
            background: soMinhas ? 'var(--notion-bg-4)' : 'var(--notion-bg-2)',
            color: soMinhas ? 'var(--notion-text)' : 'var(--notion-text-2)',
            border: `1px solid ${soMinhas ? 'var(--notion-accent)' : 'var(--notion-border)'}`,
          }}>
          <Filter className="w-3 h-3" /> {soMinhas ? `Só as minhas (${minhas})` : `Todas (${pendencias.length})`}
        </button>
        <Link href="/pendencias" className="ml-auto flex items-center gap-1 text-xs hover:underline"
          style={{ color: 'var(--notion-accent)' }}>
          Ver o quadro completo <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {lista.length === 0 ? (
        <p className="text-xs px-3 py-4 rounded-lg" style={{ background: 'var(--notion-bg-2)', color: 'var(--notion-text-3)' }}>
          {soMinhas && pendencias.length > 0
            ? 'Nenhuma pendência sua em aberto — há outras da equipe, clique em “Só as minhas” para ver.'
            : 'Nenhuma pendência em aberto.'}
        </p>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--notion-border)' }}>
          {lista.map((p, i) => {
            const prazo = prazoLabel(p.dataRetorno)
            return (
              <Link key={p.rowId} href="/pendencias"
                className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--notion-bg-3)] transition-colors"
                style={{
                  background: 'var(--notion-bg-2)',
                  borderTop: i ? '1px solid var(--notion-border)' : undefined,
                  // faixa à esquerda: dá para varrer a lista sem ler
                  boxShadow: prazo.urgente ? `inset 3px 0 0 ${prazo.cor}` : undefined,
                }}>
                <span className="text-xs font-medium whitespace-nowrap" style={{ color: prazo.cor, minWidth: '7.5rem' }}>
                  {prazo.texto}
                </span>
                <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: 'var(--notion-text-2)' }}>
                  {p.processo || '— sem número —'}
                </span>
                {p.tipo && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap"
                    style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-2)' }}>{p.tipo}</span>
                )}
                {p.prioridade && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap"
                    style={{ background: `${COR_PRIORIDADE[p.prioridade] || '#94A3B8'}22`, color: COR_PRIORIDADE[p.prioridade] || '#94A3B8' }}>
                    {p.prioridade}
                  </span>
                )}
                <span className="text-xs truncate flex-1" style={{ color: 'var(--notion-text-3)' }}>{p.contato}</span>
                {!soMinhas && p.membros.length > 0 && (
                  <span className="flex items-center gap-1 text-[11px] whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>
                    <User className="w-2.5 h-2.5" /> {nome(p.membros[0]).split(' ')[0]}
                    {p.membros.length > 1 && ` +${p.membros.length - 1}`}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
