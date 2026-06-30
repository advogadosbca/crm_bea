import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const FIELD: Record<string, string> = {
  funil: 'funil_status',
  negociacao: 'status_geral',
  acoes: 'status_processual',
}

async function ctx() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single()
  return { supabase, workspaceId: profile?.workspace_id as string | undefined }
}

// criar coluna
export async function POST(req: Request) {
  const c = await ctx()
  if (!c?.workspaceId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { board_key, label, color } = await req.json()
  if (!board_key || !label) return NextResponse.json({ error: 'Faltam campos' }, { status: 400 })

  const { data: max } = await c.supabase.from('kanban_columns')
    .select('position').eq('workspace_id', c.workspaceId).eq('board_key', board_key)
    .order('position', { ascending: false }).limit(1).maybeSingle()
  const position = (max?.position ?? -1) + 1

  const { error } = await c.supabase.from('kanban_columns').insert({
    workspace_id: c.workspaceId, board_key, label, color: color || '#94A3B8', position,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// editar (renomear / cor) — renomear faz cascade nos contatos
export async function PATCH(req: Request) {
  const c = await ctx()
  if (!c?.workspaceId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id, board_key, label, color, oldLabel } = await req.json()

  const patch: Record<string, unknown> = {}
  if (label !== undefined) patch.label = label
  if (color !== undefined) patch.color = color
  const { error } = await c.supabase.from('kanban_columns').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // cascade: atualiza contatos que tinham o valor antigo
  if (label && oldLabel && label !== oldLabel) {
    const field = FIELD[board_key]
    if (field) {
      await c.supabase.from('contacts').update({ [field]: label })
        .eq('workspace_id', c.workspaceId).eq(field, oldLabel)
    }
  }
  return NextResponse.json({ ok: true })
}

// excluir coluna (cards perdem o valor -> field = null)
export async function DELETE(req: Request) {
  const c = await ctx()
  if (!c?.workspaceId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id, board_key, label } = await req.json()

  const field = FIELD[board_key]
  if (field && label) {
    await c.supabase.from('contacts').update({ [field]: null })
      .eq('workspace_id', c.workspaceId).eq(field, label)
  }
  const { error } = await c.supabase.from('kanban_columns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
