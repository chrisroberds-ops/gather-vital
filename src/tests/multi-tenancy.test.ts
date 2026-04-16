import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, setChurchId, getChurchId, TEST_CHURCH_ID } from '@/services'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makePerson(firstName = 'Test') {
  return db.createPerson({
    first_name: firstName,
    last_name: 'Person',
    phone: '',
    is_active: true,
    is_child: false,
  })
}

async function makeGroup(name = 'Test Group') {
  return db.createGroup({
    name,
    group_type: 'small_group',
    is_open: true,
    is_visible: true,
    is_active: true,
    childcare_available: false,
  })
}

// ── Restore church context after each test ────────────────────────────────────
// Tests share the same in-memory store — we must restore the context so
// later tests are not surprised by a different church_id.
afterEach(() => {
  setChurchId(TEST_CHURCH_ID)
})

// ── church-context basics ─────────────────────────────────────────────────────

describe('church-context', () => {
  it('TEST_CHURCH_ID is the default church context', () => {
    expect(getChurchId()).toBe(TEST_CHURCH_ID)
  })

  it('setChurchId changes the active context', () => {
    setChurchId('church-abc')
    expect(getChurchId()).toBe('church-abc')
  })

  it('restoring context goes back to original value', () => {
    setChurchId('church-temp')
    setChurchId(TEST_CHURCH_ID)
    expect(getChurchId()).toBe(TEST_CHURCH_ID)
  })
})

// ── Data isolation ────────────────────────────────────────────────────────────

describe('data isolation between churches', () => {
  it('a person created in church-A is not visible in church-B', async () => {
    setChurchId('church-A-isolation')
    const person = await makePerson('AliceIsolation')

    setChurchId('church-B-isolation')
    const people = await db.getPeople()
    expect(people.find(p => p.id === person.id)).toBeUndefined()
  })

  it('a person created in church-A is visible within church-A', async () => {
    setChurchId('church-A-visible')
    const person = await makePerson('BobVisible')

    // Still in church-A-visible
    const people = await db.getPeople()
    expect(people.find(p => p.id === person.id)).toBeDefined()
  })

  it('groups created in different churches are isolated', async () => {
    setChurchId('church-groups-1')
    const g1 = await makeGroup('Alpha Group')

    setChurchId('church-groups-2')
    const g2 = await makeGroup('Beta Group')

    const groups2 = await db.getGroups(true)
    expect(groups2.find(g => g.id === g1.id)).toBeUndefined()
    expect(groups2.find(g => g.id === g2.id)).toBeDefined()
  })

  it('updates only affect the owning church', async () => {
    setChurchId('church-update-1')
    const person = await makePerson('Original')

    // Attempt update from a different church should NOT find the record
    setChurchId('church-update-2')
    await expect(db.updatePerson(person.id, { first_name: 'Hacked' })).rejects.toThrow()

    // Original church still has the unchanged record
    setChurchId('church-update-1')
    const found = await db.getPerson(person.id)
    expect(found?.first_name).toBe('Original')
  })

  it('getPerson returns null for a person in another church', async () => {
    setChurchId('church-get-1')
    const person = await makePerson('Invisible')

    setChurchId('church-get-2')
    expect(await db.getPerson(person.id)).toBeNull()
  })

  it('event registrations are scoped to the creating church', async () => {
    setChurchId('church-events-1')
    const event = await db.createEvent({
      name: 'Isolated Event',
      event_date: '2099-01-01',
      registration_required: true,
      has_cost: false,
      is_active: true,
    })
    const person = await makePerson('Registrant')
    await db.createEventRegistration({
      event_id: event.id,
      person_id: person.id,
      status: 'registered',
      payment_status: 'not_required',
      registered_at: new Date().toISOString(),
    })

    setChurchId('church-events-2')
    const regs = await db.getEventRegistrations(event.id)
    expect(regs).toHaveLength(0)
  })

  it('app config is scoped per church', async () => {
    setChurchId('church-config-1')
    await db.updateAppConfig({ church_name: 'First Church' })

    setChurchId('church-config-2')
    await db.updateAppConfig({ church_name: 'Second Church' })

    setChurchId('church-config-1')
    const config1 = await db.getAppConfig()
    expect(config1.church_name).toBe('First Church')

    setChurchId('church-config-2')
    const config2 = await db.getAppConfig()
    expect(config2.church_name).toBe('Second Church')
  })
})

// ── New records carry church_id ───────────────────────────────────────────────

describe('church_id stamping on new records', () => {
  it('created person has church_id matching current context', async () => {
    setChurchId('church-stamp-test')
    const person = await makePerson('Stamped')
    expect(person.church_id).toBe('church-stamp-test')
  })

  it('created group has church_id matching current context', async () => {
    setChurchId('church-stamp-group')
    const group = await makeGroup('Stamped Group')
    expect(group.church_id).toBe('church-stamp-group')
  })

  it('created event has church_id matching current context', async () => {
    setChurchId('church-stamp-event')
    const event = await db.createEvent({
      name: 'Stamped Event',
      event_date: '2099-01-01',
      registration_required: false,
      has_cost: false,
      is_active: true,
    })
    expect(event.church_id).toBe('church-stamp-event')
  })
})

// ── Church CRUD ───────────────────────────────────────────────────────────────

describe('Church CRUD', () => {
  it('creates a church and retrieves it by id', async () => {
    const church = await db.createChurch({
      name: 'Test Church',
      slug: `test-church-${Date.now()}`,
      timezone: 'America/New_York',
      is_active: true,
    })
    expect(church.id).toBeTruthy()
    expect(church.name).toBe('Test Church')
    expect(church.created_at).toBeTruthy()

    const found = await db.getChurch(church.id)
    expect(found?.id).toBe(church.id)
  })

  it('retrieves a church by slug', async () => {
    const slug = `slug-test-${Date.now()}`
    const church = await db.createChurch({ name: 'Slug Church', slug, timezone: 'UTC', is_active: true })
    const found = await db.getChurchBySlug(slug)
    expect(found?.id).toBe(church.id)
  })

  it('updates a church', async () => {
    const church = await db.createChurch({
      name: 'Old Name',
      slug: `update-test-${Date.now()}`,
      timezone: 'UTC',
      is_active: true,
    })
    const updated = await db.updateChurch(church.id, { name: 'New Name' })
    expect(updated.name).toBe('New Name')
  })

  it('getChurches returns all churches (global, not scoped)', async () => {
    const before = await db.getChurches()
    await db.createChurch({ name: 'Listed Church', slug: `listed-${Date.now()}`, timezone: 'UTC', is_active: true })
    const after = await db.getChurches()
    expect(after.length).toBe(before.length + 1)
  })

  it('getChurch returns null for unknown id', async () => {
    expect(await db.getChurch('no-such-church')).toBeNull()
  })
})
