'use client'

import { createContext, useContext } from 'react'
import { podeVerAba, PermissoesAbas } from '@/lib/abas'
import { setSomenteLeitura } from '@/lib/supabase'

/**
 * Papel do usuário logado disponível para qualquer componente cliente.
 * Usado, por exemplo, para mostrar o botão "Somente admins" no menu das colunas.
 */
const RoleContext = createContext<{ role: string; abas: PermissoesAbas }>({ role: 'colaborador', abas: {} })

export function RoleProvider({ role, abas = {}, children }: { role: string; abas?: PermissoesAbas; children: React.ReactNode }) {
  // liga a trava de gravação do cliente Supabase antes de qualquer filho montar
  setSomenteLeitura(role === 'visualizador')
  return <RoleContext.Provider value={{ role, abas }}>{children}</RoleContext.Provider>
}

export const useRole = () => useContext(RoleContext).role
export const useIsAdmin = () => ['admin', 'super_admin'].includes(useContext(RoleContext).role)
/** visualizador: enxerga tudo que tem acesso, não cria/edita/exclui nada */
export const useSomenteLeitura = () => useContext(RoleContext).role === 'visualizador'
export function usePodeVerAba() {
  const { role, abas } = useContext(RoleContext)
  return (slug: string) => podeVerAba(role, abas, slug)
}
