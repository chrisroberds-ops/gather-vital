import { describe, it, expect } from 'vitest'
import { DEFAULT_MODULES, DEFAULT_APP_CONFIG } from '@/shared/types'

describe('module-config: DEFAULT_MODULES', () => {
  it('enables core modules by default', () => {
    expect(DEFAULT_MODULES.checkin).toBe(true)
    expect(DEFAULT_MODULES.volunteers).toBe(true)
    expect(DEFAULT_MODULES.groups).toBe(true)
    expect(DEFAULT_MODULES.events).toBe(true)
    expect(DEFAULT_MODULES.visitors).toBe(true)
    expect(DEFAULT_MODULES.worship).toBe(true)
    expect(DEFAULT_MODULES.attendance).toBe(true)
    expect(DEFAULT_MODULES.communications).toBe(true)
  })

  it('disables giving by default', () => {
    expect(DEFAULT_MODULES.giving).toBe(false)
  })

  it('has all expected module keys', () => {
    const keys = Object.keys(DEFAULT_MODULES)
    expect(keys).toContain('checkin')
    expect(keys).toContain('volunteers')
    expect(keys).toContain('groups')
    expect(keys).toContain('events')
    expect(keys).toContain('visitors')
    expect(keys).toContain('worship')
    expect(keys).toContain('giving')
    expect(keys).toContain('attendance')
    expect(keys).toContain('communications')
    expect(keys).toHaveLength(9)
  })
})

describe('module-config: DEFAULT_APP_CONFIG', () => {
  it('includes modules in default config', () => {
    expect(DEFAULT_APP_CONFIG.modules).toBeDefined()
    expect(DEFAULT_APP_CONFIG.modules!.checkin).toBe(true)
    expect(DEFAULT_APP_CONFIG.modules!.giving).toBe(false)
  })

  it('includes track_adult_attendance defaulting to aggregate', () => {
    expect(DEFAULT_APP_CONFIG.track_adult_attendance).toBe('aggregate')
  })

  it('includes late_pickup_minutes defaulting to 30', () => {
    expect(DEFAULT_APP_CONFIG.late_pickup_minutes).toBe(30)
  })
})

describe('module-config: spread/override pattern', () => {
  it('can override individual module flags', () => {
    const custom = { ...DEFAULT_MODULES, giving: true, worship: false }
    expect(custom.giving).toBe(true)
    expect(custom.worship).toBe(false)
    // Other flags unchanged
    expect(custom.checkin).toBe(true)
    expect(custom.groups).toBe(true)
  })

  it('config.modules ?? DEFAULT_MODULES falls back correctly', () => {
    const configWithModules = { modules: { ...DEFAULT_MODULES, groups: false } }
    const configWithoutModules = {}

    const m1 = (configWithModules as { modules?: typeof DEFAULT_MODULES }).modules ?? DEFAULT_MODULES
    const m2 = (configWithoutModules as { modules?: typeof DEFAULT_MODULES }).modules ?? DEFAULT_MODULES

    expect(m1.groups).toBe(false)
    expect(m2.groups).toBe(true)
  })
})
