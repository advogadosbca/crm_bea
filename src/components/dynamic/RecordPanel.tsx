'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DataSource, DBRow, SelectOption, COLUMN_TYPES, primaryValue } from '@/types/dynamic'
import { Cell } from './Cell'
import { TypeIcon } from './TypePicker'
import { RecordTasks } from '@/components/board/RecordTasks'
import { X, ChevronLeft } from 'lucide-react'

interface Member { id: string; full_name: string }

/**
 * Painel lateral de detalhe de um registro (estilo "peek" do Notion).
 * Abre ao clicar num chip de relação e mostra TODOS os campos da linha,
 * reaproveitando a <Cell> em modo somente-leitura. Relações dentro do painel
 * são clicáveis e navegam para o próximo registro (pilha com botão "voltar").
 */
export function RecordPanel({ record, sources, members, onClose, onSaveField, onUpdateOptions }: {
  record: { source: DataSource; row: DBRow }
  sources: DataSource[]
  members: Member[]
  onClose: () => void
  /** salva um campo do registro relacionado na tabela de origem */
  onSaveField: (sourceId: string, rowId: string, colId: string, value: unknown) => void
  /** cria/edita opções de uma coluna select/status da tabela de origem */
  onUpdateOptions: (sourceId: string, colId: string, options: SelectOption[]) => void
}) {
  const [stack, setStack] = useState<{ sourceId: string; rowId: string }[]>([
    { sourceId: record.source.id, rowId: record.row.id },
  ])

  // ao abrir um novo registro a partir da tabela, reinicia a navegação
  useEffect(() => {
    setStack([{ sourceId: record.source.id, rowId: record.row.id }])
  }, [record.source.id, record.row.id])

  // fecha com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const current = stack[stack.length - 1]
  const src = sources.find(s => s.id === current.sourceId)
  const row = src?.rows.find(r => r.id === current.rowId)
  const cols = src ? [...src.columns].sort((a, b) => a.position - b.position) : []

  function openNested(s: DataSource, r: DBRow) {
    setStack(st => [...st, { sourceId: s.id, rowId: r.id }])
  }

  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 10000, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full flex flex-col shadow-2xl"
        style={{ zIndex: 10001, width: 'min(460px, 100vw)', background: 'var(--notion-bg-2)', borderLeft: '1px solid var(--notion-border)' }}
        onClick={e => e.stopPropagation()}>

        {/* cabeçalho */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--notion-border)' }}>
          {stack.length > 1 && (
            <button onClick={() => setStack(st => st.slice(0, -1))} title="Voltar"
              className="p-1 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-2)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-[11px] px-1.5 py-0.5 rounded truncate" style={{ background: 'var(--notion-bg-4)', color: 'var(--notion-text-3)' }}>
            {src?.name || 'Registro'}
          </span>
          <div className="flex-1" />
          <button onClick={onClose} title="Fechar" className="p-1 rounded hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {!src || !row ? (
          <div className="flex-1 flex items-center justify-center text-sm px-6 text-center" style={{ color: 'var(--notion-text-3)' }}>
            Registro não encontrado (pode ter sido removido).
          </div>
        ) : (
          <>
            {/* título */}
            <div className="px-5 pt-5 pb-3 flex-shrink-0">
              <h2 className="text-xl font-semibold leading-snug break-words" style={{ color: 'var(--notion-text)' }}>
                {primaryValue(row, src.columns)}
              </h2>
            </div>

            {/* campos + tarefas vinculadas */}
            <div className="flex-1 overflow-y-auto px-3 pb-10">
              {cols.map(col => (
                <div key={col.id} className="flex items-start gap-2 py-px">
                  <div className="flex items-center gap-1.5 pt-2 flex-shrink-0" style={{ width: 150, color: 'var(--notion-text-3)' }}>
                    <TypeIcon icon={col.config.icon || COLUMN_TYPES.find(t => t.type === col.type)?.icon || 'Type'} className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-[13px] truncate" title={col.name}>{col.name}</span>
                  </div>
                  <div className="flex-1 min-w-0 rounded transition-colors hover:bg-[var(--notion-bg-3)]">
                    <Cell
                      column={col}
                      value={row.data[col.id]}
                      members={members}
                      rowMeta={{ created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by ?? undefined, updated_by: row.updated_by ?? undefined }}
                      onChange={v => onSaveField(src.id, row.id, col.id, v)}
                      onUpdateOptions={opts => onUpdateOptions(src.id, col.id, opts)}
                      sources={sources}
                      row={row}
                      tableColumns={src.columns}
                      onOpenRecord={openNested}
                    />
                  </div>
                </div>
              ))}
              <RecordTasks rowId={row.id} />
            </div>
          </>
        )}
      </aside>
    </>,
    document.body,
  )
}
