const { pubClient } = require('./redis')
const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE) || 512
const TOTAL = CANVAS_SIZE * CANVAS_SIZE

async function loadCanvasFromDB(pool) {
  // Check if the canvas state is already cached in Redis and has the correct size
  const exists = await pubClient.exists('canvas:state')
  if (exists) {
    const len = await pubClient.strLen('canvas:state')
    if (len === TOTAL) {
      console.log('✅ Canvas state already cached in Redis')
      return
    }
    console.log(`⚠️ Canvas state cache size mismatch: expected ${TOTAL}, got ${len}. Reinitializing...`)
    await pubClient.del('canvas:state')
  }
  console.log('⏳ Canvas cache not found in Redis. Initializing from Postgres...')
  
  // 1. Create a blank buffer filled with 0s (representing background color)
  const buffer = Buffer.alloc(TOTAL, 0)
  // 2. Fetch all pixels from the database to populate the cache
  const result = await pool.query('SELECT x, y, color FROM pixels')
  for (const row of result.rows) {
    if (row.x >= 0 && row.x < CANVAS_SIZE && row.y >= 0 && row.y < CANVAS_SIZE) {
      buffer[row.y * CANVAS_SIZE + row.x] = row.color
    }
  }
  // 3. Save the initial buffer to Redis
  await pubClient.set('canvas:state', buffer)
  console.log(`✅ Canvas initialized in Redis with ${result.rows.length} pixels from Postgres`)
}

async function getPixel(x, y) {
  const offset = y * CANVAS_SIZE + x
  // Fetch the 1-byte range from Redis as a raw buffer using client withCommandOptions
  const result = await pubClient.withCommandOptions({ returnBuffers: true }).getRange('canvas:state', offset, offset)
  return result.length > 0 ? result[0] : 0
}

async function setPixel(x, y, color) {
  const offset = y * CANVAS_SIZE + x
  // Use SETRANGE to write a single byte at a specific offset
  await pubClient.setRange('canvas:state', offset, Buffer.from([color]))
}

async function getFullCanvas() {
  const result = await pubClient.withCommandOptions({ returnBuffers: true }).get('canvas:state')
  if (!result) {
    return new Array(TOTAL).fill(0)
  }
  return Array.from(result)
}

module.exports = { loadCanvasFromDB, getPixel, setPixel, getFullCanvas }                                                