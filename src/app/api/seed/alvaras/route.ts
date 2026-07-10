import { getAuthProfile } from '@/lib/auth'

// Importação one-shot dos alvarás para a tabela dinâmica "Comunicação de Alvará" (module_key='alvaras').
// Admin visita GET /api/seed/alvaras?confirm=alvaras (logado). Idempotente: dedup por Processo.
// Usa a sessão do próprio admin (RLS permite membros do workspace criar colunas/linhas).

const norm = (s: string) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
const parseData = (s: string) => { const m = (s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
const parseValor = (s: string) => { const n = parseFloat(String(s || '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n }
const uuid = () => crypto.randomUUID()

type Opt = { id: string; label: string; color: string }
const mkOpts = (arr: [string, string][]): Opt[] => arr.map(([label, color]) => ({ id: uuid(), label, color }))

const TARGET: { name: string; type: string; config: { options?: Opt[]; format?: string } }[] = [
  { name: 'Data', type: 'date', config: {} },
  { name: 'Processo', type: 'text', config: {} },
  { name: 'Cliente', type: 'text', config: {} },
  { name: 'Valor', type: 'number', config: { format: 'currency' } },
  { name: 'Observações', type: 'text', config: {} },
  { name: 'Conta', type: 'select', config: { options: mkOpts([['Escritório', '#3B82F6']]) } },
  { name: 'Expedição', type: 'select', config: { options: mkOpts([['Sim', '#10B981'], ['Não', '#EF4444']]) } },
  { name: 'Situação', type: 'status', config: { options: mkOpts([['Recebido', '#10B981'], ['Em andamento', '#F59E0B'], ['Cancelado', '#EF4444']]) } },
]

// [data, processo, cliente, valor, observações, conta, expedição, situação]
const DATA: string[][] = [
  ['15/01/2025', '5010081-61.2021.8.13.0223', 'Vanduil Macedo Araújo Júnior', 'R$ 1.423,66', 'Alvará parcial', 'Escritório', 'Sim', 'Recebido'],
  ['18/02/2025', '5015641-13.2023.8.13.0223', 'Alysson Ribeiro Victor', 'R$ 5.788,79', 'Alvará total', 'Escritório', 'Sim', 'Recebido'],
  ['06/03/2025', '5010867-08.2021.8.13.0223', 'Marta Santos Pereira', 'R$ 1.250,00', 'Alvará parcial', 'Escritório', 'Sim', 'Recebido'],
  ['16/04/2025', '5021075-17.2022.8.13.0223', 'Neusa Mano da Silva', 'R$ 232,14', 'Alvará parcial', 'Escritório', 'Não', 'Em andamento'],
  ['14/05/2025', '5001534-61.2023.8.13.0223', 'MARIA DE LOURDES GUIMARAES', 'R$ 2424,55', 'Alvará total', 'escritório', 'Não', 'Recebido'],
  ['20/05/2025', '5000740-11.2021.8.13.0223', 'Ana Lúcia Barreto Almeida', 'R$ 14.367,11', 'Alvará Total', 'escritório', 'Não', ''],
  ['23/05/2025', '5004609-79.2021.8.13.0223', 'LEANDO AUGUSTO BARBOSA LAGARES', '438,75', 'Alvará parcial', 'escritório', 'Não', ''],
  ['29/05/2025', '5007158-62.2021.8.13.0223', 'Aparecida Silva Pereira', '6823,15', 'Alvará Total', 'escritório', 'Sim', 'Recebido'],
  ['09/06/2025', '5003491-68.2021.8.13.0223', 'ANA PAULA MESQUITA', 'R$ 1.119,95', 'Alvará Parcial', 'escritório', 'Não', 'Em andamento'],
  ['09/06/2025', '5021848-62.2022.8.13.0223', 'FRANCISCO DE ASSIS GARCES CASTRO JR.', 'R$ 310,58', 'Alvará Total', 'escritório', 'Sim', 'Recebido'],
  ['07/07/2025', '5000860-54.2021.8.13.0223', 'TEREZINHA FALEIRO DA FONSECA SILVA', 'R$ 4229,26', 'Alvará parcial', 'escritório', '', ''],
  ['09/07/2025', '5005029-41.2024.8.13.0074', 'NEIDE LUCIA DA SILVA ALVES DE ARAUJO', 'R$ 26190,28', '', '', '', 'Recebido'],
  ['29/07/2025', '5007473-90.2021.8.13.0223', 'HELENA MARIA DE OLIVEIRA', '721,96', 'Alvará parcial', 'Escritório', '', 'Em andamento'],
  ['18/08/2025', '5002683-63.2021.8.13.0223', 'JM Participações', 'R$ 1.903,06', 'Alvará parcial', 'Escritório', 'Não', 'Em andamento'],
  ['21/08/2025', '5005896-98.2023.8.13.0452', 'Deilson Amorim dos reis', '13491,04', '', 'Escritório', 'Não', ''],
  ['28/08/2025', '1007542-10.2024.8.26.0132', 'Hostel Montalbam', 'R$ 5246,43', 'Alvara total', 'Escritório', 'Não', 'Em andamento'],
  ['25/09/2025', '5000040-98.2022.8.13.0223', 'MARCO AURELIO SOARES', 'R$1.049,04', 'alvará parcial', 'Escritório', 'Não', ''],
  ['21/10/2025', '5001978-31.2022.8.13.0223', 'LUCIA RITA DE PAULA', 'R$ 10.383,64', 'alvará parcial', 'Escritório', 'Não', 'Em andamento'],
  ['23/10/2025', '5000624-63.2025.8.13.0514', 'Sérgio Samuel', 'R$ 11.927,79', 'alavará total', 'Escritório', 'Sim', 'Recebido'],
  ['27/10/2025', '5021121-06.2022.8.13.0223', 'ANA CLEMENTINA DE ANDRADE', 'R$ 2.792,21', 'alvará parcial', 'Escritório', 'Não', ''],
  ['09/12/2025', '5014528-92.2021.8.13.0223', 'RAFAELA ARANTES E SILVA', 'R$ 531,25', 'alvará parcial', 'Escritório', 'Não', ''],
  ['15/12/2025', '5024308-85.2023.8.13.0223', 'MARCO ANTONIO GOMES DE SOUSA', 'R$ 1.794,44', 'alvará parcial', 'Escritório', 'Não', ''],
  ['16/01/2025', '5010564-91.2021.8.13.0223', 'ANTONIA HELENA DE PAULA SANTOS', 'R$ 5.536,62', 'alvará parcial', 'Escritório', 'Não', ''],
  ['20/01/2025', '5014590-98.2022.8.13.0223', 'ALEX JUNIO GRACIANO', 'R$ 654,73', 'alvará parcial', 'Escritório', 'Não', ''],
  ['09/03/2026', '5003683-26.2024.8.13.0407', 'CRISTIANO APARECIDO FERREIRA', 'R$ 1.826,57', 'alvara parcial', 'Escritório', 'Não', ''],
  ['14/04/2026', '0010912-02.2025.5.03.0057', 'Paula Barbosa Ferreira', 'R$ 3.998,6', 'alvará total', 'Escritório', 'Não', ''],
  ['05/05/2026', '0010685-12.2025.5.03.0057', 'João Luiz Alves', '2880,47', 'alvará total', 'Escritório', 'Sim', ''],
  ['25/05/2026', '0010725-57.2026.5.03.0057', 'acougue boi gordo divinopolis ltda', 'R$ 935,92', 'Alvará parcal', 'Escritório', 'Sim', 'Recebido'],
]

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('confirm') !== 'alvaras') return Response.json({ error: 'Adicione ?confirm=alvaras para executar.' }, { status: 400 })

  const { supabase, profile } = await getAuthProfile()
  if (!['super_admin', 'admin'].includes(profile?.role || '')) return Response.json({ error: 'Apenas administradores.' }, { status: 403 })
  const ws = profile?.workspace_id || ''

  const { data: table } = await supabase.from('db_tables').select('id, name').eq('workspace_id', ws).eq('module_key', 'alvaras').maybeSingle()
  if (!table) return Response.json({ error: 'Tabela module_key=alvaras não encontrada.' }, { status: 404 })

  // reconcilia colunas
  const { data: existingCols } = await supabase.from('db_columns').select('id, name, type, config, position').eq('table_id', table.id)
  const cols = (existingCols || []) as { id: string; name: string; type: string; config: { options?: Opt[] } | null; position: number }[]
  let nextPos = Math.max(-1, ...cols.map(c => c.position)) + 1
  const colId: Record<string, string> = {}
  const optMap: Record<string, Record<string, string>> = {}
  const log: string[] = []

  for (const t of TARGET) {
    const found = cols.find(c => norm(c.name) === norm(t.name))
    const wantOptions = t.type === 'select' || t.type === 'status'
    if (found) {
      colId[t.name] = found.id
      if (wantOptions) {
        const cur: Opt[] = Array.isArray(found.config?.options) ? found.config!.options! : []
        const merged = [...cur]
        for (const o of (t.config.options || [])) if (!merged.some(x => norm(x.label) === norm(o.label))) merged.push(o)
        await supabase.from('db_columns').update({ type: t.type, config: { ...(found.config || {}), options: merged } }).eq('id', found.id)
        optMap[t.name] = Object.fromEntries(merged.map(o => [norm(o.label), o.id]))
        log.push(`reusa "${found.name}" → ${t.type} (${merged.length} etiquetas)`)
      } else log.push(`reusa "${found.name}"`)
    } else {
      const { data: created, error } = await supabase.from('db_columns').insert({ table_id: table.id, name: t.name, type: t.type, config: t.config, position: nextPos++, hidden: false }).select('id').single()
      if (error || !created) return Response.json({ error: `criar coluna ${t.name}: ${error?.message}` }, { status: 500 })
      colId[t.name] = created.id as string
      if (wantOptions) optMap[t.name] = Object.fromEntries((t.config.options || []).map(o => [norm(o.label), o.id]))
      log.push(`cria "${t.name}" (${t.type})`)
    }
  }

  // insere linhas (dedup por Processo)
  const { data: existingRows } = await supabase.from('db_rows').select('data').eq('table_id', table.id)
  const procId = colId['Processo']
  const jaTem = new Set((existingRows || []).map(r => norm(String((r.data as Record<string, unknown>)?.[procId] || ''))).filter(Boolean))
  let pos = (existingRows || []).length
  let inseridos = 0, pulados = 0

  for (const row of DATA) {
    const [data, processo, cliente, valor, obs, conta, exped, situ] = row
    if (jaTem.has(norm(processo))) { pulados++; continue }
    const d: Record<string, unknown> = {}
    d[colId['Data']] = parseData(data)
    d[colId['Processo']] = processo.trim()
    d[colId['Cliente']] = cliente.trim()
    d[colId['Valor']] = parseValor(valor)
    d[colId['Observações']] = (obs || '').trim() || null
    if (conta && optMap['Conta'][norm(conta)]) d[colId['Conta']] = optMap['Conta'][norm(conta)]
    if (exped && optMap['Expedição'][norm(exped)]) d[colId['Expedição']] = optMap['Expedição'][norm(exped)]
    if (situ && optMap['Situação'][norm(situ)]) d[colId['Situação']] = optMap['Situação'][norm(situ)]
    const { error } = await supabase.from('db_rows').insert({ table_id: table.id, data: d, position: pos++ })
    if (!error) inseridos++
  }

  return Response.json({ ok: true, tabela: table.name, colunas: log, inseridos, pulados, total: DATA.length })
}
