#!/usr/bin/env node
/**
 * Gather Print Server  v1.0
 *
 * Receives label print jobs from the Gather kiosk (POST /print) and forwards
 * them to PrintNode's cloud print API. PrintNode relays the job to a physical
 * label printer (Zebra ZD220, ZD410, DYMO 450, etc.) installed on this machine.
 *
 * Requirements:
 *   - Node.js 18 or later (uses native fetch + http)
 *   - A PrintNode account: https://www.printnode.com
 *   - PrintNode client installed on this machine (downloads at printnode.com/download)
 *
 * Environment variables (copy .env.example → .env and fill in):
 *   PRINTNODE_API_KEY        Your PrintNode API key (required)
 *   PRINTNODE_PRINTER_ID     Default printer ID for all labels (required)
 *   PRINTNODE_CHILD_PRINTER_ID  Override printer for child labels (optional)
 *   PRINTNODE_PARENT_PRINTER_ID Override printer for parent tags (optional)
 *   PORT                     HTTP port to listen on (default: 3001)
 *   ALLOWED_ORIGIN           CORS origin to allow (default: http://localhost:5173)
 *
 * Usage:
 *   cd print-server
 *   npm install         # first time only
 *   node index.js
 *
 * Or run as a background service with PM2:
 *   npm install -g pm2
 *   pm2 start print-server/index.js --name gather-print
 *   pm2 save && pm2 startup
 */

'use strict'

const http = require('http')
const { Buffer } = require('buffer')

// ── Config ────────────────────────────────────────────────────────────────────

// Load .env file if present (no dotenv dependency — plain parsing)
;(function loadEnv() {
  const fs = require('fs')
  const path = require('path')
  const envFile = path.join(__dirname, '.env')
  if (!fs.existsSync(envFile)) return
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
})()

const PRINTNODE_API_KEY       = process.env.PRINTNODE_API_KEY
const PRINTNODE_PRINTER_ID    = process.env.PRINTNODE_PRINTER_ID
const CHILD_PRINTER_ID        = process.env.PRINTNODE_CHILD_PRINTER_ID ?? PRINTNODE_PRINTER_ID
const PARENT_PRINTER_ID       = process.env.PRINTNODE_PARENT_PRINTER_ID ?? PRINTNODE_PRINTER_ID
const PORT                    = parseInt(process.env.PORT ?? '3001', 10)
const ALLOWED_ORIGIN          = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'

// ── ZPL label builders ────────────────────────────────────────────────────────
// Targets a 2.25" × 1.25" label at 203 DPI (457 × 254 dots).
// Adjust FO coordinates if your label stock is a different size.

/**
 * Build ZPL for the child's name badge (goes on the child's shirt/lanyard).
 * @param {import('../src/services/print-service').LabelData} label
 * @returns {string} ZPL string
 */
function buildChildZpl(label) {
  const name = label.childName.toUpperCase().substring(0, 26)
  const allergyLine = label.allergies
    ? `^FO10,110^CF0,22^FR^FD ⚠ ${label.allergies.substring(0, 22)} ^FS`
    : ''
  const gradeLine = label.grade
    ? `^FO10,85^CF0,20^FDGrade: ${label.grade}^FS`
    : ''
  const yCode = label.allergies ? 138 : (label.grade ? 112 : 88)

  return [
    '^XA',
    '^FX Child name badge',
    `^FO10,10^CF0,36^FD${name}^FS`,
    gradeLine,
    allergyLine,
    `^FO10,${yCode}^CF0,24^FDCode: ^FB100,1,,L^FD${label.pickupCode}^FS`,
    `^FO260,${yCode}^CF0,18^FD${label.sessionDate}^FS`,
    `^FO260,${yCode + 22}^CF0,18^FD${label.sessionTime}^FS`,
    '^XZ',
  ].filter(Boolean).join('\n')
}

/**
 * Build ZPL for the parent pickup tag (stub returned to the parent at drop-off).
 * @param {import('../src/services/print-service').LabelData} label
 * @returns {string} ZPL string
 */
function buildParentZpl(label) {
  const childFirst = label.childName.split(' ')[0].toUpperCase()
  const initial    = (label.childName.split(' ').pop() ?? '')[0]?.toUpperCase() ?? ''

  return [
    '^XA',
    '^FX Parent pickup tag',
    '^FO10,10^CF0,22^FDPARENT PICKUP TAG^FS',
    `^FO10,42^CF0,34^FD${childFirst} ${initial}. — ${label.pickupCode}^FS`,
    `^FO10,86^CF0,20^FD${label.sessionDate} • ${label.sessionTime}^FS`,
    '^XZ',
  ].join('\n')
}

// ── PrintNode API ─────────────────────────────────────────────────────────────

/**
 * Submit a ZPL print job to PrintNode.
 * @param {string} printerId
 * @param {string} title
 * @param {string} zpl
 */
async function submitPrintJob(printerId, title, zpl) {
  if (!PRINTNODE_API_KEY) {
    throw new Error('PRINTNODE_API_KEY is not set in print-server/.env')
  }
  if (!printerId) {
    throw new Error('PRINTNODE_PRINTER_ID is not set in print-server/.env')
  }

  const authHeader = 'Basic ' + Buffer.from(`${PRINTNODE_API_KEY}:`).toString('base64')
  const body = JSON.stringify({
    printerId: parseInt(printerId, 10),
    title,
    contentType: 'raw_base64',
    content: Buffer.from(zpl).toString('base64'),
    source: 'Gather Kids Check-In',
  })

  const res = await fetch('https://api.printnode.com/printjobs', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`PrintNode API error ${res.status}: ${detail}`)
  }

  const jobId = await res.json()
  console.log(`[print-server] Job submitted to PrintNode — jobId: ${jobId}, printer: ${printerId}`)
  return jobId
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

/**
 * Parse request body as JSON.
 * @param {http.IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

/**
 * Send a JSON response.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(json)
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', printer: PRINTNODE_PRINTER_ID ?? 'not configured' })
    return
  }

  // Print endpoint
  if (req.method === 'POST' && req.url === '/print') {
    try {
      const payload = await readBody(req)
      const { kioskId, checkinId, childLabel, parentTag } = payload

      if (!childLabel || !parentTag) {
        sendJson(res, 400, { error: 'childLabel and parentTag are required' })
        return
      }

      const title = `${childLabel.childName} — ${checkinId}`

      const [childJobId, parentJobId] = await Promise.all([
        submitPrintJob(CHILD_PRINTER_ID, `Child: ${title}`, buildChildZpl(childLabel)),
        submitPrintJob(PARENT_PRINTER_ID, `Parent: ${title}`, buildParentZpl(parentTag)),
      ])

      console.log(`[print-server] ✓ Labels printed for ${childLabel.childName} (kiosk: ${kioskId})`)
      sendJson(res, 200, { ok: true, childJobId, parentJobId })
    } catch (err) {
      console.error('[print-server] Print error:', err)
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

// ── Startup ───────────────────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🖨  Gather Print Server running on http://127.0.0.1:${PORT}`)
  if (!PRINTNODE_API_KEY) {
    console.warn('⚠  PRINTNODE_API_KEY is not set — print jobs will fail until you configure it.')
  } else {
    console.log(`   PrintNode printer: ${PRINTNODE_PRINTER_ID ?? '(not set)'}`)
  }
  console.log('   POST /print  → submit a label job')
  console.log('   GET  /health → server status\n')
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.`)
    console.error('   Run: lsof -i :3001   to find what is using it.')
  } else {
    console.error('[print-server] Server error:', err)
  }
  process.exit(1)
})
