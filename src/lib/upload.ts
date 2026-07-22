/**
 * Envio de arquivos pelo servidor (/api/upload) em vez de ir direto ao Storage:
 * a RLS de storage.objects do Supabase self-hosted bloqueia o INSERT do navegador.
 */

export interface Uploaded { url: string; path: string; name: string }

export async function uploadFile(file: File, folder: string): Promise<Uploaded> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('folder', folder)
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Falha no upload (${res.status})`)
  return data as Uploaded
}

export async function deleteFile(path: string): Promise<void> {
  await fetch(`/api/upload?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
}
