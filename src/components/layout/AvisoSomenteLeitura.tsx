'use client'

import { useEffect } from 'react'
import { Aviso, useAviso } from '@/components/ui/Aviso'
import { EVENTO_SOMENTE_LEITURA } from '@/lib/supabase'
import { useSomenteLeitura } from './RoleProvider'

/**
 * Avisa o visualizador quando alguma ação tentou gravar (a trava do cliente
 * Supabase dispara o evento). Cobre os botões que escaparam de ser escondidos.
 */
export function AvisoSomenteLeitura() {
  const somenteLeitura = useSomenteLeitura()
  const { msg, mostrar } = useAviso()

  useEffect(() => {
    if (!somenteLeitura) return
    const avisar = () => mostrar({ texto: 'Seu acesso é somente de visualização — nada foi alterado.', tipo: 'erro' })
    window.addEventListener(EVENTO_SOMENTE_LEITURA, avisar)
    return () => window.removeEventListener(EVENTO_SOMENTE_LEITURA, avisar)
  }, [somenteLeitura, mostrar])

  return <Aviso msg={msg} onClose={() => mostrar(null)} />
}
