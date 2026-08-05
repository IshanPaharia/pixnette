require('dotenv').config()
const express = require('express')
const http = require('http')
const crypto = require('crypto')
const { Server } = require('socket.io')
const { loadCanvasFromDB, setPixel, getPixel } = require('./canvas.js')
const { queuePixelWrite, flushQueueToPostgres, recoverInterruptedFlushes } = require('./writeQueue.js')
const { isOnCooldown, setCooldown, getCooldownRemaining, addExemptUser } = require('./cooldown.js')
const cors = require('cors')
const pool = require('./db')
const { createAdapter } = require('@socket.io/redis-adapter')
const { pubClient, subClient, connectRedis } = require('./redis.js')

const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE, 10) || 64
const COOLDOWN_SECONDS = parseInt(process.env.COOLDOWN_SECONDS, 10) || 30
const BYPASS_SECRET = process.env.BYPASS_SECRET

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST']
  }
})

app.use(cors({ origin: FRONTEND_URL }))
app.use(express.json())
app.use('/api', require('./routes/api'))

// --- Helpers ---

// Identifies a user by hashing their IP + User-Agent (no login needed)
function getFingerprint(socket) {
  // Use client-generated UUID if provided
  const deviceId = socket.handshake.auth?.deviceId;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (deviceId && typeof deviceId === 'string' && uuidRegex.test(deviceId)) {
    return deviceId;
  }

  // Fallback to IP + User-Agent hash
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

// Periodic rate limiting cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [fp, entry] of eventRates.entries()) {
    if (now > entry.resetAt) {
      eventRates.delete(fp)
    }
  }
}, 60 * 1000)

// --- Socket.io Events ---

io.on('connection', async (socket) => { // Added 'async'
  const fingerprint = getFingerprint(socket)

  // Auto-exempt if secret key was provided in socket handshake auth
  const providedSecret = socket.handshake.auth?.secretKey
  if (BYPASS_SECRET && providedSecret && providedSecret === BYPASS_SECRET) {
    await addExemptUser(fingerprint)
  }

  console.log(`🔌 Client connected on port ${process.env.PORT || 3001} (Fingerprint: ${fingerprint})`);
  // Tell all clients the current user count
  try {
    const sockets = await io.fetchSockets()
    console.log(`📊 Total cluster sockets fetched: ${sockets.length}`);
    
    io.emit('user_count', sockets.length)
  } catch (err) {
    console.error('Failed to fetch sockets:', err)
  }

  // Tell this new client how long their cooldown has left (0 if none)
  try {
    const remaining = await getCooldownRemaining(fingerprint)
    socket.emit('cooldown_sync', { remaining })
  } catch (err) {
    console.error(`Failed to get cooldown for fingerprint ${fingerprint}:`, err.message)
    socket.emit('cooldown_sync', { remaining: 0 })
  }

  // Handle secret key validation
  socket.on('verify_secret_key', async ({ secretKey } = {}, callback) => {
    try {
      if (BYPASS_SECRET && secretKey && secretKey === BYPASS_SECRET) {
        await addExemptUser(fingerprint)
        socket.emit('cooldown_sync', { remaining: 0 })
        if (typeof callback === 'function') {
          callback({ success: true })
        }
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Invalid secret key' })
        }
      }
    } catch (err) {
      console.error('Error verifying secret key:', err)
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Server error' })
      }
    }
  })

  // Handle pixel placement
  socket.on('place_pixel', async (data) => { // Added 'async'
    try {
      if (checkRateLimit(fingerprint)) {
        socket.disconnect(true)
        return
      }

      if (!data || typeof data !== 'object') {
        socket.emit('place_error', { message: 'Invalid payload format' })
        return
      }

      const { x, y, color } = data

      const validTypes = typeof x === 'number' && typeof y === 'number' && typeof color === 'number'
      const validIntegers = Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(color)
      const validBounds = x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE
      const validColor = color >= 0 && color <= 15

      if (!validTypes || !validIntegers || !validBounds || !validColor) {
        const origColor = (validBounds && validIntegers) ? await getPixel(x, y) : 0
        socket.emit('place_error', { message: 'Invalid pixel data', x, y, color: origColor })
        return
      }

      if (await isOnCooldown(fingerprint)) {
        const remaining = await getCooldownRemaining(fingerprint)
        const origColor = await getPixel(x, y)
        socket.emit('place_error', { message: `Cooldown: ${remaining}s remaining`, x, y, color: origColor })
        return
      }

      await setPixel(x, y, color)
      await queuePixelWrite(x, y, color, fingerprint)
      await setCooldown(fingerprint)

      io.emit('pixel_update', { x, y, color })
      socket.emit('cooldown_sync', { remaining: COOLDOWN_SECONDS })
    } catch (err) {
      console.error('Error placing pixel:', err)
      socket.emit('place_error', { message: 'Server error processing pixel placement' })
    }
  })

  // 2. Fetch cluster-wide sockets and broadcast on disconnect
  socket.on('disconnect', async () => { // Added 'async'

    console.log(`❌ Client disconnected from port ${process.env.PORT || 3001}`);

    try {
      const sockets = await io.fetchSockets()
      console.log(`📊 Total cluster sockets fetched: ${sockets.length}`);
      io.emit('user_count', sockets.length)
    } catch (err) {
      console.error('Failed to fetch sockets on disconnect:', err)
    }
  })
})

// --- Startup ---

// Load canvas from DB on startup, then start server
// If DB is unreachable (e.g. network blocked locally), start anyway with empty canvas
async function startServer() {
  try {
    // Connect to Redis first, since Socket.io requires it
    await connectRedis();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.io Redis adapter attached');
    await recoverInterruptedFlushes();
  } catch (err) {
    console.error('❌ Failed to initialize Redis on startup:', err.message);
    process.exit(1); // Exit because the scaling tier requires Redis to run
  }

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
const flushInterval = setInterval(() => flushQueueToPostgres(pool), parseInt(process.env.WRITE_BATCH_INTERVAL_MS) || 2000)

// Graceful shutdown handler
const handleShutdown = async (signal) => {
  console.log(`\n${signal} received — flushing writes and closing pool...`)
  clearInterval(flushInterval)
  await flushQueueToPostgres(pool)
  try {
    await pool.end()
    console.log('✅ Database connections closed gracefully')
  } catch (err) {
    console.error('❌ Error closing database connections:', err.message)
  }
  process.exit(0)
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'))
process.on('SIGINT', () => handleShutdown('SIGINT'))
