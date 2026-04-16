import { describe, it, expect, afterEach } from 'vitest'
import { db, setChurchId, TEST_CHURCH_ID } from '@/services'
import { DEFAULT_APP_CONFIG, DEFAULT_TERMINOLOGY } from '@/shared/types'

afterEach(() => {
  setChurchId(TEST_CHURCH_ID)
})

describe('AppConfig — defaults', () => {
  it('returns DEFAULT_APP_CONFIG fields for a brand-new church', async () => {
    setChurchId('appconfig-new-church')
    const config = await db.getAppConfig()
    expect(config.church_name).toBe(DEFAULT_APP_CONFIG.church_name)
    expect(config.primary_color).toBe(DEFAULT_APP_CONFIG.primary_color)
    expect(config.setup_complete).toBe(false)
    expect(config.terminology).toEqual(DEFAULT_TERMINOLOGY)
  })

  it('church_id on returned config matches the active church', async () => {
    setChurchId('appconfig-id-check')
    const config = await db.getAppConfig()
    expect(config.church_id).toBe('appconfig-id-check')
  })
})

describe('AppConfig — updateAppConfig', () => {
  it('persists church_name', async () => {
    setChurchId('appconfig-persist-1')
    await db.updateAppConfig({ church_name: 'Hope Chapel' })
    const config = await db.getAppConfig()
    expect(config.church_name).toBe('Hope Chapel')
  })

  it('persists primary_color', async () => {
    setChurchId('appconfig-color-1')
    await db.updateAppConfig({ primary_color: '#10b981' })
    const config = await db.getAppConfig()
    expect(config.primary_color).toBe('#10b981')
  })

  it('persists setup_complete flag', async () => {
    setChurchId('appconfig-setup-flag')
    await db.updateAppConfig({ setup_complete: true })
    const config = await db.getAppConfig()
    expect(config.setup_complete).toBe(true)
  })

  it('partial update does not overwrite other fields', async () => {
    setChurchId('appconfig-partial')
    await db.updateAppConfig({ church_name: 'River Church', primary_color: '#f43f5e' })
    await db.updateAppConfig({ setup_complete: true })
    const config = await db.getAppConfig()
    expect(config.church_name).toBe('River Church')
    expect(config.primary_color).toBe('#f43f5e')
    expect(config.setup_complete).toBe(true)
  })

  it('persists custom terminology', async () => {
    setChurchId('appconfig-term')
    await db.updateAppConfig({
      terminology: {
        ...DEFAULT_TERMINOLOGY,
        groups_label: 'Life Groups',
        volunteers_label: 'Serve Teams',
      },
    })
    const config = await db.getAppConfig()
    expect(config.terminology.groups_label).toBe('Life Groups')
    expect(config.terminology.volunteers_label).toBe('Serve Teams')
    // Other fields unchanged
    expect(config.terminology.members_label).toBe(DEFAULT_TERMINOLOGY.members_label)
  })
})

describe('AppConfig — church isolation', () => {
  it('two churches have independent configs', async () => {
    setChurchId('appconfig-church-a')
    await db.updateAppConfig({ church_name: 'Church A', primary_color: '#6366f1' })

    setChurchId('appconfig-church-b')
    await db.updateAppConfig({ church_name: 'Church B', primary_color: '#10b981' })

    setChurchId('appconfig-church-a')
    const a = await db.getAppConfig()
    expect(a.church_name).toBe('Church A')
    expect(a.primary_color).toBe('#6366f1')

    setChurchId('appconfig-church-b')
    const b = await db.getAppConfig()
    expect(b.church_name).toBe('Church B')
    expect(b.primary_color).toBe('#10b981')
  })

  it('updating one church config does not affect another', async () => {
    setChurchId('appconfig-iso-a')
    await db.updateAppConfig({ church_name: 'Unchanged Church' })

    setChurchId('appconfig-iso-b')
    await db.updateAppConfig({ church_name: 'Other Church' })

    // Update church B again
    await db.updateAppConfig({ church_name: 'Updated Other Church' })

    // Church A is unaffected
    setChurchId('appconfig-iso-a')
    const a = await db.getAppConfig()
    expect(a.church_name).toBe('Unchanged Church')
  })
})
