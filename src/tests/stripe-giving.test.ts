/**
 * Stripe giving integration tests — Part of Session R
 *
 * Covers:
 *  - RecurringSubscription CRUD via the in-memory DB
 *  - createOnlineGivingRecord (TEST_MODE)
 *  - createRecurringSubscription service function
 *  - cancelRecurringSubscription service function
 *  - computeGivingSummary filtering (online-only records)
 *  - AppConfig defaults: giving_preset_amounts, giving_funds
 *  - GivingRecord new fields: frequency, is_online, stripe fields
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services'
import {
  createOnlineGivingRecord,
  createRecurringSubscription,
  getRecurringSubscriptions,
  cancelRecurringSubscription,
  createGivingRecord,
  computeGivingSummary,
  formatFrequency,
} from '@/features/giving/giving-service'
import { DEFAULT_APP_CONFIG } from '@/shared/types'
import type { GivingRecord } from '@/shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getFirstPerson() {
  const people = await db.getPeople()
  return people.find(p => !p.is_child && p.is_active)!
}

async function getSecondPerson() {
  const people = await db.getPeople()
  return people.filter(p => !p.is_child && p.is_active)[1]!
}

// ── AppConfig defaults ────────────────────────────────────────────────────────

describe('DEFAULT_APP_CONFIG giving defaults', () => {
  it('has default giving_preset_amounts', () => {
    expect(DEFAULT_APP_CONFIG.giving_preset_amounts).toEqual([25, 50, 100, 250])
  })

  it('has a default giving_funds array with one fund', () => {
    expect(DEFAULT_APP_CONFIG.giving_funds).toHaveLength(1)
    expect(DEFAULT_APP_CONFIG.giving_funds![0].id).toBe('general')
    expect(DEFAULT_APP_CONFIG.giving_funds![0].name).toBe('General Fund')
  })
})

// ── createOnlineGivingRecord ──────────────────────────────────────────────────

describe('createOnlineGivingRecord', () => {
  it('creates a record with is_online = true', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 50,
      fund: 'General Fund',
      frequency: 'one_time',
    })
    expect(record.is_online).toBe(true)
  })

  it('sets source to "stripe"', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 100,
      fund: 'Missions',
      frequency: 'monthly',
    })
    expect(record.source).toBe('stripe')
  })

  it('stores the frequency field', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 75,
      fund: 'General Fund',
      frequency: 'weekly',
    })
    expect(record.frequency).toBe('weekly')
  })

  it('stores stripe_payment_intent_id when provided', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 200,
      fund: 'Building',
      frequency: 'one_time',
      stripePaymentIntentId: 'pi_test_abc123',
    })
    expect(record.stripe_payment_intent_id).toBe('pi_test_abc123')
  })

  it('stores stripe_customer_id when provided', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 50,
      fund: 'General Fund',
      frequency: 'monthly',
      stripeCustomerId: 'cus_test_xyz',
    })
    expect(record.stripe_customer_id).toBe('cus_test_xyz')
  })

  it('stores stripe_subscription_id for recurring gifts', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 100,
      fund: 'General Fund',
      frequency: 'monthly',
      stripeSubscriptionId: 'sub_test_123',
    })
    expect(record.stripe_subscription_id).toBe('sub_test_123')
  })

  it('does NOT set stripe_subscription_id for one-time gifts', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 50,
      fund: 'General Fund',
      frequency: 'one_time',
      stripeSubscriptionId: 'sub_test_should_be_ignored',
    })
    expect(record.stripe_subscription_id).toBeUndefined()
  })

  it('sets date to today', async () => {
    const person = await getFirstPerson()
    const today = new Date().toISOString().split('T')[0]
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 25,
      fund: 'General Fund',
      frequency: 'one_time',
    })
    expect(record.date).toBe(today)
  })

  it('sets method to online_card', async () => {
    const person = await getFirstPerson()
    const record = await createOnlineGivingRecord({
      personId: person.id,
      amount: 50,
      fund: 'General Fund',
      frequency: 'one_time',
    })
    expect(record.method).toBe('online_card')
  })
})

// ── GivingRecord backward compatibility ───────────────────────────────────────

describe('GivingRecord - new optional fields', () => {
  it('creates a manual record without new optional fields', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({
      personId: person.id,
      amount: 100,
      date: '2026-04-01',
      method: 'cash',
      fund: 'General',
    })
    expect(record.is_online).toBeUndefined()
    expect(record.frequency).toBeUndefined()
    expect(record.stripe_payment_intent_id).toBeUndefined()
  })

  it('stores is_online when provided via createGivingRecord', async () => {
    const person = await getFirstPerson()
    const record = await createGivingRecord({
      personId: person.id,
      amount: 50,
      date: '2026-04-01',
      method: 'online_card',
      fund: 'General',
      is_online: true,
      frequency: 'monthly',
    })
    expect(record.is_online).toBe(true)
    expect(record.frequency).toBe('monthly')
  })
})

// ── computeGivingSummary with online filter ───────────────────────────────────

describe('computeGivingSummary - online giving filter', () => {
  const thisYear = new Date().getFullYear()

  const mixedRecords: GivingRecord[] = [
    {
      id: 'r1', church_id: 'c1', person_id: 'p1', amount: 500,
      date: `${thisYear}-02-01`, method: 'check', fund: 'General',
      source: 'manual', is_online: false,
    },
    {
      id: 'r2', church_id: 'c1', person_id: 'p1', amount: 100,
      date: `${thisYear}-03-01`, method: 'online_card', fund: 'General',
      source: 'stripe', is_online: true, frequency: 'one_time',
    },
    {
      id: 'r3', church_id: 'c1', person_id: 'p2', amount: 200,
      date: `${thisYear}-03-15`, method: 'online_card', fund: 'Missions',
      source: 'stripe', is_online: true, frequency: 'monthly',
    },
  ]

  it('online-only summary excludes manual records', () => {
    const online = mixedRecords.filter(r => r.is_online === true)
    const summary = computeGivingSummary(online)
    expect(summary.ytd).toBe(300) // 100 + 200
    expect(summary.totalRecords).toBe(2)
  })

  it('all-giving summary includes both', () => {
    const summary = computeGivingSummary(mixedRecords)
    expect(summary.ytd).toBe(800) // 500 + 100 + 200
    expect(summary.totalRecords).toBe(3)
  })

  it('online-only fund breakdown excludes manual funds', () => {
    const online = mixedRecords.filter(r => r.is_online === true)
    const summary = computeGivingSummary(online)
    const funds = summary.fundBreakdown.map(f => f.fund)
    expect(funds).toContain('General')
    expect(funds).toContain('Missions')
    // Both online — but the manual General record should NOT inflate it
    const generalFund = summary.fundBreakdown.find(f => f.fund === 'General')
    expect(generalFund?.total).toBe(100)
  })
})

// ── RecurringSubscription CRUD ────────────────────────────────────────────────

describe('createRecurringSubscription', () => {
  it('creates a subscription with status active', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({
      personId: person.id,
      amount: 50,
      frequency: 'monthly',
      fundId: 'general',
      donorName: 'Alice Smith',
    })
    expect(sub.status).toBe('active')
    expect(sub.person_id).toBe(person.id)
    expect(sub.amount).toBe(50)
    expect(sub.frequency).toBe('monthly')
    expect(sub.fund_id).toBe('general')
    expect(sub.donor_name).toBe('Alice Smith')
  })

  it('stores donor_email when provided', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({
      personId: person.id,
      amount: 100,
      frequency: 'weekly',
      fundId: 'missions',
      donorEmail: 'donor@example.com',
    })
    expect(sub.donor_email).toBe('donor@example.com')
  })

  it('stores stripe ids when provided', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({
      personId: person.id,
      amount: 200,
      frequency: 'annually',
      fundId: 'building',
      stripeSubscriptionId: 'sub_test_abc',
      stripeCustomerId: 'cus_test_xyz',
    })
    expect(sub.stripe_subscription_id).toBe('sub_test_abc')
    expect(sub.stripe_customer_id).toBe('cus_test_xyz')
  })

  it('records created_at timestamp', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({
      personId: person.id,
      amount: 25,
      frequency: 'bi_weekly',
      fundId: 'general',
    })
    expect(sub.created_at).toBeTruthy()
    expect(typeof sub.created_at).toBe('string')
  })
})

describe('getRecurringSubscriptions', () => {
  it('returns all subscriptions for this church', async () => {
    const person = await getFirstPerson()
    await createRecurringSubscription({ personId: person.id, amount: 50, frequency: 'monthly', fundId: 'general' })
    await createRecurringSubscription({ personId: person.id, amount: 100, frequency: 'weekly', fundId: 'missions' })

    const subs = await getRecurringSubscriptions()
    expect(subs.length).toBeGreaterThanOrEqual(2)
  })

  it('filters by status when provided', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({ personId: person.id, amount: 50, frequency: 'monthly', fundId: 'general' })
    await cancelRecurringSubscription(sub.id)

    const active = await getRecurringSubscriptions({ status: 'active' })
    expect(active.every(s => s.status === 'active')).toBe(true)

    const cancelled = await getRecurringSubscriptions({ status: 'cancelled' })
    expect(cancelled.some(s => s.id === sub.id)).toBe(true)
  })

  it('returns newest-first', async () => {
    const person = await getFirstPerson()
    await createRecurringSubscription({ personId: person.id, amount: 10, frequency: 'monthly', fundId: 'general' })
    await createRecurringSubscription({ personId: person.id, amount: 20, frequency: 'monthly', fundId: 'missions' })

    const subs = await getRecurringSubscriptions()
    for (let i = 1; i < subs.length; i++) {
      expect(subs[i - 1].created_at >= subs[i].created_at).toBe(true)
    }
  })
})

describe('cancelRecurringSubscription', () => {
  it('sets status to cancelled', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({ personId: person.id, amount: 75, frequency: 'monthly', fundId: 'general' })
    expect(sub.status).toBe('active')

    const cancelled = await cancelRecurringSubscription(sub.id)
    expect(cancelled.status).toBe('cancelled')
  })

  it('sets cancelled_at timestamp', async () => {
    const person = await getSecondPerson()
    const sub = await createRecurringSubscription({ personId: person.id, amount: 50, frequency: 'weekly', fundId: 'general' })
    const cancelled = await cancelRecurringSubscription(sub.id)

    expect(cancelled.cancelled_at).toBeTruthy()
    expect(typeof cancelled.cancelled_at).toBe('string')
  })

  it('cancelled subscription appears in getRecurringSubscriptions', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({ personId: person.id, amount: 100, frequency: 'annually', fundId: 'building' })
    await cancelRecurringSubscription(sub.id)

    const all = await getRecurringSubscriptions()
    const found = all.find(s => s.id === sub.id)
    expect(found?.status).toBe('cancelled')
  })

  it('throws when subscription not found', async () => {
    await expect(cancelRecurringSubscription('nonexistent-id')).rejects.toThrow()
  })
})

// ── updateRecurringSubscription ───────────────────────────────────────────────

describe('db.updateRecurringSubscription', () => {
  it('updates amount', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({ personId: person.id, amount: 50, frequency: 'monthly', fundId: 'general' })
    const updated = await db.updateRecurringSubscription(sub.id, { amount: 75 })
    expect(updated.amount).toBe(75)
  })

  it('updates fund_id', async () => {
    const person = await getFirstPerson()
    const sub = await createRecurringSubscription({ personId: person.id, amount: 50, frequency: 'monthly', fundId: 'general' })
    const updated = await db.updateRecurringSubscription(sub.id, { fund_id: 'missions' })
    expect(updated.fund_id).toBe('missions')
  })

  it('throws when not found', async () => {
    await expect(db.updateRecurringSubscription('nonexistent-id', { amount: 100 })).rejects.toThrow()
  })
})

// ── formatFrequency ───────────────────────────────────────────────────────────

describe('formatFrequency', () => {
  it('formats all frequency values', () => {
    expect(formatFrequency('one_time')).toBe('One-time')
    expect(formatFrequency('weekly')).toBe('Weekly')
    expect(formatFrequency('bi_weekly')).toBe('Bi-weekly')
    expect(formatFrequency('monthly')).toBe('Monthly')
    expect(formatFrequency('annually')).toBe('Annually')
  })
})
