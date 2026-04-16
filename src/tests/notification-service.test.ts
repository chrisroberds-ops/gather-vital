import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendSMS, sendEmail } from '@/services/notification-service'

// VITE_TEST_MODE is already 'true' in the test environment.

describe('notification-service (TEST_MODE)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('sendSMS logs to console and does not throw', async () => {
    await expect(sendSMS({ to: '+15550001234', body: 'Hello!' })).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[notification-service] SMS →',
      expect.objectContaining({ to: '+15550001234', body: 'Hello!' }),
    )
  })

  it('sendEmail logs to console and does not throw', async () => {
    await expect(
      sendEmail({ to: 'test@example.com', subject: 'Welcome', body: 'Hi there!' }),
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[notification-service] Email →',
      expect.objectContaining({ to: 'test@example.com', subject: 'Welcome' }),
    )
  })

  it('sendSMS logs the exact phone and body provided', async () => {
    const payload = { to: '555-999-0000', body: 'Your spot is confirmed!' }
    await sendSMS(payload)
    const call = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] SMS →')
    expect(call?.[1]).toMatchObject(payload)
  })

  it('sendEmail logs the subject', async () => {
    await sendEmail({ to: 'a@b.com', subject: 'Test Subject', body: 'body text' })
    const call = consoleSpy.mock.calls.find(c => c[0] === '[notification-service] Email →')
    expect(call?.[1]).toMatchObject({ subject: 'Test Subject' })
  })
})
