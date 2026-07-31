'use client'

import { createContext, useContext } from 'react'

/**
 * Papel do usuário logado disponível para qualquer componente cliente.
 * Usado, por exemplo, para mostrar o botão "Somente admins" no menu das colunas.
 */
const RoleContext = createContext<string>('colaborador')

export function RoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}

export const useRole = () => useContext(RoleContext)
export const useIsAdmin = () => ['admin', 'super_admin'].includes(useContext(RoleContext))
