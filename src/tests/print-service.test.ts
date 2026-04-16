import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildLabelData, printLabel } from '@/services/print-service'
import type { Person, Checkin, CheckinSession } from '@/shared/types'

// Silence console.group / groupEnd / log output from printTestMode
const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => undefined)
const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined)
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  logSpy.mockRestore()
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    church_id: 'test-church',
    first_name: 'Emma',
    last_name: 'Smith',
    email: 'emma@example.com',
    phone: '555-111-2222',
    grade: '1st',
    is_child: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeParent(overrides: Partial<Person> = {}): Person {
  return makePerson({
    id: 'parent-1',
    first_name: 'Sarah',
    last_name: 'Smith',
    phone: '555-999-8888',
    is_child: false,
    ...overrides,
  })
}

function makeCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 'checkin-1',
    church_id: 'test-church',
    session_id: 'session-1',
    child_id: 'person-1',
    checked_in_by: 'parent-1',
    household_id: 'hh-1',
    kiosk_id: 'kiosk-a',
    pickup_code: '7342',
    status: 'checked_in',
    checked_in_at: '2026-04-08T10:30:00Z',
    label_printed: false,
    ...overrides,
  }
}

function makeSession(overrides: Partial<CheckinSession> = {}): CheckinSession {
  return {
    id: 'session-1',
    church_id: 'test-church',
    name: 'Sunday AM',
    date: '2026-04-08',
    service_time: '10:30 AM',
    status: 'open',
    created_by: 'staff-1',
    ...overrides,
  }
}

// ── buildLabelData ────────────────────────────────────────────────────────────

describe('buildLabelData', () => {
  it('populates childName from first_name and last_name', () => {
    const label = buildLabelData(makePerson(), makeParent(), makeCheckin(), makeSession())
    expect(label.childName).toBe('Emma Smith')
  })

  it('uses preferred_name when available', () => {
    const label = buildLabelData(
      makePerson({ preferred_name: 'Emmy' }),
      makeParent(),
      makeCheckin(),
      makeSession(),
    )
    expect(label.childName).toBe('Emmy Smith')
  })

  it('copies grade from the child Person', () => {
    const label = buildLabelData(makePerson({ grade: '3rd' }), makeParent(), makeCheckin(), makeSession())
    expect(label.grade).toBe('3rd')
  })

  it('copies allergies from the child Person', () => {
    const label = buildLabelData(
      makePerson({ allergies: 'Peanuts, tree nuts' }),
      makeParent(),
      makeCheckin(),
      makeSession(),
    )
    expect(label.allergies).toBe('Peanuts, tree nuts')
  })

  it('sets parentPhone from the parent Person', () => {
    const label = buildLabelData(makePerson(), makeParent({ phone: '555-777-6666' }), makeCheckin(), makeSession())
    expect(label.parentPhone).toBe('555-777-6666')
  })

  it('sets pickupCode from the checkin record', () => {
    const label = buildLabelData(makePerson(), makeParent(), makeCheckin({ pickup_code: '9001' }), makeSession())
    expect(label.pickupCode).toBe('9001')
  })

  it('sets sessionDate and sessionTime from the session', () => {
    const label = buildLabelData(
      makePerson(),
      makeParent(),
      makeCheckin(),
      makeSession({ date: '2026-04-08', service_time: '9:00 AM' }),
    )
    expect(label.sessionDate).toBe('2026-04-08')
    expect(label.sessionTime).toBe('9:00 AM')
  })

  it('formats customField1 with the provided label', () => {
    const label = buildLabelData(
      makePerson({ custom_field_1: 'Room 4' }),
      makeParent(),
      makeCheckin(),
      makeSession(),
      'Room',
    )
    expect(label.customField1).toBe('Room: Room 4')
  })

  it('sets customField1 to undefined when custom_field_1 is empty', () => {
    const label = buildLabelData(
      makePerson({ custom_field_1: '' }),
      makeParent(),
      makeCheckin(),
      makeSession(),
      'Room',
    )
    expect(label.customField1).toBeUndefined()
  })
})

// ── printLabel (TEST_MODE) ────────────────────────────────────────────────────

describe('printLabel in TEST_MODE', () => {
  it('resolves without throwing', async () => {
    const child = makePerson()
    const parent = makeParent()
    const checkin = makeCheckin()
    const session = makeSession()
    const label = buildLabelData(child, parent, checkin, session)

    await expect(
      printLabel({ kioskId: 'kiosk-a', checkinId: checkin.id, childLabel: label, parentTag: label }),
    ).resolves.toBeUndefined()
  })

  it('logs the child name in the child-label output', async () => {
    const label = buildLabelData(
      makePerson({ first_name: 'Oliver', last_name: 'Harris' }),
      makeParent(),
      makeCheckin(),
      makeSession(),
    )
    await printLabel({ kioskId: 'kiosk-a', checkinId: 'c-1', childLabel: label, parentTag: label })

    // console.log is called with the formatted child label string
    const childCall = logSpy.mock.calls.find(c => String(c[0]).includes('CHILD LABEL'))
    expect(childCall).toBeDefined()
    expect(String(childCall![0])).toContain('OLIVER HARRIS')
  })

  it('includes the allergy line in the child-label output when allergies are set', async () => {
    const label = buildLabelData(
      makePerson({ allergies: 'Shellfish' }),
      makeParent(),
      makeCheckin(),
      makeSession(),
    )
    await printLabel({ kioskId: 'kiosk-a', checkinId: 'c-2', childLabel: label, parentTag: label })

    const childCall = logSpy.mock.calls.find(c => String(c[0]).includes('CHILD LABEL'))
    expect(String(childCall![0])).toContain('ALLERGY')
    expect(String(childCall![0])).toContain('Shellfish')
  })

  it('includes the pickup code in the parent-tag output', async () => {
    const label = buildLabelData(
      makePerson(),
      makeParent(),
      makeCheckin({ pickup_code: '5678' }),
      makeSession(),
    )
    await printLabel({ kioskId: 'kiosk-a', checkinId: 'c-3', childLabel: label, parentTag: label })

    const parentCall = logSpy.mock.calls.find(c => String(c[0]).includes('PARENT TAG'))
    expect(parentCall).toBeDefined()
    expect(String(parentCall![0])).toContain('5678')
  })
})
