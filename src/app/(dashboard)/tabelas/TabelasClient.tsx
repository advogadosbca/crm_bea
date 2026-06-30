'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { HeaderAssets } from '@/components/layout/EditableHeader'
import { DynamicTable } from '@/components/dynamic/DynamicTable'
import { DBColumn, DBRow, DBTable, DataSource } from '@/types/dynamic'
import { Table2, Plus, ChevronLeft, MoreHorizontal, Trash2, Pencil } from 'lucide-react'
import Link from 'next/link'

export function TabelasClient({ tables, activeId, columns, rows, sources, members, workspaceId, userId, headerAssets }: {
  tables: DBTable[]; activeId: string; columns: DBColumn[]; rows: DBRow[]; sources: DataSource[]
  members: { id: string; full_name: string }[]; workspaceId: string; userId: string; headerAssets: HeaderAssets
}) {
  const supabase = createClient()
  const router = useRouter()
  const active = activeId
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  async function createTable() {
    const { data } = await supabase.from('db_tables').insert({ workspace_id: workspaceId, name: 'Nova tabela', position: tables.length }).select('*').single()
    if (data) {
      // cria uma coluna inicial
      await supabase.from('db_columns').insert({ table_id: data.id, name: 'Nome', type: 'text', position: 0, config: {} })
      router.refresh()
    }
  }
  async function renameTable(id: string, name: string) {
    setRenaming(null)
    await supabase.from('db_tables').update({ name }).eq('id', id)
    router.refresh()
  }
  async function deleteTable(id: string) {
    if (!confirm('Excluir esta tabela e todos os seus dados?')) return
    setMenu(false)
    await supabase.from('db_tables').delete().eq('id', id)
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Tabelas" icon={Table2} color="#60A5FA"
        gradient="linear-gradient(135deg, #0c2a4d 0%, #1e3a5f 60%, #0c2a4d 100%)" />
      <div className="px-16 py-6">
        <div className="flex items-center gap-2 mb-6 text-xs" style={{ color: 'var(--notion-text-3)' }}>
          <Link href="/" className="hover:text-[var(--notion-text-2)] flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Início</Link>
          <span>/</span><span style={{ color: 'var(--notion-text-2)' }}>Tabelas</span>
        </div>

        {/* Seletor de tabelas */}
        <div className="flex items-center gap-1 mb-4 border-b pb-2" style={{ borderColor: 'var(--notion-border)' }}>
          {tables.map(t => (
            <div key={t.id} className="relative">
              {renaming === t.id ? (
                <input autoFocus defaultValue={t.name}
                  onBlur={e => renameTable(t.id, e.target.value.trim() || t.name)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }}
                  className="px-2 py-1 rounded text-sm outline-none w-32" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
              ) : (
                <button onClick={() => { if (t.id !== active) router.push(`/tabelas?t=${t.id}`) }}
                  onDoubleClick={() => setRenaming(t.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors"
                  style={{ background: active === t.id ? 'var(--notion-bg-3)' : 'transparent', color: active === t.id ? 'var(--notion-text)' : 'var(--notion-text-2)' }}>
                  <Table2 className="w-3.5 h-3.5" /> {t.name}
                  {active === t.id && (
                    <span onClick={e => { e.stopPropagation(); setMenu(!menu) }} className="p-0.5 rounded hover:bg-[var(--notion-bg-4)]">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              )}
              {menu && active === t.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                  <div className="absolute left-0 top-9 z-50 w-40 rounded-lg p-1 shadow-xl" style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
                    <button onClick={() => { setRenaming(t.id); setMenu(false) }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: 'var(--notion-text)' }}><Pencil className="w-3.5 h-3.5" /> Renomear</button>
                    <button onClick={() => deleteTable(t.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[var(--notion-bg-4)]" style={{ color: '#F87171' }}><Trash2 className="w-3.5 h-3.5" /> Excluir</button>
                  </div>
                </>
              )}
            </div>
          ))}
          <button onClick={createTable} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm transition-colors hover:bg-[var(--notion-bg-2)]" style={{ color: 'var(--notion-text-3)' }}>
            <Plus className="w-3.5 h-3.5" /> Nova tabela
          </button>
        </div>

        {tables.length === 0 ? (
          <div className="text-center py-20 text-sm" style={{ color: 'var(--notion-text-3)' }}>
            Nenhuma tabela ainda. Clique em <span className="font-medium">Nova tabela</span> para começar.
          </div>
        ) : (
          <DynamicTable key={active} tableId={active} initialColumns={columns} initialRows={rows} sources={sources} members={members} userId={userId} />
        )}
      </div>
    </div>
  )
}
