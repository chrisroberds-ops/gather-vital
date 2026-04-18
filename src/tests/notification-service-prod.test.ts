/**
 * Tests for notification-service in production mode.
 *
 * Strategy: vi.resetModules() + vi.stubEnv() + dynamic import forces the module
 * to re-evaluate with VITE_TEST_MODE='false', exercising the production code paths
 * that the default test suite (which always sets VITE_TEST_MODE='true') cannot reach.
 *
 * @/services is mocked so that logNotification() inside the notification service
 * never tries to open a real Firebase connection, which would hang indefinitely.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/services', () => ({
  db: {
    createCommunicationsLogEntry: vi.fn().mockResolvedValue(undefined),
    getAppConfig: vi.fn().mockResolvedValue({ email_provider: 'resend' }),
  },
}))

// Restore module registry and env stubs after every test so other tests are unaffected.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('notification-service (PRODUCTION paths)', () => {
  describe('sendSMS — no server-side proxy configured', () => {
    it('logs a console.warn and does NOT throw', async () => {
      vi.stubEnv('VITE_TEST_MODE', 'false')
      vi.resetModules()

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      try {
        const { sendSMS } = await import('@/services/notification-service')
        await expect(sendSMS({ to: '+15550001111', body: 'Test' })).resolves.toBeUndefined()
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('SMS not sent'),
          expect.objectContaining({ to: '+15550001111' }),
        )
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('sendEmail — VITE_RESEND_API_KEY not set', () => {
    it('logs a console.warn and does NOT throw', async () => {
      vi.stubEnv('VITE_TEST_MODE', 'false')
      vi.stubEnv('VITE_RESEND_API_KEY', '')
      vi.resetModules()

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      try {
        const { sendEmail } = await import('@/services/notification-service')
        await expect(
          sendEmail({ to: 'nobody@example.com', subject: 'Hi', body: 'Body' }),
        ).resolves.toBeUndefined()
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('no Resend API key configured'),
          expect.objectContaining({ to: 'nobody@example.com' }),
        )
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('sendEmail — VITE_RESEND_API_KEY is set', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_TEST_MODE', 'false')
      vi.stubEnv('VITE_RESEND_API_KEY', 'test-resend-key-abc123')
      vi.stubEnv('VITE_RESEND_FROM', 'Gather <noreply@example.com>')
      vi.resetModules()
    })

    it('calls the Resend API with the correct payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'msg_123' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const { sendEmail } = await import('@/services/notification-service')
      await sendEmail({ to: 'visitor@church.com', subject: 'Welcome!', body: 'Thanks for visiting.' })

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.resend.com/emails')
      expect(options.method).toBe('POST')
      expect((options.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-resend-key-abc123',
      )
      const sentBody = JSON.parse(options.body as string)
      expect(sentBody.to).toEqual(['visitor@church.com'])
      expect(sentBody.subject).toBe('Welcome!')
      expect(sentBody.text).toBe('Thanks for visiting.')
    })

    it('throws when the Resend API returns an error status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.resolve('Invalid email address'),
      })
      vi.stubGlobal('fetch', mockFetch)

      const { sendEmail } = await import('@/services/notification-service')
      await expect(
        sendEmail({ to: 'bad-address', subject: 'Oops', body: 'body' }),
      ).rejects.toThrow('Resend API error 422')
    })
  })
})
