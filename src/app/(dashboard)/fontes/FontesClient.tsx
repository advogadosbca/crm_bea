'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { HeaderAssets } from '@/components/layout/EditableHeader'
import { Database, Plus, ChevronLeft, Table2, Columns3, Rows3, Pencil, Trash2, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Source { id: string; name: string; created_at: string; columns: number; rows: number }

export function FontesClient({ sources, workspaceId, headerAssets }: {
  sources: Source[]; workspaceId: string; headerAssets: HeaderAssets
}) {
  const supabase = createClient()
  const router = useRouter()
  const [renaming, setRenaming] = useState<string | null>(null)
  void headerAssets

  async function createSource() {
    const { data } = await supabase.from('db_tables').insert({ workspace_id: workspaceId, name: 'Nova fonte de dados', position: sources.length }).select('id').single()
    if (data) {
      await supabase.from('db_columns').insert({ table_id: data.id, name: 'Nome', type: 'text', position: 0, config: {} })
      router.push(`/tabelas?t=${data.id}`)
    }
  }
  async function rename(id: string, name: string) {
    setRenaming(null)
    await supabase.from('db_tables').update({ name }).eq('id', id)
    router.refresh()
  }
  async function remove(id: string) {
    if (!confirm('Excluir esta fonte de dados e todos os seus registros? Relações que apontam para ela ficarão vazias.')) return
    await supabase.from('db_tables').delete().eq('id', id)
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Fonte de dados" icon={Database} color="#22D3EE"
        gradient="linear-gradient(135deg, #083344 0%, #155e75 60%, #083344 100%)" />
      <div className="px-16 py-6">
        <div className="flex items-center gap-2 mb-6 text-xs" style={{ color: 'var(--notion-text-3)' }}>
          <Link href="/" className="hover:text-[var(--notion-text-2)] flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Início</Link>
          <span>/</span><span style={{ color: 'var(--notion-text-2)' }}>Fonte de dados</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm" style={{ color: 'var(--notion-text-2)' }}>
            Fontes que podem ser referenciadas por colunas do tipo <b>Relação</b> e agregadas por <b>Rollup</b>.
          </p>
          <button onClick={createSource}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
            style={{ background: 'var(--notion-accent)', color: '#fff' }}>
            <Plus className="w-3.5 h-3.5" /> Nova fonte de dados
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.length === 0 ? (
            <div className="col-span-full text-center py-16 text-sm" style={{ color: 'var(--notion-text-3)' }}>
              Nenhuma fonte de dados. Crie a primeira para usar Relação/Rollup.
            </div>
          ) : sources.map(s => (
            <div key={s.id} className="rounded-xl p-4 border animate-fade-in transition-all hover:border-[var(--notion-accent)]"
              style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.12)' }}>
                  <Table2 className="w-4 h-4" style={{ color: '#22D3EE' }} />
                </div>
                <div className="min-w-0 flex-1">
                  {renaming === s.id ? (
                    <input autoFocus defaultValue={s.name}
                      onBlur={e => rename(s.id, e.target.value.trim() || s.name)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }}
                      className="w-full px-1.5 py-0.5 rounded text-sm outline-none" style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)', border: '1px solid var(--notion-accent)' }} />
                  ) : (
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--notion-text)' }}>{s.name}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--notion-text-3)' }}>
                    <span className="inline-flex items-center gap-1"><Columns3 className="w-3 h-3" /> {s.columns}</span>
                    <span className="inline-flex items-center gap-1"><Rows3 className="w-3 h-3" /> {s.rows}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--notion-border)' }}>
                <Link href={`/tabelas?t=${s.id}`} className="inline-flex items-center gap-1 text-xs hover:text-[var(--notion-accent)] transition-colors" style={{ color: 'var(--notion-text-2)' }}>
                  <ExternalLink className="w-3 h-3" /> Abrir
                </Link>
                <div className="flex items-center gap-1">
                  <button onClick={() => setRenaming(s.id)} className="p-1 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: 'var(--notion-text-3)' }}><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(s.id)} className="p-1 rounded hover:bg-[var(--notion-bg-3)]" style={{ color: '#F87171' }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
