/**
 * Metronome component.
 * Drives an audio or visual (edge flash) beat from a song's BPM.
 * Visual flash mode dims the UI and pulses the screen edges on each beat.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

interface MetronomeProps {
  bpm: number
  /** When true, show just the visual flash indicator (no audio). */
  visualOnly?: boolean
  className?: string
}

export default function Metronome({ bpm, visualOnly = false, className = '' }: MetronomeProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [beat, setBeat] = useState(false)
  const [mode, setMode] = useState<'audio' | 'visual'>('audio')
  const audioCtxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const tick = useCallback(() => {
    setBeat(true)
    setTimeout(() => setBeat(false), 80)

    if (mode === 'audio' && !visualOnly) {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext()
        }
        const ctx = audioCtxRef.current
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.08)
      } catch {}
    }
  }, [mode, visualOnly])

  useEffect(() => {
    if (isRunning && bpm > 0) {
      const interval = Math.round(60000 / bpm)
      intervalRef.current = setInterval(tick, interval)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, bpm, tick])

  function toggleRunning() {
    setIsRunning(r => !r)
  }

  const effectiveMode = visualOnly ? 'visual' : mode

  return (
    <>
      {/* Screen-edge flash for visual mode */}
      {effectiveMode === 'visual' && beat && isRunning && (
        <div
          className="pointer-events-none fixed inset-0 z-50"
          style={{
            boxShadow: 'inset 0 0 0 8px rgba(255,255,255,0.85)',
            transition: 'box-shadow 80ms ease-out',
          }}
        />
      )}

      <div className={`flex flex-col items-center gap-3 ${className}`}>
        {/* BPM display */}
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full transition-colors duration-75 ${beat && isRunning ? 'bg-white' : 'bg-gray-700'}`}
          />
          <span className="text-white font-mono text-xl font-bold">{bpm}</span>
          <span className="text-gray-500 text-sm">BPM</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleRunning}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
              isRunning
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            {isRunning ? '⏸ Stop' : '▶ Start'}
          </button>

          {!visualOnly && (
            <button
              onClick={() => setMode(m => m === 'audio' ? 'visual' : 'audio')}
              className="text-xs text-gray-400 hover:text-white transition-colors"
              title="Toggle audio/visual metronome"
            >
              {mode === 'audio' ? '👁 Visual' : '🔊 Audio'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
