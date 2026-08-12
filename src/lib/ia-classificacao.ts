import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Classificação das comunicações processuais pelo Gemini.
 *
 * O modelo LÊ e EXTRAI; ele não decide nem calcula:
 *   - não cria tarefa (o advogado aprova em /novidades);
 *   - não calcula data de prazo (quem faz é src/lib/prazos.ts, com dia útil);
 *   - não fala com o cliente (passo separado e explícito).
 *
 * Regra de ouro do `trecho`: toda extração precisa vir acompanhada da citação
 * literal que a sustenta. Serve para o advogado conferir em três segundos, e
 * funciona como trava — se o modelo não consegue citar, ele inventou.
 *
 * A classificação NUNCA bloqueia a novidade: qualquer falha aqui é gravada em
 * `classificacao_erro` e a comunicação aparece na caixa mesmo assim, crua.
 */

export const TIPOS = [
  'audiencia', 'pericia', 'prazo', 'sentenca', 'acordao',
  'alvara', 'despacho', 'arquivamento', 'outro',
] as const
export type TipoComunicacao = (typeof TIPOS)[number]

export interface Classificacao {
  acao_necessaria: boolean
  tipo: TipoComunicacao
  resumo: string
  evento_data: string | null
  evento_hora: string | null
  prazo_dias: number | null
  prazo_contagem: 'uteis' | 'corridos' | null
  relevante_para_cliente: boolean
  confianca: 'alta' | 'media' | 'baixa'
  trecho: string
}

const INSTRUCAO = `Você lê comunicações processuais do Diário de Justiça Eletrônico Nacional (DJEN) brasileiro e extrai dados estruturados para o CRM de um escritório de advocacia.

O que você faz: LER e EXTRAIR. Você não decide nada e não calcula datas de prazo.

REGRAS

1. \`trecho\`: cite LITERALMENTE o pedaço do texto que sustenta a sua extração principal (a data da audiência, o número de dias do prazo, o teor da decisão). Copie palavra por palavra, sem parafrasear. Se você não conseguir localizar um trecho literal que sustente o que extraiu, deixe o campo correspondente nulo e marque \`confianca\` como "baixa".

2. \`prazo_dias\`: apenas o NÚMERO de dias que o próprio texto informa ("no prazo de 15 dias" -> 15). NUNCA calcule a data final do prazo — quem faz isso é o sistema, com calendário de dias úteis. Se o texto não informa prazo, deixe nulo.

3. \`prazo_contagem\`: "uteis" quando for processo civil comum (o padrão do CPC), "corridos" quando o texto disser expressamente que são dias corridos ou for matéria com contagem contínua. Na dúvida, "uteis".

4. \`evento_data\` / \`evento_hora\`: só quando houver data designada no texto (audiência, perícia, sessão). Formato YYYY-MM-DD e HH:MM. Não invente ano: se o texto trouxer só dia e mês, use o ano da publicação informado no cabeçalho. Sem data designada, nulo.

5. \`acao_necessaria\`: false para comunicação de mero expediente, ato ordinatório, juntada, ciência sem providência. true quando alguém do escritório precisa fazer algo (cumprir prazo, comparecer, manifestar-se, recorrer, levantar alvará). Na prática a maioria das comunicações é informativa — não force ação onde não há.

6. \`relevante_para_cliente\`: true só quando o cliente tem interesse direto e compreensível no fato (audiência marcada, sentença, acordo, valor a receber, alvará). false para movimentação interna do processo. Isto é uma sugestão: quem decide se avisa o cliente é o advogado.

7. \`resumo\`: uma frase em português claro, no máximo 160 caracteres, do jeito que você explicaria a um colega — sem juridiquês, sem repetir o texto.

Responda somente com o JSON no formato pedido.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    acao_necessaria: { type: 'BOOLEAN' },
    tipo: { type: 'STRING', enum: [...TIPOS] },
    resumo: { type: 'STRING' },
    evento_data: { type: 'STRING', nullable: true },
    evento_hora: { type: 'STRING', nullable: true },
    prazo_dias: { type: 'INTEGER', nullable: true },
    prazo_contagem: { type: 'STRING', enum: ['uteis', 'corridos'], nullable: true },
    relevante_para_cliente: { type: 'BOOLEAN' },
    confianca: { type: 'STRING', enum: ['alta', 'media', 'baixa'] },
    trecho: { type: 'STRING' },
  },
  required: ['acao_necessaria', 'tipo', 'resumo', 'relevante_para_cliente', 'confianca', 'trecho'],
}

/** Configuração de IA do workspace. Só o servidor lê — a chave nunca sai daqui. */
export async function configIa(admin: SupabaseClient, workspaceId: string) {
  const { data } = await admin.from('workspace_secrets')
    .select('ia_api_key, ia_modelo, ia_provider').eq('workspace_id', workspaceId).maybeSingle()
  const chave = (data?.ia_api_key as string | undefined) || ''
  if (!chave) return null
  return {
    chave,
    modelo: (data?.ia_modelo as string) || 'gemini-2.5-flash',
    provider: (data?.ia_provider as string) || 'gemini',
  }
}

export interface EntradaClassificacao {
  texto: string
  dataPublicacao?: string | null
  tipoDocumento?: string | null
  nomeClasse?: string | null
  orgao?: string | null
  tribunal?: string | null
  partes?: { nome?: string; polo?: string }[]
}

/**
 * O texto vai INTEIRO até um teto generoso. Se estourar, corta o miolo em vez
 * do fim: numa publicação longa a parte final costuma trazer o dispositivo e o
 * prazo, que é justamente o que interessa.
 */
function prepararTexto(texto: string, teto = 24000): string {
  if (texto.length <= teto) return texto
  const metade = Math.floor(teto / 2)
  return `${texto.slice(0, metade)}\n\n[...trecho omitido por tamanho...]\n\n${texto.slice(-metade)}`
}

function montarPrompt(e: EntradaClassificacao): string {
  const cabecalho = [
    e.dataPublicacao ? `Data de publicação: ${e.dataPublicacao}` : null,
    e.tribunal ? `Tribunal: ${e.tribunal}` : null,
    e.orgao ? `Órgão: ${e.orgao}` : null,
    e.nomeClasse ? `Classe: ${e.nomeClasse}` : null,
    e.tipoDocumento ? `Tipo de documento: ${e.tipoDocumento}` : null,
    e.partes?.length ? `Partes: ${e.partes.map(p => `${p.nome}${p.polo ? ` (polo ${p.polo})` : ''}`).join('; ')}` : null,
  ].filter(Boolean).join('\n')

  return `${cabecalho}\n\n--- TEXTO DA COMUNICAÇÃO ---\n${prepararTexto(e.texto)}`
}

/**
 * Chama o Gemini e devolve a classificação, ou lança com mensagem legível.
 * `temperature: 0` porque aqui não se quer criatividade nenhuma — a mesma
 * publicação tem que dar sempre a mesma leitura.
 */
export async function classificar(
  entrada: EntradaClassificacao, cfg: { chave: string; modelo: string },
): Promise<Classificacao> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.modelo)}:generateContent`

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.chave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCAO }] },
      contents: [{ role: 'user', parts: [{ text: montarPrompt(entrada) }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(60000),
  })

  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(corpo?.error?.message || `Gemini respondeu HTTP ${r.status}`)
  }

  const bruto = corpo?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!bruto) {
    const motivo = corpo?.candidates?.[0]?.finishReason || corpo?.promptFeedback?.blockReason
    throw new Error(`resposta vazia do Gemini${motivo ? ` (${motivo})` : ''}`)
  }

  let j: Record<string, unknown>
  try { j = JSON.parse(bruto) } catch { throw new Error('Gemini devolveu JSON inválido') }

  return normalizar(j, entrada)
}

const naData = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const naHora = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null)

/**
 * Confere o que voltou. Duas travas importam:
 *  - `trecho` tem que existir DE VERDADE no texto original (comparação sobre
 *    texto normalizado). Trecho inventado derruba a confiança para "baixa".
 *  - data de evento no passado é descartada: audiência que já aconteceu quase
 *    sempre é o modelo lendo data de protocolo como data designada.
 */
function normalizar(j: Record<string, unknown>, entrada: EntradaClassificacao): Classificacao {
  const nrm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLowerCase().trim()
  const trecho = typeof j.trecho === 'string' ? j.trecho : ''
  const citacaoConfere = !!trecho && nrm(entrada.texto).includes(nrm(trecho).slice(0, 60))

  let confianca = (['alta', 'media', 'baixa'].includes(String(j.confianca)) ? j.confianca : 'baixa') as Classificacao['confianca']
  if (!citacaoConfere) confianca = 'baixa'

  let evento_data = naData(j.evento_data)
  if (evento_data && entrada.dataPublicacao && evento_data < entrada.dataPublicacao) evento_data = null

  const dias = Number(j.prazo_dias)
  const tipo = (TIPOS as readonly string[]).includes(String(j.tipo)) ? j.tipo as TipoComunicacao : 'outro'

  return {
    acao_necessaria: j.acao_necessaria === true,
    tipo,
    resumo: typeof j.resumo === 'string' ? j.resumo.slice(0, 200) : '',
    evento_data,
    evento_hora: evento_data ? naHora(j.evento_hora) : null,
    prazo_dias: Number.isFinite(dias) && dias > 0 && dias <= 365 ? Math.round(dias) : null,
    prazo_contagem: j.prazo_contagem === 'corridos' ? 'corridos' : j.prazo_contagem === 'uteis' ? 'uteis' : null,
    relevante_para_cliente: j.relevante_para_cliente === true,
    confianca,
    trecho: citacaoConfere ? trecho : '',
  }
}
