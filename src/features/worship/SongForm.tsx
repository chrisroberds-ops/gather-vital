import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createSong, updateSong, getSong } from './worship-service'
import { inputCls, labelCls } from '@/features/setup/SetupWizard'
import Button from '@/shared/components/Button'
import Spinner from '@/shared/components/Spinner'

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
              'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm']

interface SongFormProps {
  mode: 'create' | 'edit'
}

export default function SongForm({ mode }: SongFormProps) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [key, setKey] = useState('')
  const [bpm, setBpm] = useState('')
  const [ccli, setCcli] = useState('')
  const [youtube, setYoutube] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [lyrics, setLyrics] = useState('')

  useEffect(() => {
    if (mode === 'edit' && id) {
      getSong(id).then(song => {
        if (song) {
          setTitle(song.title)
          setArtist(song.artist ?? '')
          setKey(song.key ?? '')
          setBpm(song.bpm ? String(song.bpm) : '')
          setCcli(song.ccli_number ?? '')
          setYoutube(song.youtube_url ?? '')
          setTagsInput(song.tags?.join(', ') ?? '')
          setLyrics(song.lyrics ?? '')
        }
        setLoading(false)
      })
    }
  }, [mode, id])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const data = {
        title: title.trim(),
        artist: artist.trim() || undefined,
        key: key || undefined,
        bpm: bpm ? parseInt(bpm) : undefined,
        ccli_number: ccli.trim() || undefined,
        youtube_url: youtube.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        lyrics: lyrics.trim() || undefined,
      }
      if (mode === 'create') {
        await createSong(data)
      } else if (id) {
        await updateSong(id, data)
      }
      navigate('/admin/worship/songs')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/worship/songs')}
          className="text-gray-400 hover:text-gray-600 p-1 rounded">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{mode === 'create' ? 'Add Song' : 'Edit Song'}</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div>
          <label className={labelCls}>Title *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Song title" autoFocus className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Artist</label>
            <input type="text" value={artist} onChange={e => setArtist(e.target.value)}
              placeholder="Artist or songwriter" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Key</label>
            <select value={key} onChange={e => setKey(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">—</option>
              {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>BPM</label>
            <input type="number" value={bpm} onChange={e => setBpm(e.target.value)}
              placeholder="120" min="40" max="240" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>CCLI #</label>
            <input type="text" value={ccli} onChange={e => setCcli(e.target.value)}
              placeholder="1234567" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>YouTube / Planning Center URL</label>
          <input type="url" value={youtube} onChange={e => setYoutube(e.target.value)}
            placeholder="https://youtube.com/..." className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Tags <span className="text-gray-400 font-normal">(comma-separated)</span></label>
          <input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
            placeholder="worship, contemporary, christmas" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Lyrics / Notes</label>
          <textarea value={lyrics} onChange={e => setLyrics(e.target.value)}
            rows={8} placeholder="Paste lyrics or notes here…"
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y" />
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={() => navigate('/admin/worship/songs')}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!title.trim()}>
            {mode === 'create' ? 'Add Song' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
