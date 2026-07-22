'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CheckCircle2, Ban, Clock, ListTodo } from 'lucide-react'

interface Task {
  id: string
  title: string
  due_date: string | null
  completed: boolean
  list: string
  state: 'open' | 'done' | 'canceled'
}

/**
 * Tarefas do Quadro vinculadas a este registro (cliente).
 * O vínculo é feito no cartão pelo botão "Cliente", que grava em board_activity
 * (kind 'contact') o id da linha. Tarefas concluídas ou canceladas saem da lista
 * — ficam só no contador do rodapé.
 */
export function RecordTasks({ rowId }: { rowId: string }) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[] | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      // cartões que citam este registro no vínculo de cliente
      const { data: links } = await supabase.from('board_activity')
        .select('card_id').eq('kind', 'contact').like('text', `%"contactId":"${rowId}"%`)
      const ids = [...new Set((links || []).map(l => l.card_id as string))]
      if (!ids.length) { if (vivo) setTasks([]); return }

      const [{ data: cards }, { data: lists }, { data: status }] = await Promise.all([
        supabase.from('board_cards').select('id, title, due_date, completed, list_id').in('id', ids),
        supabase.from('board_lists').select('id, title'),
        supabase.from('board_activity').select('card_id, text').eq('kind', 'status').in('card_id', ids),
      ])
      const listName = new Map((lists || []).map(l => [l.id as string, l.title as string]))
      const stateOf = new Map((status || []).map(s => [s.card_id as string, s.text as string]))
      const out: Task[] = (cards || []).map(c => ({
        id: c.id as string,
        title: (c.title as string) || '(sem título)',
        due_date: (c.due_date as string) || null,
        completed: !!c.completed,
        list: listName.get(c.list_id as string) || '',
        state: !c.completed ? 'open' : (stateOf.get(c.id as string) === 'canceled' ? 'canceled' : 'done'),
      }))
      out.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
      if (vivo) setTasks(out)
    })()
    return () => { vivo = false }
  }, [rowId, supabase])

  if (!tasks || tasks.length === 0) return null

  const abertas = tasks.filter(t => t.state === 'open')
  const fechadas = tasks.length - abertas.length
  const hoje = new Date().toISOString().split('T')[0]

  return (
    <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--notion-border)' }}>
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium mb-2" style={{ color: 'var(--notion-text)' }}>
        <ListTodo className="w-3.5 h-3.5" /> Tarefas
        <span className="text-[11px] font-normal" style={{ color: 'var(--notion-text-3)' }}>· {abertas.length} em aberto</span>
      </h3>

      {abertas.length === 0 ? (
        <p className="text-xs px-2 py-2 rounded-md" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-3)' }}>
          Nenhuma tarefa em aberto.
        </p>
      ) : (
        <div className="space-y-1">
          {abertas.map(t => {
            const atrasada = !!t.due_date && t.due_date.split('T')[0] < hoje
            return (
              <div key={t.id} className="flex items-start gap-2 px-2.5 py-2 rounded-md"
                style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] truncate" style={{ color: 'var(--notion-text)' }}>{t.title}</span>
                  <span className="flex items-center gap-2 mt-0.5">
                    {t.list && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-3)' }}>{t.list}</span>}
                    {t.due_date && (
                      <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: atrasada ? '#F87171' : 'var(--notion-text-3)' }}>
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(t.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        {atrasada && ' · atrasada'}
                      </span>
                    )}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {fechadas > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] mt-2 px-1" style={{ color: 'var(--notion-text-3)' }}>
          <CheckCircle2 className="w-3 h-3" />
          {tasks.filter(t => t.state === 'done').length} concluída(s)
          <Ban className="w-3 h-3 ml-1" />
          {tasks.filter(t => t.state === 'canceled').length} cancelada(s)
        </p>
      )}
    </div>
  )
}
