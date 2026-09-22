'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, CheckCircle2, BarChart3, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ScrollX } from '@/components/ui/ScrollX'
import { Field, Textarea, Modal, ModalActions, Tag, EmptyRow, fmtDate } from '@/components/ui/primitives'
import { Desempenho } from './Desempenho'

interface PendenteItem {
  card_id: string; cardTitulo: string; due_date: string | null; encerrado_em: string | null
  avaliado: { id: string; full_name: string }
}
interface AvaliacaoFeita {
  id: string; card_id: string; avaliado_id: string
  entrega_no_prazo: number; quantidade_correcao: number; observacao: string | null
  created_at: string; cardTitulo: string; avaliadoNome: string
}

function bandaNota(v: number): { label: string; color: string } {
  if (v >= 10) return { label: 'Verde', color: '#10B981' }
  if (v >= 7) return { label: 'Amarelo', color: '#F59E0B' }
  return { label: 'Vermelho', color: '#EF4444' }
}

type FormState = { entrega_no_prazo: number; quantidade_correcao: number; observacao: string }

function FormAvaliacao({ form, setForm, avaliadoNome }: {
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
            className="flex-1" />
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

export function AvaliacoesClient({ pendentes, feitas, workspaceId, avaliadorId }: {
  pendentes: PendenteItem[]; feitas: AvaliacaoFeita[]; workspaceId: string; avaliadorId: string
}) {
  const [tab, setTab] = useState<'pendentes' | 'feitas' | 'desempenho'>('pendentes')
  const [avaliando, setAvaliando] = useState<PendenteItem | null>(null)
  const [editando, setEditando] = useState<AvaliacaoFeita | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const vazio: FormState = { entrega_no_prazo: 10, quantidade_correcao: 10, observacao: '' }
  const [form, setForm] = useState<FormState>(vazio)

  function abrirNovo(item: PendenteItem) {
    setAvaliando(item); setEditando(null); setForm(vazio)
  }
  function abrirEdicao(a: AvaliacaoFeita) {
    setEditando(a); setAvaliando(null)
    setForm({ entrega_no_prazo: a.entrega_no_prazo, quantidade_correcao: a.quantidade_correcao, observacao: a.observacao || '' })
  }
  function fechar() { setAvaliando(null); setEditando(null) }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    if (avaliando) {
      await supabase.from('avaliacoes_entrega').insert({
        workspace_id: workspaceId, card_id: avaliando.card_id, avaliado_id: avaliando.avaliado.id, avaliador_id: avaliadorId,
        entrega_no_prazo: form.entrega_no_prazo, quantidade_correcao: form.quantidade_correcao, observacao: form.observacao.trim() || null,
      })
    } else if (editando) {
      await supabase.from('avaliacoes_entrega').update({
        entrega_no_prazo: form.entrega_no_prazo, quantidade_correcao: form.quantidade_correcao, observacao: form.observacao.trim() || null,
      }).eq('id', editando.id)
    }
    setSaving(false); fechar()
    router.refresh()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir esta avaliação? A tarefa volta pra fila de pendentes.')) return
    await supabase.from('avaliacoes_entrega').delete().eq('id', id)
    router.refresh()
  }

  const avaliadoNomeModal = avaliando?.avaliado.full_name || editando?.avaliadoNome || ''

  return (
    <div>
      <div className="flex items-center gap-1 p-1 rounded-lg mb-6 w-fit" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
        {([
          { key: 'pendentes', label: `Pendentes (${pendentes.length})`, icon: ClipboardList },
          { key: 'feitas', label: `Feitas (${feitas.length})`, icon: CheckCircle2 },
          { key: 'desempenho', label: 'Desempenho', icon: BarChart3 },
        ] as { key: typeof tab; label: string; icon: typeof ClipboardList }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5"
            style={{
              background: tab === t.key ? 'var(--notion-bg-3)' : 'transparent',
              color: tab === t.key ? 'var(--notion-text)' : 'var(--notion-text-2)',
            }}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'pendentes' && (
        <ScrollX className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
              {['Tarefa', 'Colaborador', 'Concluída em', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pendentes.length === 0 ? <EmptyRow cols={4} label="Nenhuma tarefa pendente de avaliação" /> :
                pendentes.map(item => (
                  <tr key={`${item.card_id}:${item.avaliado.id}`} className="border-b" style={{ borderColor: 'var(--notion-border)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--notion-text)' }}>{item.cardTitulo}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{item.avaliado.full_name}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{fmtDate(item.encerrado_em)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => abrirNovo(item)} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--notion-accent)', color: '#fff' }}>Avaliar</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </ScrollX>
      )}

      {tab === 'feitas' && (
        <ScrollX className="rounded-xl overflow-x-auto border" style={{ borderColor: 'var(--notion-border)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--notion-bg-2)', borderBottom: '1px solid var(--notion-border)' }}>
              {['Data', 'Tarefa', 'Colaborador', 'Prazo', 'Correção', 'Observação', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--notion-text-3)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {feitas.length === 0 ? <EmptyRow cols={7} label="Nenhuma avaliação feita ainda" /> :
                feitas.map(a => {
                  const bPrazo = bandaNota(a.entrega_no_prazo)
                  const bCorr = bandaNota(a.quantidade_correcao)
                  return (
                    <tr key={a.id} className="border-b" style={{ borderColor: 'var(--notion-border)' }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--notion-text-2)' }}>{fmtDate(a.created_at)}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--notion-text)' }}>{a.cardTitulo}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--notion-text-2)' }}>{a.avaliadoNome}</td>
                      <td className="px-4 py-3"><Tag label={a.entrega_no_prazo === 10 ? 'No prazo' : 'Atrasou'} color={bPrazo.color} /></td>
                      <td className="px-4 py-3"><Tag label={String(a.quantidade_correcao)} color={bCorr.color} /></td>
                      <td className="px-4 py-3 text-xs max-w-[240px] truncate" style={{ color: 'var(--notion-text-2)' }} title={a.observacao || ''}>{a.observacao || '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => abrirEdicao(a)} className="p-1.5 rounded hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }} title="Retificar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => excluir(a.id)} className="p-1.5 rounded hover:bg-[var(--notion-bg-2)]" style={{ color: '#EF4444' }} title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </ScrollX>
      )}

      {tab === 'desempenho' && <Desempenho feitas={feitas} />}

      {(avaliando || editando) && (
        <Modal title={avaliando ? `Avaliar: ${avaliando.cardTitulo}` : `Retificar: ${editando?.cardTitulo}`} onClose={fechar}>
          <form onSubmit={salvar}>
            <FormAvaliacao form={form} setForm={setForm} avaliadoNome={avaliadoNomeModal} />
            <div className="mt-4"><ModalActions onCancel={fechar} saving={saving} /></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
