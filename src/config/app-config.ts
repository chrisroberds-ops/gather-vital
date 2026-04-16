import { db } from '@/services'
import type { AppConfig } from '@/shared/types'

type ConfigMap = Record<string, string>

let cachedConfig: ConfigMap | null = null

export async function loadAppConfig(): Promise<ConfigMap> {
  if (cachedConfig) return cachedConfig
  const rows: AppConfig[] = await db.getAppConfig()
  cachedConfig = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return cachedConfig
}

export function getConfig(key: string, fallback = ''): string {
  return cachedConfig?.[key] ?? fallback
}

export function invalidateConfigCache() {
  cachedConfig = null
}
