'use client'

import { Scale } from 'lucide-react'
import { EditableHeader, HeaderAssets } from './EditableHeader'

export function HomeHeader({ title, subtitle, assets }: {
  title: string
  subtitle: string
  assets: HeaderAssets
}) {
  return (
    <EditableHeader
      title={title}
      subtitle={subtitle}
      icon={Scale}
      color="#818CF8"
      variant="home"
      gradient="linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)"
      pageKey="home"
      workspaceId={assets.workspaceId}
      initialBanner={assets.banner}
      initialLogo={assets.logo}
      canEdit={assets.canEdit}
    />
  )
}
