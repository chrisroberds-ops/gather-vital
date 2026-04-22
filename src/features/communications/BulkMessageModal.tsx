import { useState, useEffect, useCallback } from 'react'
import { db } from '@/services'
import { useAppConfig } from '@/services/app-config-context'
import { useAuth } from '@/auth/AuthContext'
import { MERGE_FIELDS } from '@/services/notification-service'
import type { Person, Group, Team, EmailTemplate } from '@/shared/types'
import type { AudienceFilter, AudienceFilterType } from './bulk-messaging-service'
import {
  resolveAudienceFromDb,
  sendBulkEmail,
  renderForRecipient,
} from './bulk-messaging-service'
import Spinner from '@/shared/components/Spinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<AudienceFilterType, string> = {
  all_members: 'All members',
  all_volunteers: 'All volunteers',
  all_group_leaders: 'All group leaders',
  visitors_last_n_days: 'Recent visitors',
  group_members: 'Members of a specific group',
  team_volunteers: 'Members of a specific team',
  birthday_this_month: 'Birthdays this month',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onSent: () => void
}

// ── Step types ────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4

// ── Component ─────────────────────────────────────────────────────────────────

export default function BulkMessageModal({ onClose, onSent }: Props) {
  const { config } = useAppConfig()
  const { user } = useAuth()
  const churchName = config?.church_name ?? 'Your Church'
  const senderName = user?.displayName ?? user?.email ?? 'Staff'

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1)

  // ── Step 1: Audience ────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<AudienceFilter>({ type: 'all_members' })
  const [groups, setGroups] = useState<Group[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [audience, setAudience] = useState<Person[]>([])
  const [audienceLoading, setAudienceLoading] = useState(false)

  useEffect(() => {
    db.getGroups().then(setGroups)
    db.getTeams().then(setTeams)
  }, [])

  const resolveAudience = useCallback(async (f: AudienceFilter) => {
    setAudienceLoading(true)
    const people = await resolveAudienceFromDb(f)
    setAudience(people)
    setAudienceLoading(false)
  }, [])

  useEffect(() => {
    resolveAudience(filter)
  }, [filter, resolveAudience])

  // ── Step 2: Compose ─────────────────────────────────────────────────────────
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [showTemplateSave, setShowTemplateSave] = useState(false)

  useEffect(() => {
    db.getEmailTemplates().then(setTemplates)
  }, [])

  const loadTemplate = (t: EmailTemplate) => {
    setSubject(t.subject)
    setBody(t.body)
  }

  const saveTemplate = async () => {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    await db.saveEmailTemplate({ name: templateName.trim(), subject, body })
    const updated = await db.getEmailTemplates()
    setTemplates(updated)
    setTemplateName('')
    setShowTemplateSave(false)
    setSavingTemplate(false)
  }

  const insertMergeField = (token: string) => {
    setBody(b => b + token)
  }

  // ── Step 3: Preview ─────────────────────────────────────────────────────────
  const previewRecipients = audience.filter(p => p.email).slice(0, 5)

  // ── Step 4: Send ────────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)

  const handleSend = async () => {
    setSending(true)
    const res = await sendBulkEmail(audience, subject, body, senderName, churchName)
    setResult(res)
    setSending(false)
    onSent()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New Bulk Message</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {step} of 4 —{' '}
              {step === 1 ? 'Select audience'
                : step === 2 ? 'Compose message'
                : step === 3 ? 'Preview'
                : 'Confirm & send'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Step 1: Audience ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Audience</label>
                <div className="space-y-2">
                  {(Object.keys(FILTER_LABELS) as AudienceFilterType[]).map(type => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="audience"
                        checked={filter.type === type}
                        onChange={() => setFilter({ type })}
                        className="accent-primary-600"
                      />
                      <span className="text-sm text-gray-700">{FILTER_LABELS[type]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Sub-options */}
              {filter.type === 'visitors_last_n_days' && (
                <div className="flex items-center gap-2 ml-5">
                  <label className="text-sm text-gray-600">Last</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={filter.days ?? 30}
                    onChange={e => setFilter(f => ({ ...f, days: Number(e.target.value) }))}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <label className="text-sm text-gray-600">days</label>
                </div>
              )}

              {filter.type === 'group_members' && (
                <div className="ml-5">
                  <select
                    value={filter.groupId ?? ''}
                    onChange={e => setFilter(f => ({ ...f, groupId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select a group…</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {filter.type === 'team_volunteers' && (
                <div className="ml-5">
                  <select
                    value={filter.teamId ?? ''}
                    onChange={e => setFilter(f => ({ ...f, teamId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select a team…</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Live count */}
              <div className={`rounded-lg px-4 py-3 text-sm font-medium ${audience.length === 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-primary-50 text-primary-800'}`}>
                {audienceLoading ? (
                  <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Calculating…</span>
                ) : audience.length === 0 ? (
                  '⚠ No recipients match this filter — adjust your selection before continuing.'
                ) : (
                  `${audience.length} recipient${audience.length === 1 ? '' : 's'} selected (${audience.filter(p => p.email).length} with email)`
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Compose ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Template picker */}
              {templates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Load template</label>
                  <select
                    defaultValue=""
                    onChange={e => {
                      const t = templates.find(t => t.id === e.target.value)
                      if (t) loadTemplate(t)
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Choose a saved template…</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Subject line"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={8}
                  placeholder="Write your message here…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {/* Merge field helper */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Insert merge field</p>
                <div className="flex flex-wrap gap-1">
                  {MERGE_FIELDS.map(({ token, description }) => (
                    <button
                      key={token}
                      onClick={() => insertMergeField(token)}
                      title={description}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-mono"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>

              {/* SMS placeholder */}
              <div className="flex items-center gap-2 opacity-40 cursor-not-allowed select-none">
                <input type="radio" disabled />
                <span className="text-sm text-gray-500">SMS — <span className="text-gray-400">Coming soon</span></span>
              </div>

              {/* Save as template */}
              {!showTemplateSave ? (
                <button
                  onClick={() => setShowTemplateSave(true)}
                  className="text-sm text-primary-600 hover:underline"
                >
                  Save as template…
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={saveTemplate}
                    disabled={savingTemplate || !templateName.trim()}
                    className="text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {savingTemplate ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setShowTemplateSave(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Preview ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Preview of the first {previewRecipients.length} recipient{previewRecipients.length !== 1 ? 's' : ''} with email addresses.
              </p>
              {previewRecipients.length === 0 ? (
                <p className="text-sm text-yellow-700 bg-yellow-50 rounded-lg px-4 py-3">
                  No recipients have email addresses. Only people with email on file will receive this message.
                </p>
              ) : (
                previewRecipients.map(person => (
                  <div key={person.id} className="border border-gray-200 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-gray-400">{person.email}</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {renderForRecipient(subject, person, churchName) || <span className="italic text-gray-400">(no subject)</span>}
                    </p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {renderForRecipient(body, person, churchName) || <span className="italic text-gray-400">(no body)</span>}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Step 4: Confirm & send ── */}
          {step === 4 && !result && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl px-4 py-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total recipients</span>
                  <span className="font-medium text-gray-900">{audience.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">With email address</span>
                  <span className="font-medium text-gray-900">{audience.filter(p => p.email).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Subject</span>
                  <span className="font-medium text-gray-900 truncate max-w-[60%] text-right">{subject || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Sent by</span>
                  <span className="font-medium text-gray-900">{senderName}</span>
                </div>
              </div>

              {audience.filter(p => p.email).length === 0 && (
                <p className="text-sm text-yellow-700 bg-yellow-50 rounded-lg px-4 py-3">
                  ⚠ No recipients have email addresses on file. Nothing will be sent.
                </p>
              )}

              {sending && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Spinner className="w-4 h-4" />
                  Sending…
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Success ── */}
          {step === 4 && result && (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">✓</div>
              <p className="text-lg font-semibold text-gray-900">Message sent!</p>
              <p className="text-sm text-gray-500">
                {result.sent} email{result.sent !== 1 ? 's' : ''} delivered
                {result.failed > 0 ? `, ${result.failed} failed` : ''}.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as Step)}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 && (
            <button
              onClick={() => setStep(s => (s + 1) as Step)}
              disabled={
                (step === 1 && (audience.filter(p => p.email).length === 0 || audienceLoading)) ||
                (step === 2 && (!subject.trim() || !body.trim()))
              }
              className="text-sm px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {step === 3 ? 'Confirm →' : 'Next →'}
            </button>
          )}

          {step === 4 && !result && (
            <button
              onClick={handleSend}
              disabled={sending || audience.filter(p => p.email).length === 0}
              className="text-sm px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {sending ? 'Sending…' : `Send to ${audience.filter(p => p.email).length} recipients`}
            </button>
          )}

          {step === 4 && result && (
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
