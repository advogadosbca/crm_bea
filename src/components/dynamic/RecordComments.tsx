'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { initials, personColor } from '@/lib/people'
import { MessageSquare, Send, Trash2 } from 'lucide-react'

interface Member { id: string; full_name: string }
interface RowComment { id: string; user_id: string | null; text: string; created_at: string }

/**
 * Comentários de um registro (linha de tabela dinâmica), guardados em `db_row_comments`.
 * Usado tanto na ficha aberta pelo quadro quanto no painel lateral da tabela.
 */
export function RecordComments({ rowId, userId, members, compact = false }: {
  rowId: string; userId: string; members: Member[]; compact?: boolean
}) {
  const supabase = createClient()
  const [comments, setComments] = useState<RowComment[] | null>(null)
  const [text, setText] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.from('db_row_comments').select('*').eq('row_id', rowId).order('created_at', { ascending: false })
      .then(({ data }) => { if (vivo) setComments((data || []) as RowComment[]) })
    return () => { vivo = false }
  }, [rowId, supabase])

  const member = (id: string) => members.find(m => m.id === id)

  async function add() {
    const t = text.trim()
    if (!t || enviando) return
    setEnviando(true)
    const { data } = await supabase.from('db_row_comments')
      .insert({ row_id: rowId, user_id: userId, text: t }).select('*').single()
    setText('')
    if (data) setComments(cs => [data as RowComment, ...(cs || [])])
    setEnviando(false)
  }

  async function remove(id: string) {
    setComments(cs => (cs || []).filter(c => c.id !== id))
    await supabase.from('db_row_comments').delete().eq('id', id)
  }

  return (
    <div className={compact ? 'mt-6 pt-4 border-t' : 'mt-8 pt-5 border-t'} style={{ borderColor: 'var(--notion-border)' }}>
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium mb-2" style={{ color: 'var(--notion-text)' }}>
        <MessageSquare className="w-3.5 h-3.5" /> Comentários
        {comments && comments.length > 0 && (
          <span className="text-[11px] font-normal" style={{ color: 'var(--notion-text-3)' }}>· {comments.length}</span>
        )}
      </h3>

      <div className="flex gap-2 mb-3">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
          placeholder="Escreva um comentário... (Enter envia, Shift+Enter quebra linha)"
          className="flex-1 px-2.5 py-2 rounded-lg text-[13px] outline-none resize-y min-h-[38px]"
          style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-border)' }} />
        <button onClick={add} disabled={!text.trim() || enviando} title="Enviar"
          className="px-2.5 rounded-lg flex items-center justify-center disabled:opacity-40"
          style={{ background: 'var(--notion-accent)', color: '#fff' }}>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {comments === null ? (
        <p className="text-xs" style={{ color: 'var(--notion-text-3)' }}>Carregando...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs px-2 py-2 rounded-md" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-3)' }}>
          Nenhum comentário ainda.
        </p>
      ) : (
        <div className="space-y-2.5">
          {comments.map(c => {
            const m = member(c.user_id || '')
            const cor = personColor(c.user_id || '')
            return (
              <div key={c.id} className="group/cmt flex gap-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                  style={{ background: `${cor}33`, color: cor, border: `1px solid ${cor}66` }}>
                  {initials(m?.full_name) }
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] flex items-center gap-1.5">
                    <span className="font-medium" style={{ color: 'var(--notion-text)' }}>{m?.full_name || 'Usuário'}</span>
                    <span style={{ color: 'var(--notion-text-3)' }}>
                      {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    {c.user_id === userId && (
                      <button onClick={() => remove(c.id)} title="Excluir comentário"
                        className="opacity-0 group-hover/cmt:opacity-100 p-0.5 rounded" style={{ color: 'var(--notion-text-3)' }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </p>
                  <p className="text-[13px] mt-0.5 px-2 py-1.5 rounded-lg whitespace-pre-wrap break-words"
                    style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>{c.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
