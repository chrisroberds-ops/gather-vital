import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { searchSongs, deleteSong, cleanupImportedSongs } from './worship-service'
import SongImportModal from './SongImportModal'
import type { Song } from '@/shared/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import Button from '@/shared/components/Button'
import Badge from '@/shared/components/Badge'
import EmptyState from '@/shared/components/EmptyState'
import Spinner from '@/shared/components/Spinner'

export default function SongLibrary() {
  const navigate = useNavigate()
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showImport, setShowImport] = useState(false)
  const debouncedQuery = useDebounce(query, 300)

  function reload() {
    setLoading(true)
    searchSongs(debouncedQuery).then(s => { setSongs(s); setLoading(false) })
  }

  useEffect(() => {
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  async function handleDelete(song: Song) {
    if (!confirm(`Remove "${song.title}" from the library?`)) return
    await deleteSong(song.id)
    setSongs(prev => prev.filter(s => s.id !== song.id))
  }

  function handleCleanup() {
    const removed = cleanupImportedSongs()
    if (removed === 0) {
      alert('Nothing to clean up — no junk songs found.')
    } else {
      alert(`Removed ${removed} imported song${removed !== 1 ? 's' : ''}. The 6 seeded hymns and any songs with uploaded files were kept.`)
      reload()
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Song Library</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${songs.length} song${songs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/worship/ccli"
            className="text-sm px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          >
            CCLI Report
          </Link>
          <Button variant="danger" onClick={handleCleanup} title="Remove all songs except the 6 seeded hymns and songs with uploaded files">
            Clean up imports
          </Button>
          <Button variant="secondary" onClick={() => navigate('/admin/worship/songs/bulk-pdf')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Upload PDFs
          </Button>
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Import
          </Button>
          <Button onClick={() => navigate('/admin/worship/songs/new')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Song
          </Button>
        </div>
      </div>

      <SongImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => { setShowImport(false); reload() }}
        onUploadChordCharts={() => { setShowImport(false); navigate('/admin/worship/songs/bulk-pdf') }}
      />

      <div className="mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by title, artist, key, or tag…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-md" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : songs.length === 0 ? (
          <EmptyState title={query ? 'No results' : 'No songs yet'}
            description={query ? `No songs matched "${query}".` : 'Add the first song to get started.'}
            action={!query ? <Button onClick={() => navigate('/admin/worship/songs/new')}>Add Song</Button> : undefined} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden sm:table-cell">Artist</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Key</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">BPM</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">CCLI</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden xl:table-cell">Tags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {songs.map(song => (
                <tr key={song.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{song.title}</div>
                    {song.youtube_url && (
                      <a href={song.youtube_url} target="_blank" rel="noreferrer"
                        className="text-xs text-primary-600 hover:underline" onClick={e => e.stopPropagation()}>
                        ▶ Listen
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{song.artist ?? '—'}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {song.key ? <Badge variant="info">{song.key}</Badge> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{song.bpm ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{song.ccli_number ?? '—'}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(song.tags ?? []).map(tag => (
                        <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => navigate(`/admin/worship/songs/${song.id}/edit`)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium">Edit</button>
                      <button onClick={() => void handleDelete(song)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    </div>
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
