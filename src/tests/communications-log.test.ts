import { describe, it, expect } from 'vitest'
import { db } from '@/services'

describe('communications log', () => {
  it('creates an email log entry', async () => {
    const entry = await db.createCommunicationsLogEntry({
      channel: 'email',
      subject: 'Welcome!',
      recipient: 'test@example.com',
      success: true,
    })
    expect(entry.channel).toBe('email')
    expect(entry.subject).toBe('Welcome!')
    expect(entry.success).toBe(true)
    expect(entry.id).toBeTruthy()
    expect(entry.sent_at).toBeTruthy()
  })

  it('creates an SMS log entry with person_id', async () => {
    const entry = await db.createCommunicationsLogEntry({
      channel: 'sms',
      subject: 'Reminder text',
      recipient: '+15555550123',
      success: true,
      person_id: 'person-abc',
    })
    expect(entry.channel).toBe('sms')
    expect(entry.person_id).toBe('person-abc')
  })

  it('logs failed entries with error message', async () => {
    const entry = await db.createCommunicationsLogEntry({
      channel: 'email',
      subject: 'Failed message',
      recipient: 'bad@example.com',
      success: false,
      error_message: 'API key invalid',
    })
    expect(entry.success).toBe(false)
    expect(entry.error_message).toBe('API key invalid')
  })

  it('retrieves log entries', async () => {
    const unique = `Subject-${Date.now()}-${Math.random()}`
    await db.createCommunicationsLogEntry({
      channel: 'email',
      subject: unique,
      recipient: 'a@example.com',
      success: true,
    })
    const entries = await db.getCommunicationsLog()
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const found = entries.find(e => e.subject === unique)
    expect(found).toBeDefined()
  })

  it('getCommunicationsLog sorts newest first', async () => {
    // Create entries with deliberate delay to ensure distinct timestamps
    const e1 = await db.createCommunicationsLogEntry({ channel: 'email', subject: 'First',  recipient: 'a@b.com', success: true })
    // Bump the sent_at on e1 slightly so e2 is definitely newer
    await new Promise(r => setTimeout(r, 5))
    const e2 = await db.createCommunicationsLogEntry({ channel: 'email', subject: 'Second', recipient: 'a@b.com', success: true })

    const entries = await db.getCommunicationsLog()
    const idx1 = entries.findIndex(e => e.id === e1.id)
    const idx2 = entries.findIndex(e => e.id === e2.id)
    // e2 is newer, should appear before (lower index) e1
    expect(idx2).toBeLessThan(idx1)
  })

  it('filters by channel when provided', async () => {
    const emailSubject = `email-filter-${Date.now()}`
    const smsSubject   = `sms-filter-${Date.now()}`
    await db.createCommunicationsLogEntry({ channel: 'email', subject: emailSubject, recipient: 'a@b.com', success: true })
    await db.createCommunicationsLogEntry({ channel: 'sms',   subject: smsSubject,   recipient: '+15555', success: true })

    const emailEntries = await db.getCommunicationsLog({ channel: 'email' })
    expect(emailEntries.every(e => e.channel === 'email')).toBe(true)
    expect(emailEntries.find(e => e.subject === emailSubject)).toBeDefined()

    const smsEntries = await db.getCommunicationsLog({ channel: 'sms' })
    expect(smsEntries.every(e => e.channel === 'sms')).toBe(true)
    expect(smsEntries.find(e => e.subject === smsSubject)).toBeDefined()
  })
})
