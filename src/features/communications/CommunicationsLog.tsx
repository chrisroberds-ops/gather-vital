import { useState, useEffect } from 'react'
import { db } from '@/services'
import type { CommunicationsLogEntry } from '@/shared/types'
import Spinner from '@/shared/components/Spinner'
import EmptyState from '@/shared/components/EmptyState'
import Badge from '@/shared/components/Badge'

type ChannelFilter = 'all' | 'email' | 'sms'

export default function CommunicationsLog() {
  const [entries, setEntries] = useState<CommunicationsLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [since, setSince] = useState('')

  useEffect(() => {
    setLoading(true)
    db.getCommunicationsLog({
      channel: channel === 'all' ? undefined : channel,
      since: since || undefined,
    }).then(e => { setEntries(e); setLoading(false) })
  }, [channel, since])

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Communications Log</h1>
        <p className="text-gray-500 text-sm mt-1">All notifications sent via Gather.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          {(['all', 'email', 'sms'] as ChannelFilter[]).map(f => (
            <button key={f} onClick={() => setChannel(f)}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${channel === f ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {f === 'all' ? 'All channels' : f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Since:</span>
          <input type="date" value={since} onChange={e => setSince(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          {since && (
            <button onClick={() => setSince('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : entries.length === 0 ? (
          <EmptyState title="No communications logged" description="Notifications sent via Gather will appear here." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Channel</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Recipient</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Subject / Preview</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(e => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(e.sent_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={e.channel === 'email' ? 'info' : 'purple'}>
                      {e.channel.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs truncate max-w-[140px]">{e.recipient}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs hidden md:table-cell truncate max-w-[200px]">{e.subject}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.success ? 'success' : 'danger'}>
                      {e.success ? 'Sent' : 'Failed'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
