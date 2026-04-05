require('dotenv').config()
const express = require('express')
const http = require('http')
const crypto = require('crypto')
const { Server } = require('socket.io')
const { loadCanvasFromDB, flushPendingWrites, setPixel, queuePixelWrite } = require('./canvas')
const { isOnCooldown, setCooldown, getCooldownRemaining } = require('./cooldown')
const cors = require('cors')
const pool = require('./db')

const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE) || 512
const COOLDOWN_SECONDS = parseInt(process.env.COOLDOWN_SECONDS) || 30

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json())
app.use('/api', require('./routes/api'))

let connectedCount = 0

// --- Helpers ---

// Identifies a user by hashing their IP + User-Agent (no login needed)
function getFingerprint(socket) {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || socket.handshake.address
  const ua = socket.handshake.headers['user-agent'] || ''
  return crypto.createHash('sha256').update(ip + ua).digest('hex').slice(0, 16)
}

// Tracks how many place_pixel events a fingerprint sends per second
const eventRates = new Map() // fingerprint → { count, resetAt }

function checkRateLimit(fingerprint) {
  const now = Date.now()
  const entry = eventRates.get(fingerprint) || { count: 0, resetAt: now + 1000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 1000 }
  entry.count++
  eventRates.set(fingerprint, entry)
  return entry.count > 5 // true = rate limit exceeded → disconnect
}

// --- Socket.io Events ---

io.on('connection', (socket) => {
  const fingerprint = getFingerprint(socket)
  connectedCount++

  // Tell all clients the current user count
  io.emit('user_count', connectedCount)

  // Tell this new client how long their cooldown has left (0 if none)
  socket.emit('cooldown_sync', { remaining: getCooldownRemaining(fingerprint) })

  // Handle pixel placement
  socket.on('place_pixel', ({ x, y, color }) => {
    // Rate limit check — disconnect flood attackers
    if (checkRateLimit(fingerprint)) {
      socket.disconnect(true)
      return
    }

    // --- Validation ---
    const validTypes = typeof x === 'number' && typeof y === 'number' && typeof color === 'number'
    const validIntegers = Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(color)
    const validBounds = x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE
    const validColor = color >= 0 && color <= 15

    if (!validTypes || !validIntegers || !validBounds || !validColor) {
      socket.emit('place_error', { message: 'Invalid pixel data' })
      return
    }

    if (isOnCooldown(fingerprint)) {
      const remaining = getCooldownRemaining(fingerprint)
      socket.emit('place_error', { message: `Cooldown: ${remaining}s remaining` })
      return
    }

    // --- Valid placement ---
    setPixel(x, y, color)                        // update in-memory canvas
    queuePixelWrite(x, y, color, fingerprint)    // schedule DB write (batched)
    setCooldown(fingerprint)                     // start cooldown timer

    // Broadcast to ALL clients (frontend deduplicates its own placement)
    io.emit('pixel_update', { x, y, color })

    // Tell this client their new cooldown
    socket.emit('cooldown_sync', { remaining: COOLDOWN_SECONDS })
  })

  socket.on('disconnect', () => {
    connectedCount = Math.max(0, connectedCount - 1) // never go below 0
    io.emit('user_count', connectedCount)
  })
})

// --- Startup ---

// Load canvas from DB on startup, then start server
// If DB is unreachable (e.g. network blocked locally), start anyway with empty canvas
async function startServer() {
  try {
    await loadCanvasFromDB(pool)
    console.log('✅ Canvas loaded from DB')
  } catch (err) {
    console.warn('⚠️  Could not connect to DB on startup:', err.message)
    console.warn('⚠️  Starting with empty canvas — pixels will NOT persist until DB is reachable')
  }

  server.listen(process.env.PORT || 3001, () => {
    console.log(`🚀 Pixnette backend running on port ${process.env.PORT || 3001}`)
  })
}

startServer()


// Flush pending pixel writes to DB every WRITE_BATCH_INTERVAL_MS (default 2s)
setInterval(() => flushPendingWrites(pool), parseInt(process.env.WRITE_BATCH_INTERVAL_MS) || 2000)

// Graceful shutdown — flush pending writes before Railway kills the process
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — flushing writes before shutdown...')
  await flushPendingWrites(pool)
  process.exit(0)
})