import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { setCurrentUserForGuards } from './guards'
import { AccessTier } from '@/shared/types'
import { isTestMode } from '@/config/firebase'
import { tierHomePath } from '@/shared/utils/tierNav'

type Tab = 'email' | 'google'

const TEST_TIERS: Array<{ label: string; tier: AccessTier; finance?: boolean }> = [
  { label: 'Public (not logged in)', tier: AccessTier.Public },
  { label: 'Authenticated User', tier: AccessTier.Authenticated },
  { label: 'Group Leader', tier: AccessTier.GroupLeader },
  { label: 'Staff', tier: AccessTier.Staff },
  { label: 'Executive', tier: AccessTier.Executive },
  { label: 'Staff + Finance Admin', tier: AccessTier.Staff, finance: true },
]

export default function LoginPage() {
  const { signIn, signInWithGoogle, setTestTier } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/admin'

  const [tab, setTab] = useState<Tab>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  function handleTestTier(tier: AccessTier, finance = false) {
    // Update the guard reference synchronously before navigate so the loader sees the new tier.
    setCurrentUserForGuards({ tier, isFinanceAdmin: finance })
    setTestTier(tier, finance)
    navigate(tierHomePath(tier), { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gather</h1>
          <p className="text-gray-500 mt-1">Church Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {isTestMode && (
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">TEST MODE — Login as:</p>
              <div className="flex flex-wrap gap-2">
                {TEST_TIERS.map(({ label, tier, finance }) => (
                  <button
                    key={label}
                    onClick={() => handleTestTier(tier, finance)}
                    className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1 rounded-full transition-colors font-medium"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-6">
            <div className="flex border-b border-gray-200 mb-6">
              {(['email', 'google'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 pb-3 text-sm font-medium transition-colors capitalize ${
                    tab === t
                      ? 'border-b-2 border-primary-600 text-primary-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'email' ? 'Email & Password' : 'Google Sign-In'}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {tab === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={isTestMode ? 'staff@test.com' : 'you@example.com'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={isTestMode ? 'any password in test mode' : ''}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}

            {tab === 'google' && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-4">
                  Staff members sign in with their Google Workspace account.
                </p>
                <button
                  onClick={handleGoogle}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {loading ? 'Signing in…' : 'Sign in with Google'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
