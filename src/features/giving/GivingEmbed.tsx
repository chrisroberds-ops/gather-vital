import { useState } from 'react'
import { useAppConfig } from '@/services/app-config-context'
import { createOnlineGivingRecord, createRecurringSubscription, formatFrequency } from './giving-service'
import { db } from '@/services'
import Button from '@/shared/components/Button'
import type { GivingFrequency, GivingFund } from '@/shared/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const STRIPE_FEE_RATE = 0.029   // 2.9%
const STRIPE_FEE_FIXED = 0.30   // $0.30

const FREQUENCY_OPTIONS: { value: GivingFrequency; label: string }[] = [
  { value: 'one_time',  label: 'One-time' },
  { value: 'weekly',    label: 'Weekly' },
  { value: 'bi_weekly', label: 'Bi-weekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'annually',  label: 'Annually' },
]

const inputCls = 'border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

// ── Fee calculator ────────────────────────────────────────────────────────────

function calcFee(amount: number): number {
  // Gross-up: solve for gross such that gross - fee = amount
  // gross * (1 - rate) - fixed = amount  →  gross = (amount + fixed) / (1 - rate)
  if (amount <= 0) return 0
  const grossed = (amount + STRIPE_FEE_FIXED) / (1 - STRIPE_FEE_RATE)
  return Math.round((grossed - amount) * 100) / 100
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function AmountPresets({
  presets,
  selected,
  onSelect,
}: {
  presets: number[]
  selected: number | null
  onSelect: (v: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            selected === p
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ${p}
        </button>
      ))}
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────

interface ConfirmationData {
  amount: number
  fund: string
  frequency: GivingFrequency
  email: string
  coverFee: boolean
  feeAmount: number
}

function SuccessScreen({
  data,
  churchName,
  onReset,
}: {
  data: ConfirmationData
  churchName: string
  onReset: () => void
}) {
  const total = data.coverFee ? data.amount + data.feeAmount : data.amount

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-8 space-y-5 bg-white">
      <div className="text-6xl">🎉</div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Thank you!</h1>
        <p className="text-gray-500 mt-1 text-sm">Your gift to {churchName} has been received.</p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 w-full max-w-xs text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Amount</span>
          <span className="font-semibold text-gray-900">${total.toFixed(2)}</span>
        </div>
        {data.coverFee && (
          <div className="flex justify-between text-xs text-gray-400">
            <span>Includes ${data.feeAmount.toFixed(2)} processing fee</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Fund</span>
          <span className="font-medium text-gray-800">{data.fund}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Frequency</span>
          <span className="font-medium text-gray-800">{formatFrequency(data.frequency)}</span>
        </div>
      </div>

      {data.email && (
        <p className="text-sm text-gray-500">
          A receipt will be sent to <span className="font-medium text-gray-700">{data.email}</span>
        </p>
      )}

      <Button variant="secondary" onClick={onReset}>Give again</Button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Step = 'form' | 'success'

export default function GivingEmbed() {
  const { config } = useAppConfig()

  const presets = config.giving_preset_amounts ?? [25, 50, 100, 250]
  const funds: GivingFund[] = config.giving_funds ?? [{ id: 'general', name: 'General Fund' }]
  const isMultiFund = funds.length > 1

  // ── Form state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('form')
  const [presetSelected, setPresetSelected] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [fundId, setFundId] = useState(funds[0]?.id ?? 'general')
  const [frequency, setFrequency] = useState<GivingFrequency>('one_time')
  const [coverFee, setCoverFee] = useState(false)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmData, setConfirmData] = useState<ConfirmationData | null>(null)

  // ── Derived values ──────────────────────────────────────────────────────────
  const rawAmount = presetSelected !== null
    ? presetSelected
    : parseFloat(customAmount) || 0

  const feeAmount = calcFee(rawAmount)
  const totalAmount = coverFee ? rawAmount + feeAmount : rawAmount

  const selectedFund = funds.find(f => f.id === fundId) ?? funds[0]

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: Record<string, string> = {}

    if (rawAmount <= 0) {
      errs.amount = 'Please enter a donation amount.'
    } else if (rawAmount < 1) {
      errs.amount = 'Minimum donation is $1.00.'
    } else if (rawAmount > 10000) {
      errs.amount = 'Maximum donation is $10,000.00.'
    }

    if (isMultiFund && !fundId) {
      errs.fund = 'Please select a fund.'
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Enter a valid email address.'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      // Resolve or create a person record for this donor.
      // In TEST_MODE, look up by email or use the first person as placeholder.
      // TODO [Stripe]: In production, the person/customer is created/looked up
      //   server-side as part of the Stripe PaymentIntent creation flow.
      const people = await db.getPeople()
      let person = email ? people.find(p => p.email?.toLowerCase() === email.toLowerCase()) : null
      if (!person) person = people.find(p => !p.is_child && p.is_active) ?? people[0]

      if (!person) {
        setErrors({ amount: 'Could not resolve a donor profile. Add at least one person to the database.' })
        return
      }

      const isRecurring = frequency !== 'one_time'

      // TEST_MODE: skip Stripe calls, create GivingRecord directly.
      // TODO [Stripe]: Replace this block with a call to your server endpoint
      //   that creates a Stripe PaymentIntent (one-time) or Subscription (recurring),
      //   then redirects to the Stripe Payment Element confirmation flow.
      console.log('TEST_MODE: skipping Stripe payment processing')
      console.log('Donation data:', {
        amount: totalAmount,
        fund: selectedFund?.name,
        frequency,
        donorEmail: email || '(none)',
      })

      await createOnlineGivingRecord({
        personId: person.id,
        amount: totalAmount,
        fund: selectedFund?.name ?? 'General Fund',
        frequency,
        donorEmail: email || undefined,
      })

      if (isRecurring) {
        await createRecurringSubscription({
          personId: person.id,
          amount: totalAmount,
          frequency,
          fundId: fundId,
          donorName: `${person.first_name} ${person.last_name}`,
          donorEmail: email || person.email || undefined,
        })
      }

      setConfirmData({
        amount: rawAmount,
        fund: selectedFund?.name ?? 'General Fund',
        frequency,
        email,
        coverFee,
        feeAmount,
      })
      setStep('success')
    } catch (err) {
      console.error('Giving submit error:', err)
      setErrors({ amount: 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setStep('form')
    setPresetSelected(null)
    setCustomAmount('')
    setFundId(funds[0]?.id ?? 'general')
    setFrequency('one_time')
    setCoverFee(false)
    setEmail('')
    setErrors({})
    setConfirmData(null)
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (step === 'success' && confirmData) {
    return (
      <SuccessScreen
        data={confirmData}
        churchName={config.church_name}
        onReset={handleReset}
      />
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-md mx-auto">
      {/* Church branding */}
      <div className="text-center mb-6">
        {config.logo_url && (
          <img
            src={config.logo_url}
            alt={config.church_name}
            className="h-12 mx-auto mb-3 object-contain"
          />
        )}
        <h1 className="text-xl font-bold text-gray-900">Give to {config.church_name}</h1>
        <p className="text-xs text-gray-500 mt-0.5">Secure, encrypted online giving</p>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="space-y-5">

        {/* ── Amount ──────────────────────────────────────────────────────── */}
        <div>
          <label className={labelCls}>Donation amount *</label>
          <AmountPresets
            presets={presets}
            selected={presetSelected}
            onSelect={v => { setPresetSelected(v); setCustomAmount(''); setErrors(prev => ({ ...prev, amount: '' })) }}
          />
          <div className="mt-2 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
            <input
              type="number"
              min="1"
              max="10000"
              step="0.01"
              value={customAmount}
              onChange={e => {
                setCustomAmount(e.target.value)
                setPresetSelected(null)
                if (errors.amount) setErrors(prev => ({ ...prev, amount: '' }))
              }}
              placeholder="Custom amount"
              className={`${inputCls} pl-7`}
            />
          </div>
          {errors.amount && <p className="text-xs text-red-600 mt-1">{errors.amount}</p>}
        </div>

        {/* ── Fund designation (only if multiple funds) ────────────────────── */}
        {isMultiFund && (
          <div>
            <label className={labelCls}>Fund *</label>
            <select
              value={fundId}
              onChange={e => { setFundId(e.target.value); if (errors.fund) setErrors(prev => ({ ...prev, fund: '' })) }}
              className={inputCls}
            >
              {funds.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {errors.fund && <p className="text-xs text-red-600 mt-1">{errors.fund}</p>}
          </div>
        )}

        {/* ── Frequency ───────────────────────────────────────────────────── */}
        <div>
          <label className={labelCls}>Frequency</label>
          <div className="flex flex-wrap gap-1.5">
            {FREQUENCY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFrequency(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  frequency === opt.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Cover processing fee ─────────────────────────────────────────── */}
        {rawAmount > 0 && (
          <label className="flex items-start gap-3 cursor-pointer bg-gray-50 rounded-xl p-3">
            <input
              type="checkbox"
              checked={coverFee}
              onChange={e => setCoverFee(e.target.checked)}
              className="mt-0.5 accent-primary-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Cover the processing fee</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Add ${feeAmount.toFixed(2)} so 100% of your ${rawAmount.toFixed(2)} gift reaches {config.church_name}.
                {coverFee && (
                  <span className="font-medium text-gray-700"> Your total: ${totalAmount.toFixed(2)}</span>
                )}
              </p>
            </div>
          </label>
        )}

        {/* ── Email ───────────────────────────────────────────────────────── */}
        <div>
          <label className={labelCls}>Email for receipt (optional)</label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: '' })) }}
            placeholder="you@example.com"
            autoComplete="email"
            className={inputCls}
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
        </div>

        {/* ── Stripe Payment Element placeholder ──────────────────────────── */}
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center space-y-1">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Payment method</p>
          <p className="text-xs text-gray-400">
            {/* TODO [Stripe]: Mount the Stripe Payment Element here once Stripe keys are configured.
                Steps:
                1. Load Stripe.js: const stripe = await loadStripe(VITE_STRIPE_PUBLISHABLE_KEY)
                2. Create a PaymentIntent on your server and return the clientSecret
                3. Render <Elements stripe={stripe} options={{ clientSecret }}>
                4. Render <PaymentElement /> inside the Elements provider
                5. On submit, call stripe.confirmPayment({ elements, confirmParams }) */}
            Card / bank fields will appear here once Stripe is connected.
          </p>
          <p className="text-[10px] text-gray-300">Powered by Stripe (not yet wired)</p>
        </div>

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        <Button
          type="submit"
          loading={submitting}
          disabled={rawAmount <= 0}
          className="w-full justify-center text-base py-3"
        >
          {frequency === 'one_time'
            ? `Give ${totalAmount > 0 ? `$${totalAmount.toFixed(2)}` : ''}`
            : `Set up ${formatFrequency(frequency).toLowerCase()} gift${totalAmount > 0 ? ` of $${totalAmount.toFixed(2)}` : ''}`
          }
        </Button>

        <p className="text-[10px] text-center text-gray-400">
          Your payment information is encrypted and processed securely by Stripe.
          {' '}{config.church_name} never stores your card details.
        </p>
      </form>
    </div>
  )
}
