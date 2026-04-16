/**
 * Audio player for song demo MP3s.
 * Supports play/pause, scrubbing, and section looping.
 * Plays in the background while viewing the PDF.
 */

import { useEffect, useRef, useState } from 'react'

interface AudioPlayerProps {
  src: string
  title?: string
}

function formatTime(s: number): string {
  if (isNaN(s) || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loopStart, setLoopStart] = useState<number | null>(null)
  const [loopEnd, setLoopEnd] = useState<number | null>(null)
  const [isLooping, setIsLooping] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      // Section loop
      if (isLooping && loopStart !== null && loopEnd !== null) {
        if (audio.currentTime >= loopEnd) {
          audio.currentTime = loopStart
        }
      }
    }
    const onLoaded = () => setDuration(audio.duration)
    const onEnded = () => {
      if (isLooping && loopStart !== null) {
        audio.currentTime = loopStart
        audio.play().catch(() => {})
      } else {
        setIsPlaying(false)
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
    }
  }, [isLooping, loopStart, loopEnd])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Number(e.target.value)
  }

  function setLoopPoint(type: 'start' | 'end') {
    if (type === 'start') setLoopStart(currentTime)
    else setLoopEnd(currentTime)
  }

  function clearLoop() {
    setLoopStart(null)
    setLoopEnd(null)
    setIsLooping(false)
  }

  const canLoop = loopStart !== null && loopEnd !== null && loopEnd > loopStart

  return (
    <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
      {/* Audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Title */}
      {title && (
        <p className="text-white text-sm font-medium truncate">♪ {title}</p>
      )}

      {/* Scrubber */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs font-mono w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 rounded-full appearance-none bg-gray-700 accent-white cursor-pointer"
          />
          {/* Loop region overlay */}
          {loopStart !== null && loopEnd !== null && duration > 0 && (
            <div
              className="absolute top-0 h-1.5 bg-indigo-500/50 rounded-full pointer-events-none"
              style={{
                left: `${(loopStart / duration) * 100}%`,
                width: `${((loopEnd - loopStart) / duration) * 100}%`,
              }}
            />
          )}
        </div>
        <span className="text-gray-500 text-xs font-mono w-10">
          {formatTime(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-white text-gray-900 flex items-center justify-center text-base font-bold hover:bg-gray-100 active:scale-95 transition-all"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Section loop controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLoopPoint('start')}
            className="text-xs text-gray-400 hover:text-white bg-gray-800 rounded px-2 py-1 transition-colors"
            title="Set loop start at current position"
          >
            [A {loopStart !== null ? formatTime(loopStart) : '—'}
          </button>
          <button
            onClick={() => setLoopPoint('end')}
            className="text-xs text-gray-400 hover:text-white bg-gray-800 rounded px-2 py-1 transition-colors"
            title="Set loop end at current position"
          >
            B] {loopEnd !== null ? formatTime(loopEnd) : '—'}
          </button>

          {canLoop && (
            <button
              onClick={() => setIsLooping(l => !l)}
              className={`text-xs rounded px-2 py-1 transition-colors ${
                isLooping
                  ? 'bg-indigo-700 text-indigo-200'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {isLooping ? '⟳ Looping' : '⟳ Loop'}
            </button>
          )}

          {(loopStart !== null || loopEnd !== null) && (
            <button
              onClick={clearLoop}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
