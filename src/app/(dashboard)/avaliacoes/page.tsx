import { getAuthProfile } from '@/lib/auth'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { AvaliacoesClient } from './AvaliacoesClient'
import { Lock, ClipboardCheck } from 'lucide-react'

export default async function AvaliacoesPage() {
  const { supabase, profile, user } = await getAuthProfile()
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)' }}>
          <Lock className="w-7 h-7" style={{ color: 'var(--notion-text-3)' }} />
        </div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--notion-text)' }}>Acesso restrito</h1>
        <p className="text-sm mt-2 max-w-sm" style={{ color: 'var(--notion-text-2)' }}>
          Você não tem acesso a este módulo. <b>Avaliações</b> é restrito a administradores.
        </p>
      </div>
    )
  }

  const ws = profile?.workspace_id || ''

  const [{ data: cardsFeitos }, { data: avaliacoes }, { data: members }, { data: cardMembers }] = await Promise.all([
    supabase.from('board_cards').select('id, title, due_date, encerrado_em')
      .eq('workspace_id', ws).eq('completed', true).order('encerrado_em', { ascending: false }),
    supabase.from('avaliacoes_entrega').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('workspace_id', ws),
    supabase.from('board_card_members').select('card_id, profile_id'),
  ])

  const membroPorId = new Map((members || []).map(m => [m.id as string, m.full_name as string]))
  const membrosDoCard = new Map<string, string[]>()
  for (const cm of cardMembers || []) {
    const arr = membrosDoCard.get(cm.card_id as string) || []
    arr.push(cm.profile_id as string)
    membrosDoCard.set(cm.card_id as string, arr)
  }

  const avaliadosCardIds = new Set((avaliacoes || []).map(a => a.card_id as string))

  const pendentes = (cardsFeitos || [])
    .filter(c => !avaliadosCardIds.has(c.id as string))
    .map(c => ({
      id: c.id as string,
      title: c.title as string,
      due_date: c.due_date as string | null,
      encerrado_em: c.encerrado_em as string | null,
      membros: (membrosDoCard.get(c.id as string) || []).map(id => ({ id, full_name: membroPorId.get(id) || 'Sem nome' })),
    }))
    .filter(c => c.membros.length > 0)

  const cardTituloPorId = new Map((cardsFeitos || []).map(c => [c.id as string, c.title as string]))

  const feitas = (avaliacoes || []).map(a => ({
    id: a.id as string,
    card_id: a.card_id as string,
    avaliado_id: a.avaliado_id as string,
    entrega_no_prazo: a.entrega_no_prazo as number,
    quantidade_correcao: a.quantidade_correcao as number,
    observacao: a.observacao as string | null,
    created_at: a.created_at as string,
    cardTitulo: cardTituloPorId.get(a.card_id as string) || '(tarefa removida)',
    avaliadoNome: membroPorId.get(a.avaliado_id as string) || 'Sem nome',
  }))

  return (
    <div className="min-h-screen">
      <ModuleHeader title="Avaliações" icon={ClipboardCheck} color="#A78BFA"
        gradient="linear-gradient(135deg, #2e1065 0%, #4c1d95 60%, #2e1065 100%)" />
      <div className="px-16 py-6">
        <AvaliacoesClient pendentes={pendentes} feitas={feitas}
          members={members || []} workspaceId={ws} avaliadorId={user?.id || ''} />
      </div>
    </div>
  )
}
