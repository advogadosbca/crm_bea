'use client'

import { Field, Textarea, Tag } from '@/components/ui/primitives'

/**
 * Formulário de "Entrega confiável" (sql/008): entrega no prazo (1 ou 10) +
 * quantidade de correção (1 a 10) + observação. O mesmo formulário serve a aba
 * Avaliações e o botão Avaliar do cartão da tarefa — as duas gravam na mesma
 * tabela (avaliacoes_entrega), então o relatório é um só.
 */

export type FormState = { entrega_no_prazo: number; quantidade_correcao: number; observacao: string }

export const FORM_VAZIO: FormState = { entrega_no_prazo: 10, quantidade_correcao: 10, observacao: '' }

export function bandaNota(v: number): { label: string; color: string } {
  if (v >= 10) return { label: 'Verde', color: '#10B981' }
  if (v >= 7) return { label: 'Amarelo', color: '#F59E0B' }
  return { label: 'Vermelho', color: '#EF4444' }
}

export function FormAvaliacao({ form, setForm, avaliadoNome }: {
  form: FormState; setForm: (f: FormState) => void; avaliadoNome: string
}) {
  const banda = bandaNota(form.quantidade_correcao)
  return (
    <div className="space-y-4">
      <Field label="Colaborador avaliado">
        <p className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }}>
          {avaliadoNome}
        </p>
      </Field>
      <Field label="Entrega no prazo *">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setForm({ ...form, entrega_no_prazo: 10 })}
            className="py-2 rounded-lg text-sm font-medium border transition-all"
            style={{
              background: form.entrega_no_prazo === 10 ? '#10B98120' : 'var(--notion-bg-3)',
              borderColor: form.entrega_no_prazo === 10 ? '#10B981' : 'var(--notion-border)',
              color: form.entrega_no_prazo === 10 ? '#10B981' : 'var(--notion-text-2)',
            }}>
            No prazo (10)
          </button>
          <button type="button" onClick={() => setForm({ ...form, entrega_no_prazo: 1 })}
            className="py-2 rounded-lg text-sm font-medium border transition-all"
            style={{
              background: form.entrega_no_prazo === 1 ? '#EF444420' : 'var(--notion-bg-3)',
              borderColor: form.entrega_no_prazo === 1 ? '#EF4444' : 'var(--notion-border)',
              color: form.entrega_no_prazo === 1 ? '#EF4444' : 'var(--notion-text-2)',
            }}>
            Fora do prazo (1)
          </button>
        </div>
      </Field>
      <Field label={`Quantidade de correção * — ${form.quantidade_correcao}`}>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={10} value={form.quantidade_correcao}
            onChange={e => setForm({ ...form, quantidade_correcao: Number(e.target.value) })}
            className="flex-1" style={{ accentColor: 'var(--notion-accent)' }} />
          <Tag label={banda.label} color={banda.color} />
        </div>
      </Field>
      <Field label="Observação">
        <Textarea rows={3} value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })}
          placeholder="O que aconteceu com esse prazo..." />
      </Field>
    </div>
  )
}
