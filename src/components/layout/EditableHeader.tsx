'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ImagePlus, Loader2, LucideIcon } from 'lucide-react'
import { BackHome } from './BackHome'
import { createClient } from '@/lib/supabase'
import { uploadFile } from '@/lib/upload'
import { useRouter } from 'next/navigation'

export interface HeaderAssets {
  banner: string | null
  logo: string | null
  workspaceId: string
  canEdit: boolean
}

interface Props {
  title: string
  icon: LucideIcon
  color: string
  gradient: string
  pageKey: string
  workspaceId: string
  initialBanner?: string | null
  initialLogo?: string | null
  canEdit: boolean
  /** Home usa banner mais alto e título grande */
  variant?: 'module' | 'home'
  subtitle?: string
}

type Pending = { kind: 'banner' | 'logo'; url: string } | null

export function EditableHeader({
  title, icon: Icon, color, gradient, pageKey, workspaceId,
  initialBanner, initialLogo, canEdit, variant = 'module', subtitle,
}: Props) {
  const [banner, setBanner] = useState(initialBanner || null)
  const [logo, setLogo] = useState(initialLogo || null)
  const [uploading, setUploading] = useState<'banner' | 'logo' | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  async function upload(file: File, kind: 'banner' | 'logo') {
    setUploading(kind)
    try {
      const up = await uploadFile(file, `${workspaceId}/${kind}-${pageKey}`)
      setPending({ kind, url: up.url })
    } catch (e) {
      alert('Erro no upload: ' + (e as Error).message)
    }
    setUploading(null)
  }

  async function applyScope(scope: 'page' | 'all') {
    if (!pending) return
    const { kind, url } = pending
    const field = kind === 'banner' ? 'banner_url' : 'logo_url'

    if (scope === 'all') {
      // global default + limpa overrides dessa imagem em todas as páginas
      await supabase.from('workspaces').update({ [field]: url }).eq('id', workspaceId)
      await supabase.from('page_assets').update({ [field]: null }).eq('workspace_id', workspaceId)
    } else {
      // override só desta página
      await supabase.from('page_assets').upsert(
        { workspace_id: workspaceId, page_key: pageKey, [field]: url },
        { onConflict: 'workspace_id,page_key' }
      )
    }
    if (kind === 'banner') setBanner(url); else setLogo(url)
    setPending(null)
    router.refresh()
  }

  const h = variant === 'home' ? 'h-48' : 'h-36'

  return (
    <>
      <div className={`${h} relative overflow-hidden`}
        onClick={() => canEdit && bannerInput.current?.click()}
        style={{
          background: banner ? `url(${banner}) center/cover` : gradient,
          cursor: canEdit ? 'pointer' : 'default',
        }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--notion-bg))' }} />

        {/* Botão Alterar banner — sempre visível */}
        {canEdit && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            {uploading === 'banner' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            Alterar capa
          </div>
        )}
        <input ref={bannerInput} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && upload(e.target.files[0], 'banner')} />

        {/* Logo + título */}
        <div className="absolute bottom-4 left-16 flex items-center gap-3">
          <div className="relative"
            onClick={(e) => { if (canEdit) { e.stopPropagation(); logoInput.current?.click() } }}
            style={{ cursor: canEdit ? 'pointer' : 'default' }}>
            <div className={`${variant === 'home' ? 'w-14 h-14' : 'w-10 h-10'} rounded-xl flex items-center justify-center overflow-hidden`}
              style={{ background: logo ? 'var(--notion-bg-3)' : `${color}40`, border: `1px solid ${logo ? 'var(--notion-border)' : color + '80'}` }}>
              {logo ? <img src={logo} alt="logo" className="w-full h-full object-contain" /> :
                <Icon className={variant === 'home' ? 'w-6 h-6' : 'w-5 h-5'} style={{ color }} />}
            </div>
            {/* Badge de câmera — sempre visível */}
            {canEdit && (
              <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: 'var(--notion-accent)', border: '2px solid var(--notion-bg)' }}>
                {uploading === 'logo' ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : <ImagePlus className="w-3 h-3 text-white" />}
              </div>
            )}
            <input ref={logoInput} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && upload(e.target.files[0], 'logo')} />
          </div>
          <div className="pointer-events-none">
            <h1 className={`${variant === 'home' ? 'text-3xl' : 'text-2xl'} font-semibold text-white`}>{title}</h1>
            {subtitle && <p className="text-sm text-white/70 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </div>

      {variant === 'module' && (
        <div className="px-16 pt-6">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--notion-text-3)' }}>
            <Link href="/" className="hover:text-[var(--notion-text-2)] transition-colors flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" /> Início
            </Link>
            <span>/</span>
            <span style={{ color: 'var(--notion-text-2)' }}>{title}</span>
          </div>
          <BackHome />
        </div>
      )}

      {/* Escolha de escopo */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setPending(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 animate-fade-in"
            style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }}>
            <h3 className="font-semibold mb-1" style={{ color: 'var(--notion-text)' }}>
              Aplicar {pending.kind === 'banner' ? 'capa' : 'logo'}
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--notion-text-2)' }}>
              Onde você quer usar esta imagem?
            </p>
            <div className="space-y-2">
              <button onClick={() => applyScope('page')}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--notion-bg-4)]"
                style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text)' }}>
                Somente esta página
                <span className="block text-xs font-normal mt-0.5" style={{ color: 'var(--notion-text-3)' }}>Aplica apenas em &quot;{title}&quot;</span>
              </button>
              <button onClick={() => applyScope('all')}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--notion-accent)', color: '#fff' }}>
                Todas as páginas
                <span className="block text-xs font-normal mt-0.5 text-white/70">Define como padrão do workspace</span>
              </button>
            </div>
            <button onClick={() => setPending(null)}
              className="w-full mt-3 py-2 rounded-lg text-sm" style={{ color: 'var(--notion-text-3)' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
