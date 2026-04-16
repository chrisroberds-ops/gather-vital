import React, { createContext, useContext, useState, useEffect } from 'react'
import { db } from '@/services'
import { useAuth } from '@/auth/AuthContext'
import type { AppConfig, TerminologyConfig } from '@/shared/types'
import { DEFAULT_APP_CONFIG } from '@/shared/types'
import { getChurchId } from './church-context'

// ── Color utility ─────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  return [h, Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = ln - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)  { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  const hex2 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

// Lightness targets (%) that match Tailwind's visual scale roughly
const SHADE_L: Record<string, number> = {
  '50': 97, '100': 94, '200': 88, '300': 76, '400': 62,
  '500': 50, '600': 41, '700': 32, '800': 24, '900': 16,
}

export function applyPrimaryColor(hex: string): void {
  try {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return
    const [h, s] = hexToHsl(hex)
    // Keep saturation vivid but cap at 90% to avoid neon
    const cappedS = Math.min(s, 90)
    for (const [shade, l] of Object.entries(SHADE_L)) {
      document.documentElement.style.setProperty(
        `--color-primary-${shade}`,
        hslToHex(h, cappedS, l),
      )
    }
  } catch {
    // Never crash on invalid color input
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface AppLabels {
  groups: string
  volunteers: string
  members: string
  giving: string
  kids: string
  service: string
}

interface AppConfigContextValue {
  config: AppConfig
  updateConfig: (data: Partial<Omit<AppConfig, 'church_id'>>) => Promise<AppConfig>
  reloadConfig: () => Promise<void>
  labels: AppLabels
}

const AppConfigContext = createContext<AppConfigContextValue | null>(null)

function toLabels(t: TerminologyConfig): AppLabels {
  return {
    groups: t.groups_label,
    volunteers: t.volunteers_label,
    members: t.members_label,
    giving: t.giving_label,
    kids: t.kids_label,
    service: t.service_label,
  }
}

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [config, setConfig] = useState<AppConfig>({
    ...DEFAULT_APP_CONFIG,
    church_id: getChurchId(),
  })

  async function loadConfig() {
    const c = await db.getAppConfig()
    setConfig(c)
    applyPrimaryColor(c.primary_color)
    document.title = c.church_name || 'Gather'
  }

  // Reload whenever the user's church changes (login, setup wizard, etc.)
  useEffect(() => {
    void loadConfig()
  }, [user?.church_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function updateConfig(data: Partial<Omit<AppConfig, 'church_id'>>) {
    const updated = await db.updateAppConfig(data)
    setConfig(updated)
    if (data.primary_color) applyPrimaryColor(updated.primary_color)
    if (data.church_name) document.title = updated.church_name
    return updated
  }

  async function reloadConfig() {
    await loadConfig()
  }

  const labels = toLabels(config.terminology)

  return (
    <AppConfigContext.Provider value={{ config, updateConfig, reloadConfig, labels }}>
      {children}
    </AppConfigContext.Provider>
  )
}

export function useAppConfig(): AppConfigContextValue {
  const ctx = useContext(AppConfigContext)
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider')
  return ctx
}
