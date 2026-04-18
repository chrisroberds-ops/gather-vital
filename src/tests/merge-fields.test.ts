import { describe, it, expect } from 'vitest'
import { replaceMergeFields, MERGE_FIELDS, type MergeFieldContext } from '@/services/notification-service'

describe('replaceMergeFields', () => {
  describe('single token replacement', () => {
    it('replaces {first_name}', () => {
      expect(replaceMergeFields('Hello, {first_name}!', { first_name: 'Alice' })).toBe('Hello, Alice!')
    })

    it('replaces {last_name}', () => {
      expect(replaceMergeFields('Dear {last_name},', { last_name: 'Smith' })).toBe('Dear Smith,')
    })

    it('replaces {church_name}', () => {
      expect(replaceMergeFields('Welcome to {church_name}.', { church_name: 'Grace Church' })).toBe('Welcome to Grace Church.')
    })

    it('replaces {service_date}', () => {
      expect(replaceMergeFields('Service on {service_date}', { service_date: 'Sunday, April 20' })).toBe('Service on Sunday, April 20')
    })

    it('replaces {role}', () => {
      expect(replaceMergeFields('You are scheduled as {role}', { role: 'Lead Vocals' })).toBe('You are scheduled as Lead Vocals')
    })

    it('replaces {event_name}', () => {
      expect(replaceMergeFields('Register for {event_name}', { event_name: 'Fall Retreat' })).toBe('Register for Fall Retreat')
    })

    it('replaces {group_name}', () => {
      expect(replaceMergeFields('Spot in {group_name} available', { group_name: 'Young Adults' })).toBe('Spot in Young Adults available')
    })
  })

  describe('multiple tokens in a single template', () => {
    it('replaces all tokens in a volunteer schedule email', () => {
      const template = 'Hi {first_name}, you are scheduled as {role} on {service_date} at {church_name}.'
      const ctx: MergeFieldContext = {
        first_name: 'Bob',
        role: 'Drummer',
        service_date: 'April 27',
        church_name: 'Hope Community',
      }
      expect(replaceMergeFields(template, ctx)).toBe(
        'Hi Bob, you are scheduled as Drummer on April 27 at Hope Community.',
      )
    })

    it('replaces tokens in subject and body independently', () => {
      const subject = 'Volunteer slot — {role} on {service_date}'
      const body = 'Hi {first_name} {last_name},\n\nYou have a volunteer slot.'
      const ctx: MergeFieldContext = {
        first_name: 'Jane',
        last_name: 'Doe',
        role: 'Audio',
        service_date: 'May 4',
      }
      expect(replaceMergeFields(subject, ctx)).toBe('Volunteer slot — Audio on May 4')
      expect(replaceMergeFields(body, ctx)).toBe('Hi Jane Doe,\n\nYou have a volunteer slot.')
    })
  })

  describe('repeated tokens', () => {
    it('replaces all occurrences of the same token', () => {
      const template = 'Hello {first_name}! Great to meet you, {first_name}.'
      expect(replaceMergeFields(template, { first_name: 'Sam' })).toBe(
        'Hello Sam! Great to meet you, Sam.',
      )
    })
  })

  describe('missing context values', () => {
    it('replaces missing values with an empty string', () => {
      expect(replaceMergeFields('Hello {first_name}!', {})).toBe('Hello !')
    })

    it('replaces multiple missing values with empty strings', () => {
      expect(replaceMergeFields('{first_name} {last_name}', {})).toBe(' ')
    })

    it('does not throw when the entire context is empty', () => {
      expect(() => replaceMergeFields('Hi {first_name}, see you on {service_date}', {})).not.toThrow()
    })
  })

  describe('unknown tokens', () => {
    it('leaves unknown tokens untouched', () => {
      expect(replaceMergeFields('Hello {unknown_token}!', { first_name: 'Alice' })).toBe('Hello {unknown_token}!')
    })
  })

  describe('templates without tokens', () => {
    it('returns the template unchanged when there are no tokens', () => {
      const plain = 'This email has no merge fields.'
      expect(replaceMergeFields(plain, { first_name: 'Alice' })).toBe(plain)
    })

    it('returns an empty string unchanged', () => {
      expect(replaceMergeFields('', {})).toBe('')
    })
  })

  describe('MERGE_FIELDS documentation array', () => {
    it('exports a non-empty array of token descriptors', () => {
      expect(MERGE_FIELDS.length).toBeGreaterThan(0)
    })

    it('every entry has a token and description', () => {
      for (const field of MERGE_FIELDS) {
        expect(field.token).toMatch(/^\{[a-z_]+\}$/)
        expect(field.description.length).toBeGreaterThan(0)
      }
    })

    it('includes all expected tokens', () => {
      const tokens = MERGE_FIELDS.map(f => f.token)
      expect(tokens).toContain('{first_name}')
      expect(tokens).toContain('{last_name}')
      expect(tokens).toContain('{church_name}')
      expect(tokens).toContain('{service_date}')
      expect(tokens).toContain('{role}')
      expect(tokens).toContain('{event_name}')
      expect(tokens).toContain('{group_name}')
    })
  })
})
