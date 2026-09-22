'use client'

import { useMemo, useState } from 'react'
import { Table2, BarChart2 } from 'lucide-react'

interface AvaliacaoFeita {
  id: string; avaliado_id: string; entrega_no_prazo: number; quantidade_correcao: number
  created_at: string; avaliadoNome: string
}

// paleta de status (verde/amarelo/vermelho) validada pro tema escuro do CRM —
// ver skill de dataviz: cores reservadas, nunca sozinhas (sempre com número/rótulo do lado)
const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
}
function bandaCor(v: number) {
  if (v >= 10) return STATUS.good
  if (v >= 7) return STATUS.warning
  return STATUS.critical
}

function Meter({ label, valor }: { label: string; valor: number }) {
  const cor = bandaCor(valor)
  const pct = Math.max(4, (valor / 10) * 100)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--notion-text-2)' }}>{label}</span>
        <span className="text-xs font-mono font-semibold" style={{ color: 'var(--notion-text)' }}>{valor.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--notion-bg-4)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
      </div>
    </div>
  )
}

export function Desempenho({ feitas }: { feitas: AvaliacaoFeita[] }) {
  const [periodo, setPeriodo] = useState<'mes' | 'tudo'>('mes')
  const [visao, setVisao] = useState<'grafico' | 'tabela'>('grafico')

  const filtradas = useMemo(() => {
    if (periodo === 'tudo') return feitas
    const hoje = new Date()
    const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
    return feitas.filter(f => f.created_at.slice(0, 10) >= inicioMes)
  }, [feitas, periodo])

  const porColaborador = useMemo(() => {
    const map = new Map<string, { nome: string; itens: AvaliacaoFeita[] }>()
    for (const f of filtradas) {
      const e = map.get(f.avaliado_id) || { nome: f.avaliadoNome, itens: [] }
      e.itens.push(f)
      map.set(f.avaliado_id, e)
    }
    return [...map.entries()].map(([id, e]) => {
      const n = e.itens.length
      const avgPrazo = e.itens.reduce((s, i) => s + i.entrega_no_prazo, 0) / n
      const avgCorrecao = e.itens.reduce((s, i) => s + i.quantidade_correcao, 0) / n
      return { id, nome: e.nome, n, avgPrazo, avgCorrecao }
    }).sort((a, b) => a.avgCorrecao - b.avgCorrecao)
  }, [filtradas])

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
          {([{ key: 'mes', label: 'Este mês' }, { key: 'tudo', label: 'Todo o período' }] as { key: typeof periodo; label: string }[]).map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{ background: periodo === p.key ? 'var(--notion-bg-3)' : 'transparent', color: periodo === p.key ? 'var(--notion-text)' : 'var(--notion-text-2)' }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--notion-text-3)' }}>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS.good }} />Verde (10)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS.warning }} />Amarelo (7-9)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS.critical }} />Vermelho (1-6)</span>
          </div>
          <button onClick={() => setVisao(v => v === 'grafico' ? 'tabela' : 'grafico')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)', border: '1px solid var(--notion-border)' }}>
            {visao === 'grafico' ? <><Table2 className="w-3.5 h-3.5" /> Ver como tabela</> : <><BarChart2 className="w-3.5 h-3.5" /> Ver como gráfico</>}
          </button>
        </div>
      </div>

      {porColaborador.length === 0 ? (
        <div className="rounded-xl p-8 border text-sm text-center" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)', color: 'var(--notion-text-3)' }}>
          Nenhuma avaliação no período selecionado.
        </div>
      ) : visao === 'tabela' ? (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
              {['Colaborador', 'Avaliações', 'Entrega no prazo (média)', 'Quantidade de correção (média)'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {porColaborador.map(c => (
                <tr key={c.id} className="border-b" style={{ borderColor: 'var(--notion-border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--notion-text)' }}>{c.nome}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--notion-text-2)' }}>{c.n}</td>
                  <td className="px-4 py-3 font-mono text-xs"><span className="inline-flex items-center gap-1.5" style={{ color: 'var(--notion-text-2)' }}><span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: bandaCor(c.avgPrazo) }} />{c.avgPrazo.toFixed(1)}</span></td>
                  <td className="px-4 py-3 font-mono text-xs"><span className="inline-flex items-center gap-1.5" style={{ color: 'var(--notion-text-2)' }}><span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: bandaCor(c.avgCorrecao) }} />{c.avgCorrecao.toFixed(1)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {porColaborador.map(c => (
            <div key={c.id} className="rounded-xl p-4 border" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: 'var(--notion-text)' }}>{c.nome}</span>
                <span className="text-[11px]" style={{ color: 'var(--notion-text-3)' }}>{c.n} avaliação{c.n !== 1 ? 'ões' : ''}</span>
              </div>
              <div className="space-y-3">
                <Meter label="Entrega no prazo" valor={c.avgPrazo} />
                <Meter label="Quantidade de correção" valor={c.avgCorrecao} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
