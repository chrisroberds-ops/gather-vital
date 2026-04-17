import { useState, useEffect, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import { useAppConfig } from '@/services/app-config-context'
import { db, getChurchId } from '@/services'
import Button from '@/shared/components/Button'

// ── Types ─────────────────────────────────────────────────────────────────────

type WidgetType = 'visitor-form' | 'groups' | 'events'
type EmbedFormat = 'script' | 'iframe'

interface Widget {
  id: WidgetType
  label: string
  description: string
  icon: string
}

const WIDGETS: Widget[] = [
  { id: 'visitor-form', label: 'Visitor Form',   description: 'First-time visitor registration form',   icon: '👋' },
  { id: 'groups',       label: 'Group Browser',  description: 'Browsable list of open groups',          icon: '👥' },
  { id: 'events',       label: 'Event Browser',  description: 'Upcoming events with registration links', icon: '📅' },
]

const HEIGHT_PRESETS = [
  { label: 'Compact (400 px)',  value: '400px' },
  { label: 'Medium (560 px)',   value: '560px' },
  { label: 'Tall (720 px)',     value: '720px' },
  { label: 'Full-page (100vh)', value: '100vh' },
]

// ── QR helpers ────────────────────────────────────────────────────────────────

/** Renders a QR code to a canvas element using the local qrcode package. */
function QrCanvas({ data, size }: { data: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !data) return
    QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => { /* ignore — data may be empty during initial render */ })
  }, [data, size])

  return <canvas ref={canvasRef} width={size} height={size} />
}

/** Downloads the QR code for `data` as a PNG file. Generated locally — no network request. */
async function downloadQr(data: string, filename: string): Promise<void> {
  const dataUrl = await QRCode.toDataURL(data, {
    width: 300,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

// ── Code generation ───────────────────────────────────────────────────────────

function makeEmbedUrl(baseUrl: string, widget: WidgetType, church: string): string {
  const path = `/embed/${widget}`
  return church ? `${baseUrl}${path}?church=${encodeURIComponent(church)}` : `${baseUrl}${path}`
}

function makeScriptTag(baseUrl: string, widget: WidgetType, church: string, height: string): string {
  const attrs = [
    `  src="${baseUrl}/embed.js"`,
    `  data-gather-widget="${widget}"`,
    church ? `  data-gather-church="${church}"` : null,
    `  data-gather-height="${height}"`,
  ].filter(Boolean).join('\n')
  return `<script\n${attrs}>\n</script>`
}

function makeIframeTag(baseUrl: string, widget: WidgetType, church: string, height: string): string {
  const src = makeEmbedUrl(baseUrl, widget, church)
  return `<iframe\n  src="${src}"\n  width="100%"\n  height="${height}"\n  frameborder="0"\n  style="border-radius:8px"\n  loading="lazy"\n></iframe>`
}

// ── CopyBox ───────────────────────────────────────────────────────────────────

function CopyBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 px-2.5 py-1 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmbedsPage() {
  const { config } = useAppConfig()
  const [selectedWidget, setSelectedWidget] = useState<WidgetType>('visitor-form')
  const [format, setFormat] = useState<EmbedFormat>('script')
  const [height, setHeight] = useState('560px')
  const [qrDownloading, setQrDownloading] = useState(false)

  // Use the current browser origin as the base URL
  const baseUrl = window.location.origin

  // Look up the canonical church slug from the Church entity in the database.
  // This is the slug stored when the setup wizard or settings page last saved the
  // church name — it is the authoritative value for ?church=<slug> URLs.
  const [church, setChurch] = useState('')
  useEffect(() => {
    async function load() {
      const entity = await db.getChurch(getChurchId())
      setChurch(entity?.slug ?? '')
    }
    void load()
  }, [config.church_name]) // refresh whenever the name changes (wizard/settings just saved)

  const embedUrl = makeEmbedUrl(baseUrl, selectedWidget, church)
  const code = format === 'script'
    ? makeScriptTag(baseUrl, selectedWidget, church, height)
    : makeIframeTag(baseUrl, selectedWidget, church, height)

  const handleQrDownload = useCallback(async () => {
    setQrDownloading(true)
    try {
      await downloadQr(embedUrl, `gather-${selectedWidget}-qr.png`)
    } finally {
      setQrDownloading(false)
    }
  }, [embedUrl, selectedWidget])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Embed Widgets</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drop any widget onto your church website with a single line of code.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left column: configuration */}
        <div className="lg:col-span-3 space-y-6">

          {/* Widget selector */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Choose widget</h2>
            {WIDGETS.map(w => (
              <button
                key={w.id}
                onClick={() => setSelectedWidget(w.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                  selectedWidget === w.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-2xl flex-shrink-0">{w.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{w.label}</p>
                  <p className="text-xs text-gray-500">{w.description}</p>
                </div>
                {selectedWidget === w.id && (
                  <span className="ml-auto text-primary-600 text-sm">✓</span>
                )}
              </button>
            ))}
          </section>

          {/* Options */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Options</h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Height</label>
              <div className="flex flex-wrap gap-2">
                {HEIGHT_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setHeight(p.value)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                      height === p.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Embed format</label>
              <div className="flex gap-2">
                {([['script', 'Script tag (recommended)'], ['iframe', 'Plain iframe']] as const).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setFormat(k)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                      format === k
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Generated code */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Embed code
            </h2>
            <p className="text-xs text-gray-500">
              Paste this into your website's HTML where you want the widget to appear.
            </p>
            <CopyBox code={code} />

            <div className="pt-1">
              <p className="text-xs font-medium text-gray-600 mb-1">Direct URL</p>
              <CopyBox code={embedUrl} />
            </div>

            {format === 'script' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex gap-2">
                <span className="flex-shrink-0">⚠️</span>
                <span>
                  Replace <code className="bg-amber-100 px-1 rounded">{baseUrl}</code> with your
                  production URL when deploying. The script tag above uses the current browser origin.
                </span>
              </div>
            )}
          </section>
        </div>

        {/* Right column: QR code */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">QR Code</h2>
            <p className="text-xs text-gray-500">
              Print on bulletins or signage so visitors can scan to open the widget on their phone.
            </p>

            {/* QR preview */}
            <div className="flex justify-center">
              <div className="bg-white border border-gray-200 rounded-xl p-2 shadow-sm">
                <QrCanvas data={embedUrl} size={200} />
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={() => void handleQrDownload()}
                loading={qrDownloading}
                variant="secondary"
                className="w-full justify-center"
              >
                ↓ Download QR as PNG
              </Button>
              <p className="text-xs text-gray-400 text-center">
                300 × 300 px · suitable for print at up to 3"
              </p>
            </div>
          </section>

          {/* Live preview */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Live preview</h2>
            <p className="text-xs text-gray-500">How the widget looks when embedded.</p>
            <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '300px' }}>
              <iframe
                key={embedUrl}
                src={`/embed/${selectedWidget}`}
                width="100%"
                height="300"
                style={{ border: 'none', display: 'block' }}
                title={`${selectedWidget} preview`}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
