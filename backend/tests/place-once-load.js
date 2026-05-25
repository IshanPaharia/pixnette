const { io } = require('socket.io-client')
const crypto = require('crypto')

const target = process.env.TARGET || 'https://api.pixnette.site'
const users = Number.parseInt(process.env.USERS || '300', 10)
const canvasSize = Number.parseInt(process.env.CANVAS_SIZE || '64', 10)
const startIntervalMs = Number.parseInt(process.env.START_INTERVAL_MS || '1200', 10)
const holdBeforeMs = Number.parseInt(process.env.HOLD_BEFORE_MS || '10000', 10)
const holdAfterMs = Number.parseInt(process.env.HOLD_AFTER_MS || '10000', 10)
const timeoutMs = Number.parseInt(process.env.PLACE_TIMEOUT_MS || '15000', 10)

const stats = {
  started: 0,
  connected: 0,
  placed: 0,
  failed: 0,
  disconnected: 0
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function makePixel() {
  return {
    x: randomInt(0, canvasSize - 1),
    y: randomInt(0, canvasSize - 1),
    color: randomInt(0, 15)
  }
}

function printProgress() {
  process.stdout.write(
    `\rstarted=${stats.started}/${users} connected=${stats.connected} placed=${stats.placed} failed=${stats.failed} disconnected=${stats.disconnected}`
  )
}

function runUser(index) {
  stats.started++

  return new Promise((resolve) => {
    const deviceId = crypto.randomUUID()
    const socket = io(target, {
      auth: { deviceId },
      extraHeaders: {
        'User-Agent': `pixnette-load-test/${deviceId}`
      },
      transports: ['websocket'],
      upgrade: false,
      reconnection: false,
      timeout: timeoutMs
    })

    let done = false
    let placed = false
    let timeout

    function finish(ok, reason) {
      if (done) return
      done = true
      clearTimeout(timeout)

      if (ok) {
        stats.placed++
      } else {
        stats.failed++
        console.log(`\nuser ${index} failed: ${reason}`)
      }

      setTimeout(() => {
        socket.disconnect()
        resolve()
      }, ok ? holdAfterMs : 0)
    }

    socket.on('connect', () => {
      stats.connected++
      printProgress()

      setTimeout(() => {
        timeout = setTimeout(() => {
          finish(false, 'timed out waiting for successful cooldown_sync')
        }, timeoutMs)

        socket.emit('place_pixel', makePixel())
      }, holdBeforeMs)
    })

    socket.on('cooldown_sync', ({ remaining } = {}) => {
      if (placed || !Number.isFinite(remaining) || remaining <= 0) return
      placed = true
      finish(true)
    })

    socket.on('place_error', ({ message } = {}) => {
      finish(false, message || 'place_error')
    })

    socket.on('connect_error', (err) => {
      finish(false, `connect_error: ${err.message}`)
    })

    socket.on('disconnect', () => {
      stats.disconnected++
      printProgress()
    })
  })
}

async function main() {
  console.log(`target=${target}`)
  console.log(`users=${users} startIntervalMs=${startIntervalMs} holdBeforeMs=${holdBeforeMs} holdAfterMs=${holdAfterMs}`)

  const pending = []

  for (let i = 1; i <= users; i++) {
    pending.push(runUser(i))
    printProgress()
    await new Promise((resolve) => setTimeout(resolve, startIntervalMs))
  }

  await Promise.all(pending)
  printProgress()
  console.log('\nDone.')

  if (stats.placed !== users) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
