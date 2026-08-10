import { DBColumn } from '@/types/dynamic'

/** Checkbox dos leads que marca "virou cliente". Deve bater com o GATILHO da rota. */
export const COLUNA_GATILHO = 'Contrato Assinado'

/** true quando a edição em questão é a marcação que promove o lead */
export function disparaPromocao(col: DBColumn | undefined, value: unknown): boolean {
  return !!col && col.type === 'checkbox' && col.name === COLUNA_GATILHO && value === true
}

export type ResultadoPromocao = { texto: string; tipo: 'ok' | 'erro' } | null

/**
 * Chama a rota que cria/vincula o cliente. Devolve a mensagem pronta para exibir,
 * ou null quando não havia nada a fazer (o servidor decide se o gatilho vale).
 */
export async function promoverLead(rowId: string): Promise<ResultadoPromocao> {
  try {
    const r = await fetch('/api/leads/promover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowId }),
    })
    const j = await r.json()
    if (!r.ok) return { texto: j.error || 'Não foi possível criar o cliente.', tipo: 'erro' }

    const nome = j.nome ? ` "${j.nome}"` : ''
    if (j.status === 'criado') return { texto: `Cliente${nome} criado na tabela Clientes.`, tipo: 'ok' }
    if (j.status === 'vinculado') {
      return j.ambiguo
        ? { texto: `Há mais de um cliente com este telefone. Vinculei ao mais antigo${nome} — confira se é o correto.`, tipo: 'erro' }
        : { texto: `Já existia um cliente${nome} com este telefone — lead vinculado a ele.`, tipo: 'ok' }
    }
    return null // 'ignorado' ou 'ja_vinculado': nada a comunicar
  } catch {
    return { texto: 'Falha de rede ao criar o cliente.', tipo: 'erro' }
  }
}
