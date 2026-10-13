'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardCheck, X, Pencil, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Tag } from '@/components/ui/primitives'
import { FormAvaliacao, FormState, FORM_VAZIO, bandaNota } from './FormAvaliacao'

export interface AvaliacaoDoCard {
  id: string; avaliado_id: string
  entrega_no_prazo: number; quantidade_correcao: number; observacao: string | null
}

/**
 * Avaliar a entrega direto do cartão da tarefa (pedido do Lucas B&A, 13/10/2026).
 *
 * Grava na MESMA tabela da aba Avaliações (avaliacoes_entrega), uma linha por
 * colaborador da tarefa — então a avaliação cai sozinha em "Feitas" e no
 * "Desempenho", e a tarefa sai de "Pendentes". Quem chama só mostra o botão
 * para admin e com a tarefa finalizada; o banco também barra quem não é admin
 * (policy avaliacoes_entrega_rw).
 *
 * Tarefa com um colaborador abre direto no formulário; com vários, primeiro a
 * lista de quem já foi avaliado e quem falta.
 */
export function AvaliarTarefa({ cardId, cardTitulo, membros, avaliacoes, workspaceId, avaliadorId, onClose, onSalvo }: {
  cardId: string; cardTitulo: string
  membros: { id: string; full_name: string }[]
  avaliacoes: AvaliacaoDoCard[]
  workspaceId: string; avaliadorId: string
  onClose: () => void
  /** depois de gravar: quem chama relê as avaliações do cartão */
  onSalvo: () => void
}) {
  const supabase = createClient()
  const daPessoa = (id: string) => avaliacoes.find(a => a.avaliado_id === id)
  const abrirForm = (id: string): FormState => {
    const a = daPessoa(id)
    return a ? { entrega_no_prazo: a.entrega_no_prazo, quantidade_correcao: a.quantidade_correcao, observacao: a.observacao || '' } : FORM_VAZIO
  }
  const unico = membros.length === 1 ? membros[0].id : null
  const [pessoa, setPessoa] = useState<string | null>(unico)
  const [form, setForm] = useState<FormState>(() => (unico ? abrirForm(unico) : FORM_VAZIO))
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function escolher(id: string) { setPessoa(id); setForm(abrirForm(id)); setErro(null) }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!pessoa) return
    setSaving(true); setErro(null)
    const campos = { entrega_no_prazo: form.entrega_no_prazo, quantidade_correcao: form.quantidade_correcao, observacao: form.observacao.trim() || null }
    const existente = daPessoa(pessoa)
    const { error } = existente
      ? await supabase.from('avaliacoes_entrega').update(campos).eq('id', existente.id)
      : await supabase.from('avaliacoes_entrega').insert({ workspace_id: workspaceId, card_id: cardId, avaliado_id: pessoa, avaliador_id: avaliadorId, ...campos })
    setSaving(false)
    if (error) { setErro(`Não consegui salvar a avaliação: ${error.message}`); return }
    onSalvo()
    // um colaborador: terminou. Vários: volta para a lista para seguir com o próximo
    if (unico) onClose(); else setPessoa(null)
  }

  const nomeDe = (id: string) => membros.find(m => m.id === id)?.full_name || 'Sem nome'

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 10040 }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl overflow-y-auto max-h-[90vh] animate-fade-in"
        style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--notion-border)' }}>
          <h2 className="flex items-center gap-2 font-semibold min-w-0" style={{ color: 'var(--notion-text)' }}>
            {pessoa && !unico && (
              <button type="button" onClick={() => setPessoa(null)} title="Voltar para a lista" style={{ color: 'var(--notion-text-3)' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <ClipboardCheck className="w-4 h-4 flex-shrink-0" style={{ color: '#A78BFA' }} />
            <span className="truncate">{daPessoa(pessoa || '') ? 'Retificar' : 'Avaliar'}: {cardTitulo}</span>
          </h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--notion-text-3)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6">
          {membros.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--notion-text-2)' }}>
              A avaliação é feita por colaborador, e esta tarefa não tem ninguém. Adicione o responsável no botão <b>+</b> ao lado dos avatares do cartão e volte aqui.
            </p>
          ) : !pessoa ? (
            <div className="space-y-2">
              <p className="text-xs mb-1" style={{ color: 'var(--notion-text-3)' }}>Cada colaborador da tarefa recebe a própria avaliação.</p>
              {membros.map(m => {
                const a = daPessoa(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => escolher(m.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-[var(--notion-bg-3)]"
                    style={{ border: '1px solid var(--notion-border)' }}>
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{m.full_name}</span>
                    {a ? (
                      <>
                        <Tag label={a.entrega_no_prazo === 10 ? 'No prazo' : 'Atrasou'} color={bandaNota(a.entrega_no_prazo).color} />
                        <Tag label={`Correção ${a.quantidade_correcao}`} color={bandaNota(a.quantidade_correcao).color} />
                        <Pencil className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--notion-text-3)' }} />
                      </>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium" style={{ background: 'var(--notion-accent)', color: '#fff' }}>Avaliar</span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <form onSubmit={salvar}>
              <FormAvaliacao form={form} setForm={setForm} avaliadoNome={nomeDe(pessoa)} />
              {erro && <p className="text-xs mt-3" style={{ color: '#F87171' }}>{erro}</p>}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={unico ? onClose : () => setPessoa(null)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-70" style={{ background: 'var(--notion-accent)', color: '#fff' }}>
                  {saving ? 'Salvando...' : daPessoa(pessoa) ? 'Salvar alteração' : 'Salvar avaliação'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
