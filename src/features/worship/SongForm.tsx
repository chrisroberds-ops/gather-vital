import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createSong, updateSong, getSong } from './worship-service'
import { inputCls, labelCls } from '@/features/setup/SetupWizard'
import { uploadSongPdf, uploadSongAudio, validateSongPdf, validateSongAudio } from '@/services/storage-service'
import { isTestMode } from '@/config/firebase'
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

  // File attachment state (edit mode only)
  const [pdfList, setPdfList] = useState<string[]>([])
  const [audioUrl, setAudioUrl] = useState('')
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

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
          // Merge chord_chart_url (first/primary) + pdf_urls (additional)
          const merged = [
            ...(song.chord_chart_url ? [song.chord_chart_url] : []),
            ...(song.pdf_urls ?? []),
          ]
          setPdfList(merged)
          setAudioUrl(song.demo_url ?? '')
        }
        setLoading(false)
      })
    }
  }, [mode, id])

  async function persistPdfs(list: string[]) {
    if (!id) return
    await updateSong(id, {
      chord_chart_url: list[0] ?? undefined,
      pdf_urls: list.slice(1),
    })
  }

  async function handlePdfFile(file: File) {
    setFileError(null)
    const err = validateSongPdf(file)
    if (err) { setFileError(err); return }
    setUploadingPdf(true)
    try {
      const url = await uploadSongPdf(file)
      const next = [...pdfList, url]
      setPdfList(next)
      await persistPdfs(next)
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingPdf(false)
    }
  }

  async function handleRemovePdf(index: number) {
    const next = pdfList.filter((_, i) => i !== index)
    setPdfList(next)
    await persistPdfs(next)
  }

  async function handleAudioFile(file: File) {
    setFileError(null)
    const err = validateSongAudio(file)
    if (err) { setFileError(err); return }
    setUploadingAudio(true)
    try {
      const url = await uploadSongAudio(file)
      setAudioUrl(url)
      if (id) await updateSong(id, { demo_url: url })
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingAudio(false)
    }
  }

  async function handleRemoveAudio() {
    setAudioUrl('')
    if (id) await updateSong(id, { demo_url: undefined })
  }

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

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4" id="song-metadata">
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

      {mode === 'edit' && (
        <SongFileAttachments
          pdfList={pdfList}
          audioUrl={audioUrl}
          uploadingPdf={uploadingPdf}
          uploadingAudio={uploadingAudio}
          fileError={fileError}
          onPdfFile={handlePdfFile}
          onRemovePdf={handleRemovePdf}
          onAudioFile={handleAudioFile}
          onRemoveAudio={handleRemoveAudio}
        />
      )}
    </div>
  )
}

// ── File attachment section ───────────────────────────────────────────────────

interface FileAttachmentsProps {
  pdfList: string[]
  audioUrl: string
  uploadingPdf: boolean
  uploadingAudio: boolean
  fileError: string | null
  onPdfFile: (file: File) => void
  onRemovePdf: (index: number) => void
  onAudioFile: (file: File) => void
  onRemoveAudio: () => void
}

function SongFileAttachments({
  pdfList, audioUrl, uploadingPdf, uploadingAudio, fileError,
  onPdfFile, onRemovePdf, onAudioFile, onRemoveAudio,
}: FileAttachmentsProps) {
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent, handler: (f: File) => void) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handler(file)
  }

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
      <h2 className="font-semibold text-gray-900">Files</h2>

      {isTestMode && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>Test mode:</strong> Files are stored locally as data URLs. In production, files upload to Firebase Storage.
        </div>
      )}

      {fileError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {fileError}
        </div>
      )}

      {/* PDF section */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          Chord Charts / PDFs
          <span className="text-gray-400 font-normal ml-1">(PDF only, max 10 MB each)</span>
        </p>

        {pdfList.length > 0 && (
          <ul className="mb-3 space-y-1">
            {pdfList.map((url, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <span className="flex-1 truncate">{i === 0 ? 'Chord Chart' : `PDF ${i + 1}`}</span>
                {url.startsWith('data:') ? (
                  <span className="text-xs text-gray-400">local</span>
                ) : (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">open</a>
                )}
                <button
                  onClick={() => void onRemovePdf(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => handleDrop(e, onPdfFile)}
          onClick={() => pdfInputRef.current?.click()}
        >
          {uploadingPdf ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Spinner size="sm" /> Uploading…
            </div>
          ) : (
            <>
              <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-gray-500">Drag & drop a PDF or <span className="text-primary-600 font-medium">click to browse</span></p>
            </>
          )}
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onPdfFile(f); e.target.value = '' }}
          />
        </div>
      </div>

      {/* Audio section */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          Demo Recording
          <span className="text-gray-400 font-normal ml-1">(MP3 or M4A, max 50 MB)</span>
        </p>

        {audioUrl ? (
          <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-3">
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
            </svg>
            <span className="flex-1 truncate">Demo Recording</span>
            {audioUrl.startsWith('data:') ? (
              <span className="text-xs text-gray-400">local</span>
            ) : (
              <a href={audioUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">open</a>
            )}
            <button
              onClick={() => void onRemoveAudio()}
              className="text-gray-400 hover:text-red-500 transition-colors ml-1"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-colors"
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop(e, onAudioFile)}
            onClick={() => audioInputRef.current?.click()}
          >
            {uploadingAudio ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Spinner size="sm" /> Uploading…
              </div>
            ) : (
              <>
                <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-gray-500">Drag & drop MP3/M4A or <span className="text-primary-600 font-medium">click to browse</span></p>
              </>
            )}
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onAudioFile(f); e.target.value = '' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
