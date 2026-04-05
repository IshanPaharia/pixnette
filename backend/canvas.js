const CANVAS_SIZE = parseInt(process.env.CANVAS_SIZE) || 512
const TOTAL = CANVAS_SIZE * CANVAS_SIZE

let canvasState = new Uint8Array(TOTAL).fill(0)

async function loadCanvasFromDB(pool) {
  const result = await pool.query('SELECT x, y, color FROM pixels')
  for (const row of result.rows) {
    canvasState[row.y * CANVAS_SIZE + row.x] = row.color
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

async function flushPendingWrites(pool) {
    if (pendingWrites.size === 0) return
    const batch = Array.from(pendingWrites.values())
    pendingWrites.clear()
    
    // Upsert all pending pixels in one query
    const values = batch.map((p, i) =>
        `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4}, NOW())`
).join(', ')
const params = batch.flatMap(p => [p.x, p.y, p.color, p.fingerprint])

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
        console.log(`Flushed ${batch.length} pixel writes to DB`)
    } catch (err) {
        console.error(`❌ DB Flush Failed: ${err.message}`)
        // Restore failed writes to the buffer (limited memory since it only holds 262144 unique pixels max for a 512x512 canvas)
        batch.forEach(p => queuePixelWrite(p.x, p.y, p.color, p.fingerprint))
    }
}

module.exports = { loadCanvasFromDB, getPixel, setPixel, getFullCanvas, canvasState, queuePixelWrite, flushPendingWrites }