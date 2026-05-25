const { pubClient } = require('./redis.js')

async function queuePixelWrite(x, y, color, fingerprint) {
  const field = `${x},${y}`
  const timestamp = Date.now()
  const value = `${color}:${fingerprint}:${timestamp}`
  await pubClient.hSet('pixel:write:queue', field, value)
}

let isFlushing = false

async function flushQueueToPostgres(pool) {
  if (isFlushing) return
  isFlushing = true

  const tempKey = `pixel:write:flush:${Date.now()}`

  try {
    // 1. Check if there are any pending writes in the queue
    const exists = await pubClient.exists('pixel:write:queue')
    if (!exists) {
      isFlushing = false
      return
    }

    // 2. Rename the queue key atomically to create a lock
    await pubClient.rename('pixel:write:queue', tempKey)
  } catch (err) {
    // Catch when key didn't exist between check and rename
    isFlushing = false
    return
  }

  // 3. Fetch all entries from the temp key
  let tempWrites = {}
  try {
    tempWrites = await pubClient.hGetAll(tempKey)
  } catch (err) {
    console.error('❌ Failed to fetch temp writes from Redis:', err.message)
    isFlushing = false
    return
  }

  // 4. Map entries to objects
  const batch = []
  for (const [field, value] of Object.entries(tempWrites)) {
    const [xStr, yStr] = field.split(',')
    const [colorStr, fingerprint, timestampStr] = value.split(':')
    batch.push({
      x: parseInt(xStr, 10),
      y: parseInt(yStr, 10),
      color: parseInt(colorStr, 10),
      fingerprint,
      timestamp: parseInt(timestampStr, 10),
      rawValue: value
    })
  }

  if (batch.length === 0) {
    await pubClient.del(tempKey)
    isFlushing = false
    return
  }

  // 5. Bulk write chunked records to Postgres
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const CHUNK_SIZE = 4000
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE)
      const values = chunk.map((p, idx) =>
        `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4}, NOW())`
      ).join(', ')
      const params = chunk.flatMap(p => [p.x, p.y, p.color, p.fingerprint])
      // 1. Upsert current pixel state using the transaction client
      await client.query(
        `INSERT INTO pixels (x, y, color, fingerprint, placed_at)
         VALUES ${values}
         ON CONFLICT (x, y) DO UPDATE
         SET color = EXCLUDED.color,
             fingerprint = EXCLUDED.fingerprint,
             placed_at = EXCLUDED.placed_at`,
        params
      )
      // 2. Append history entries using the transaction client
      const historyValues = chunk.map((p, idx) =>
        `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`
      ).join(', ')
      await client.query(
        `INSERT INTO pixel_history (x, y, color, fingerprint)
         VALUES ${historyValues}`,
        params
      )
    }
    await client.query('COMMIT')
    console.log(`✅ Flushed batch of ${batch.length} writes to DB and pixel_history`)
    // Success: Delete the temp key
    await pubClient.del(tempKey)
  } catch (dbErr) {
    await client.query('ROLLBACK')
    console.error('❌ Database bulk-write failed. Rollback executed. Starting merge-back recovery:', dbErr.message)
    try {
      // 6. Safe Merge-back rollback
      const activeQueue = await pubClient.hGetAll('pixel:write:queue')
      for (const item of batch) {
        const field = `${item.x},${item.y}`
        const activeValue = activeQueue[field]
        let shouldRequeue = true
        if (activeValue) {
          const [, , activeTimestampStr] = activeValue.split(':')
          const activeTimestamp = parseInt(activeTimestampStr, 10)
          
          if (activeTimestamp > item.timestamp) {
            shouldRequeue = false
          }
        }
        if (shouldRequeue) {
          await pubClient.hSet('pixel:write:queue', field, item.rawValue)
        }
      }
      console.log(`✅ Completed merge-back recovery. Restored failed writes.`);
      await pubClient.del(tempKey)
    } catch (recoveryErr) {
      console.error('❌ CRITICAL: Failed to run merge-back recovery:', recoveryErr.message)
    }
  } finally {
    client.release()
  }
  isFlushing = false
}

module.exports = { queuePixelWrite, flushQueueToPostgres }