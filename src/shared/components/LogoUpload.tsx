/**
 * LogoUpload — file upload component for church logo.
 * Accepts PNG and JPG only, max 2 MB.
 * Shows a preview of the current logo and allows replacing or removing it.
 * Calls onChange(url) on successful upload; onChange('') on remove.
 */

import { useRef, useState } from 'react'
import { uploadLogo, validateLogoFile } from '@/services/storage-service'
import Spinner from './Spinner'

interface Props {
  value: string | undefined
  onChange: (url: string) => void
}

export default function LogoUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    const validationError = validateLogoFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setUploading(true)
    try {
      const url = await uploadLogo(file)
      onChange(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    // Reset so the same file can be re-selected after removal.
    e.target.value = ''
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0 p-1">
            <img src={value} alt="Logo preview" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
            >
              {uploading ? <Spinner size="sm" /> : null}
              {uploading ? 'Uploading…' : 'Replace logo'}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); onChange('') }}
              disabled={uploading}
              className="block text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-3 w-full border-2 border-dashed border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors disabled:opacity-50 text-left"
        >
          {uploading
            ? <Spinner size="sm" />
            : <span className="text-2xl leading-none">🖼️</span>
          }
          <span>{uploading ? 'Uploading…' : 'Upload logo — PNG or JPG, max 2 MB'}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleChange}
        aria-label="Upload church logo"
      />

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
