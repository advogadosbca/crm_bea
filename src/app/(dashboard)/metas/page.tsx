import { getPageAssets } from '@/lib/auth'
import { getTableById } from '@/lib/dynamic-data'
import { MetasClient } from './MetasClient'

// Base "Leads" (fonte-leads) — fonte de dados compartilhada pelas tabelas do CRM
const LEADS_TABLE_ID = '0a3fdec1-161a-4b3e-89de-49476d1447ff'

export default async function Page() {
  const assets = await getPageAssets('metas')
  const { tableId, columns, rows, sources, members, userId, views } = await getTableById(LEADS_TABLE_ID)

  return (
    <MetasClient headerAssets={assets} tableId={tableId} columns={columns} rows={rows}
      sources={sources} members={members} userId={userId} views={views} />
  )
}
