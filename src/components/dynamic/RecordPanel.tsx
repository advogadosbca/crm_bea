'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DataSource, DBRow, SelectOption, COLUMN_TYPES, recordTitle, CHAVE_TITULO } from '@/types/dynamic'
import { Cell } from './Cell'
import { TypeIcon } from './TypePicker'
import { RecordTasks } from '@/components/board/RecordTasks'
import { RecordComments } from './RecordComments'
import { X, ChevronLeft } from 'lucide-react'

interface Member { id: string; full_name: string }

/**
 * Título do painel: mostra o nome herdado (do cliente relacionado) e aceita um
 * texto próprio por cima.
 *
 * Apagar o campo não deixa o registro sem cabeçalho — grava nulo e o título
 * volta a seguir o cliente. É o que faz o "puxar sempre do cliente" continuar
 * valendo depois de alguém experimentar um título e se arrepender.
 */
function TituloRegistro({ titulo, proprio, onSalvar }: {
  titulo: string
  /** true = o texto atual foi escrito à mão; false = veio do registro relacionado */
  proprio: boolean
  onSalvar: (valor: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(titulo)

  // o título derivado muda quando o cliente muda; sem isso o campo ficaria
  // preso ao valor de quando o painel abriu
  useEffect(() => { if (!editando) setTexto(titulo) }, [titulo, editando])

  function confirmar() {
    setEditando(false)
    const limpo = texto.trim()
    if (limpo === titulo.trim()) return   // nada mudou de fato: não grava à toa
    onSalvar(limpo)                       // vazio grava nulo e volta a herdar
  }

  if (editando) {
    return (
      <input autoFocus value={texto} onChange={e => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') { setTexto(titulo); setEditando(false) }
        }}
        placeholder="Título do registro"
        className="w-full text-xl font-semibold leading-snug outline-none rounded px-1 -mx-1"
        style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)' }} />
    )
  }

  return (
    <h2 onClick={() => setEditando(true)}
      title={proprio ? 'Título editado à mão — clique para alterar' : 'Herdado do cliente — clique para escrever outro'}
      className="text-xl font-semibold leading-snug break-words cursor-text rounded px-1 -mx-1 hover:bg-[var(--notion-bg-3)]"
      style={{ color: 'var(--notion-text)' }}>
      {titulo}
    </h2>
  )
}

/**
 * Painel lateral de detalhe de um registro (estilo "peek" do Notion).
 * Abre ao clicar num chip de relação e mostra TODOS os campos da linha,
 * reaproveitando a <Cell> em modo somente-leitura. Relações dentro do painel
 * são clicáveis e navegam para o próximo registro (pilha com botão "voltar").
 */
export function RecordPanel({ record, sources, members, userId, onClose, onSaveField, onUpdateOptions }: {
  record: { source: DataSource; row: DBRow }
  sources: DataSource[]
  members: Member[]
  /** autor dos comentários deixados no painel */
  userId: string
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
              <TituloRegistro
                key={row.id}
                titulo={recordTitle(row, src, sources)}
                proprio={typeof row.data[CHAVE_TITULO] === 'string' && !!(row.data[CHAVE_TITULO] as string).trim()}
                onSalvar={v => onSaveField(src.id, row.id, CHAVE_TITULO, v || null)}
              />
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
              <RecordComments rowId={row.id} userId={userId} members={members} compact />
            </div>
          </>
        )}
      </aside>
    </>,
    document.body,
  )
}
