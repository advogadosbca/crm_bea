/**
 * Leitura completa de tabelas grandes do PostgREST.
 *
 * O PostgREST de produção está com `db-max-rows = 1000`: ele corta QUALQUER
 * resposta em mil linhas, e corta calado — vem status 200, sem erro, só com
 * menos dado. `.limit(100000)` não adianta nada, porque o teto do servidor é
 * aplicado depois do limite pedido pelo cliente.
 *
 * O estrago é silencioso e some no meio do sistema: em 08/09/2026 a /geral
 * pedia as linhas de todas as tabelas dinâmicas de uma vez (3508 linhas) e
 * recebia 1000 — faltavam 305 dos 436 processos judiciais, e por isso o cartão
 * de tarefa abria sem os processos ativos do cliente. O mesmo teto zera parte
 * dos lançamentos do Financeiro e do Dashboard.
 *
 * Aqui a resposta é paginada até o fim, em faixas de mil.
 */

/** Quanto o PostgREST devolve por resposta. Mudou no servidor? Mude aqui. */
export const TETO_POSTGREST = 1000

/** Trava de segurança: nenhuma tabela do CRM chega perto disso. */
const MAX_PAGINAS = 200

type Resposta<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Roda a mesma consulta em faixas até o banco parar de mandar linha.
 *
 * O `criarFaixa` recebe o intervalo e devolve a query já montada — assim cada
 * chamador aplica os próprios filtros e este helper serve tanto para o cliente
 * do navegador quanto para o do servidor e o de service role.
 *
 * IMPORTANTE: a query precisa de uma ordenação ESTÁVEL, senão o banco pode
 * devolver a mesma linha em duas faixas (e perder outra). `position` sozinho
 * não serve — várias linhas compartilham o mesmo número. Por isso os chamadores
 * ordenam por `position` E por `id`.
 */
export async function fetchAllRows<T>(
  criarFaixa: (de: number, ate: number) => PromiseLike<Resposta<T>>,
): Promise<T[]> {
  const tudo: T[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * TETO_POSTGREST
    const { data, error } = await criarFaixa(de, de + TETO_POSTGREST - 1)
    if (error) throw new Error(`db_rows (faixa ${de}): ${error.message}`)
    const lote = data || []
    tudo.push(...lote)
    // lote incompleto = acabou. Uma faixa cheia pode ser a última, e nesse caso
    // a próxima volta vazia e encerra o laço.
    if (lote.length < TETO_POSTGREST) break
  }
  return tudo
}
