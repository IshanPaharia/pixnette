const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE) || 512
const TOTAL = CANVAS_SIZE * CANVAS_SIZE

let canvasState = new Uint8Array(TOTAL).fill(0)

async function loadCanvasFromDB(pool) {
  const result = await pool.query('SELECT x, y, color FROM pixels')
  for (const row of result.rows) {
    if (row.x >= 0 && row.x < CANVAS_SIZE && row.y >= 0 && row.y < CANVAS_SIZE) {
      canvasState[row.y * CANVAS_SIZE + row.x] = row.color
    }
  }
  console.log(`Canvas loaded: ${result.rows.length} non-default pixels`)
}

function getPixel(x, y) {
  return canvasState[y * CANVAS_SIZE + x]
}

function setPixel(x, y, color) {
  canvasState[y * CANVAS_SIZE + x] = color
}

function getFullCanvas() {
  return Array.from(canvasState)  // plain array for JSON serialization
}

// Pending writes buffer: key = "x,y", value = color
const pendingWrites = new Map()

function queuePixelWrite(x, y, color, fingerprint) {
  pendingWrites.set(`${x},${y}`, { x, y, color, fingerprint })
}

let isFlushing = false

async function flushPendingWrites(pool) {
  if (isFlushing || pendingWrites.size === 0) return
  isFlushing = true

  const batch = Array.from(pendingWrites.values())
  pendingWrites.clear()

  const CHUNK_SIZE = 4000 // Safely below Postgres parameter limit of 65,535 (4000 * 4 = 16,000 params)
  
  for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
    const chunk = batch.slice(i, i + CHUNK_SIZE)
    const values = chunk.map((p, idx) =>
      `($${idx*4+1}, $${idx*4+2}, $${idx*4+3}, $${idx*4+4}, NOW())`
    ).join(', ')
    const params = chunk.flatMap(p => [p.x, p.y, p.color, p.fingerprint])

    try {
      await pool.query(
        `INSERT INTO pixels (x, y, color, fingerprint, placed_at)
         VALUES ${values}
         ON CONFLICT (x, y) DO UPDATE
         SET color = EXCLUDED.color,
             fingerprint = EXCLUDED.fingerprint,
             placed_at = EXCLUDED.placed_at`,
        params
      )
      console.log(`Flushed chunk of ${chunk.length} writes to DB`)
    } catch (err) {
      console.error(`❌ DB Flush Failed for chunk: ${err.message}`)
      // Safely restore only if no newer write was queued in the meantime
      chunk.forEach(p => {
        const key = `${p.x},${p.y}`
        if (!pendingWrites.has(key)) {
          pendingWrites.set(key, p)
        }
      })
    }
  }

  isFlushing = false
}

module.exports = { loadCanvasFromDB, getPixel, setPixel, getFullCanvas, canvasState, queuePixelWrite, flushPendingWrites }