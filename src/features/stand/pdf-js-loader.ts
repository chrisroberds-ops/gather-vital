/**
 * Loads PDF.js from the CDN and sets the worker URL.
 *
 * Returns true if PDF.js is available and ready, false if loading failed
 * (e.g. CDN unreachable, network offline).  The promise is cached so the
 * script tag is only injected once per page lifetime.
 */

const PDF_JS_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDF_WORKER_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsLib = { GlobalWorkerOptions: { workerSrc: string }; getDocument: any }

let loadPromise: Promise<boolean> | null = null

export function loadPdfJs(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)

  // Already loaded
  if ((window as unknown as { pdfjsLib?: PdfjsLib }).pdfjsLib) {
    return Promise.resolve(true)
  }

  if (loadPromise) return loadPromise

  loadPromise = new Promise<boolean>(resolve => {
    const script = document.createElement('script')
    script.src = PDF_JS_URL
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfjsLib }).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL
        resolve(true)
      } else {
        resolve(false)
      }
    }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })

  return loadPromise
}

/** Resets the loader (test helper). */
export function _resetPdfJsLoader() {
  loadPromise = null
}
