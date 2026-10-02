import { redirect } from 'next/navigation'
import { getAuthProfile } from '@/lib/auth'
import { podeVerAba } from '@/lib/abas'

export default async function FinanceiroPage() {
  const { supabase, profile } = await getAuthProfile()
  if (!podeVerAba(profile?.role, profile?.abas, 'financeiro')) return null // o layout mostra o cadeado

  const { data } = await supabase
    .from('db_tables').select('module_key')
    .like('module_key', 'fin-%').order('position').limit(1)
  const slug = (data?.[0]?.module_key as string | undefined)?.replace('fin-', '') || 'adv-entradas'
  redirect(`/financeiro/${slug}`)
}
