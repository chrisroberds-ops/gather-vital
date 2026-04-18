import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveConfirmationToken, type ConfirmResult } from '@/services/confirmation-token-service'

type State =
  | { status: 'loading' }
  | { status: 'done'; result: ConfirmResult; action: 'confirm' | 'decline' }
  | { status: 'error'; message: string }

export default function ConfirmPage() {
  const [params] = useSearchParams()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const token = params.get('token') ?? ''
    const actionParam = params.get('action')

    if (!token) {
      setState({ status: 'error', message: 'No confirmation token provided.' })
      return
    }

    if (actionParam !== 'confirm' && actionParam !== 'decline') {
      setState({ status: 'error', message: 'Invalid action. Use ?action=confirm or ?action=decline.' })
      return
    }

    const action = actionParam

    resolveConfirmationToken(token, action)
      .then(result => setState({ status: 'done', result, action }))
      .catch(() => setState({ status: 'error', message: 'Something went wrong. Please try again or contact your church.' }))
  }, [params])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
        {state.status === 'loading' && (
          <>
            <div className="text-4xl">⏳</div>
            <h1 className="text-xl font-bold text-gray-900">Processing…</h1>
            <p className="text-sm text-gray-500">Please wait while we confirm your response.</p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
            <p className="text-sm text-gray-500">{state.message}</p>
          </>
        )}

        {state.status === 'done' && !state.result.ok && (
          <>
            {state.result.reason === 'already_used' && (
              <>
                <div className="text-4xl">✅</div>
                <h1 className="text-xl font-bold text-gray-900">Already responded</h1>
                <p className="text-sm text-gray-500">
                  This link has already been used. Your response has been recorded.
                </p>
              </>
            )}
            {state.result.reason === 'expired' && (
              <>
                <div className="text-4xl">⏰</div>
                <h1 className="text-xl font-bold text-gray-900">Link expired</h1>
                <p className="text-sm text-gray-500">
                  This confirmation link has expired (links are valid for 7 days).
                  Please contact your church administrator.
                </p>
              </>
            )}
            {state.result.reason === 'not_found' && (
              <>
                <div className="text-4xl">🔍</div>
                <h1 className="text-xl font-bold text-gray-900">Link not found</h1>
                <p className="text-sm text-gray-500">
                  This confirmation link is invalid or has already been deleted.
                  Please contact your church administrator.
                </p>
              </>
            )}
          </>
        )}

        {state.status === 'done' && state.result.ok && (
          <SuccessView result={state.result} action={state.action} />
        )}
      </div>
    </div>
  )
}

function SuccessView({ result, action }: { result: Extract<ConfirmResult, { ok: true }>; action: 'confirm' | 'decline' }) {
  const { token } = result
  const isConfirm = action === 'confirm'

  return (
    <>
      <div className="text-5xl">{isConfirm ? '🎉' : '👋'}</div>

      {token.purpose === 'volunteer' && (
        <>
          <h1 className="text-xl font-bold text-gray-900">
            {isConfirm ? 'You\'re confirmed!' : 'Got it — you\'re marked as unavailable'}
          </h1>
          <p className="text-sm text-gray-600">
            {isConfirm
              ? `We\'ve confirmed your spot${token.role ? ` as ${token.role}` : ''}${token.service_date ? ` on ${token.service_date}` : ''}.`
              : `We\'ve noted your unavailability${token.service_date ? ` for ${token.service_date}` : ''}. The schedule coordinator will follow up.`
            }
          </p>
        </>
      )}

      {token.purpose === 'event' && (
        <>
          <h1 className="text-xl font-bold text-gray-900">
            {isConfirm ? 'Registration confirmed!' : 'Registration cancelled'}
          </h1>
          <p className="text-sm text-gray-600">
            {isConfirm
              ? `Your registration${token.event_name ? ` for ${token.event_name}` : ''} has been confirmed.`
              : `Your registration${token.event_name ? ` for ${token.event_name}` : ''} has been cancelled.`
            }
          </p>
        </>
      )}

      {token.purpose === 'group_waitlist' && (
        <>
          <h1 className="text-xl font-bold text-gray-900">
            {isConfirm ? 'Welcome to the group!' : 'Waitlist spot released'}
          </h1>
          <p className="text-sm text-gray-600">
            {isConfirm
              ? `You\'ve been added${token.group_name ? ` to ${token.group_name}` : ' to the group'}.`
              : `Your waitlist spot${token.group_name ? ` for ${token.group_name}` : ''} has been released.`
            }
          </p>
        </>
      )}

      {token.church_name && (
        <p className="text-xs text-gray-400 pt-2">— {token.church_name}</p>
      )}
    </>
  )
}
